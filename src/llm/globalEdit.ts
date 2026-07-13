// Whole-deck conversational edit, step 1 of 2: the PLANNER. One cheap call
// sees the full deck digest + the user's global instruction ("整体更口语化"
// "每页补一个真实例子" "砍到 8 页") and decides WHICH pages change and HOW —
// with cross-page awareness (varied examples, consistent terms) that per-page
// rewrites alone can't have. Step 2 executes rewrites through the existing
// regenerateSlide pipeline; drops and moves are applied locally in one
// recompose (no LLM cost) and the player is remounted.
//
// v2 supports rewrite + drop + move. Still unsupported: adding pages and
// changing layouts (both need content synthesis beyond a single-page rewrite).

import type { Deck, Slide } from '../types'
import type { LlmSettings } from './settings'
import { requestText } from './client'
import { extractJson } from './extractJson'
import { t } from '../i18n'

export type GlobalEditAction = 'rewrite' | 'drop' | 'move'

export interface GlobalEditOp {
  /** 1-based page number in the CURRENT deck. */
  page: number
  action: GlobalEditAction
  /** rewrite: self-contained instruction; drop: optional reason (display only). */
  instruction?: string
  /** move: 1-based target position (kept inside the cover…end content zone). */
  to?: number
}

const PLAN_SYSTEM = `你是课件整册修改的规划师。给定一份课件的逐页摘要和用户的全局修改要求，输出一个修改计划。

严格只输出一个 JSON 对象，不要解释或代码块标记：
{ "ops": [
  { "page": 3, "action": "rewrite", "instruction": "这一页具体怎么改（自包含）" },
  { "page": 5, "action": "drop", "instruction": "删除原因（一句话）" },
  { "page": 4, "action": "move", "to": 2 }
] }

规则：
1. 只列**真正需要修改**的页——与要求无关的页绝不列入；全篇都不需要改就输出 {"ops":[]}。
2. rewrite 的 instruction 必须**自包含且具体**：执行者只能看到这一页和这条指令。补例子时各页例子不能雷同；统一术语时写明目标术语。
3. drop 用于删除信息量低、重复或与要求不符的页（如“砍到 N 页”“删掉重复内容”）；instruction 写一句删除原因。**绝不删除封面(cover)与结束页(end)**。
4. move 用于调整页面顺序，to 为目标页号；**绝不移动封面与结束页**，也不要把内容页移到它们之外。
5. 每页最多一个操作。当前版本**不支持新增页、不支持更换版式**——这类要求忽略并只做能做的部分。
6. instruction 与课件同语言。`

function digest(deck: Deck): string {
  const brief = (s: Slide): string => {
    const parts: string[] = []
    if (s.bullets?.length) parts.push(`要点:${s.bullets.map((b) => (typeof b === 'string' ? b : '')).filter(Boolean).join('；').slice(0, 80)}`)
    if (s.value) parts.push(`数字:${s.value}`)
    if (s.text) parts.push(`引文:${String(s.text).slice(0, 40)}`)
    if (s.body) parts.push(`正文:${String(s.body).slice(0, 60)}`)
    if (s.items?.length) parts.push(`对比:${s.items.map((i) => i.heading).join(' vs ')}`)
    if (s.steps?.length) parts.push(`步骤:${s.steps.map((st) => st.label).join('→')}`)
    return parts.join('｜').slice(0, 120)
  }
  return deck.slides
    .map((s, i) => `${i + 1}. [${s.layout}] ${s.title ?? s.value ?? ''}${brief(s) ? ` ——${brief(s)}` : ''}`)
    .join('\n')
}

/** Ask the model for a per-page edit plan; invalid ops are filtered locally. */
export async function planGlobalEdit(
  deck: Deck,
  instruction: string,
  settings: LlmSettings,
  signal?: AbortSignal,
): Promise<GlobalEditOp[]> {
  const user =
    `课件标题：${deck.title}\n共 ${deck.slides.length} 页，逐页摘要：\n${digest(deck)}\n\n` +
    `用户的全局修改要求：${instruction}\n\n请输出修改计划 JSON。只输出 JSON。`
  const text = await requestText(PLAN_SYSTEM, user, settings, { signal, maxTokens: 2000 })
  const parsed = extractJson(text) as { ops?: unknown }
  if (!Array.isArray(parsed.ops)) throw new Error(t('err.noJson'))

  // Distrust the plan: page in range, valid action, cover/end untouchable by
  // structural ops, rewrite needs an instruction, move needs a sane target,
  // one op per page, hard cap.
  const n = deck.slides.length
  const seen = new Set<number>()
  const ops: GlobalEditOp[] = []
  for (const item of parsed.ops) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const page = typeof o.page === 'number' ? Math.round(o.page) : NaN
    if (!Number.isInteger(page) || page < 1 || page > n || seen.has(page)) continue
    const action = (typeof o.action === 'string' ? o.action : 'rewrite') as GlobalEditAction
    if (!['rewrite', 'drop', 'move'].includes(action)) continue
    const instr = typeof o.instruction === 'string' ? o.instruction.trim() : ''
    const isEdge = page === 1 || page === n
    if (action === 'rewrite') {
      if (!instr) continue
      ops.push({ page, action, instruction: instr })
    } else if (isEdge) {
      continue // cover/end are structural anchors
    } else if (action === 'drop') {
      ops.push({ page, action, instruction: instr || undefined })
    } else {
      const to = typeof o.to === 'number' ? Math.round(o.to) : NaN
      if (!Number.isInteger(to) || to < 2 || to > n - 1 || to === page) continue
      ops.push({ page, action, to })
    }
    seen.add(page)
    if (ops.length >= 20) break
  }
  return ops.sort((a, b) => a.page - b.page)
}

/**
 * Apply the plan's structural ops (drops, then moves in plan order) to a
 * slide array in ONE recompose. Move targets are clamped inside the
 * cover…end zone of the current (post-drop) array. Pure — returns a new array.
 */
export function recomposeSlides(slides: Slide[], ops: GlobalEditOp[]): Slide[] {
  const dropSet = new Set(ops.filter((o) => o.action === 'drop').map((o) => o.page))
  let arr = slides.map((s, i) => ({ s, orig: i + 1 })).filter((x) => !dropSet.has(x.orig))
  for (const op of ops) {
    if (op.action !== 'move') continue
    const from = arr.findIndex((x) => x.orig === op.page)
    if (from < 0) continue
    const [item] = arr.splice(from, 1)
    const at = Math.max(1, Math.min(arr.length - 1, (op.to ?? 2) - 1))
    arr.splice(at, 0, item)
  }
  return arr.map((x) => x.s)
}
