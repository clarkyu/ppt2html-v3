// Whole-deck conversational edit, step 1 of 2: the PLANNER. One cheap call
// sees the full deck digest + the user's global instruction ("整体更口语化"
// "每页补一个真实例子" "砍到 8 页") and decides WHICH pages change and HOW —
// with cross-page awareness (varied examples, consistent terms) that per-page
// rewrites alone can't have. Step 2 executes rewrites/relayouts through the
// single-page LLM pipeline and synthesizes new pages; drops, moves and inserts
// are then applied locally in ONE recompose and the player is remounted.
//
// v3 supports rewrite + drop + move + add (new page after an anchor) +
// relayout (re-express a page in another layout).

import { LAYOUTS, type Deck, type Slide, type SlideLayout } from '../types'
import type { LlmSettings } from './settings'
import { requestText } from './client'
import { extractJson } from './extractJson'
import { t } from '../i18n'

export type GlobalEditAction = 'rewrite' | 'drop' | 'move' | 'add' | 'relayout'

export interface GlobalEditOp {
  /** 1-based page number in the CURRENT deck. For `add`: the new page goes AFTER this page. */
  page: number
  action: GlobalEditAction
  /** rewrite/add: self-contained instruction; drop: optional reason (display only). */
  instruction?: string
  /** move: 1-based target position (kept inside the cover…end content zone). */
  to?: number
  /** relayout: the target layout (validated: content layouts only). */
  layout?: SlideLayout
  /** add: the generated slide, filled in by the executor before the recompose. */
  slide?: Slide
}

/** Layouts a plan may target — everything except the cover/end anchors. */
const CONTENT_LAYOUTS = new Set<string>(LAYOUTS.filter((l) => l !== 'cover' && l !== 'end'))

const PLAN_SYSTEM = `你是课件整册修改的规划师。给定一份课件的逐页摘要和用户的全局修改要求，输出一个修改计划。

严格只输出一个 JSON 对象，不要解释或代码块标记：
{ "ops": [
  { "page": 3, "action": "rewrite", "instruction": "这一页具体怎么改（自包含）" },
  { "page": 5, "action": "drop", "instruction": "删除原因（一句话）" },
  { "page": 4, "action": "move", "to": 2 },
  { "page": 6, "action": "add", "instruction": "新页写什么（自包含：主题、要点方向）" },
  { "page": 7, "action": "relayout", "layout": "timeline", "instruction": "可选：转换侧重点" }
] }

规则：
1. 只列**真正需要修改**的页——与要求无关的页绝不列入；全篇都不需要改就输出 {"ops":[]}。
2. rewrite 的 instruction 必须**自包含且具体**：执行者只能看到这一页和这条指令。补例子时各页例子不能雷同；统一术语时写明目标术语。
3. drop 用于删除信息量低、重复或与要求不符的页（如“砍到 N 页”“删掉重复内容”）；instruction 写一句删除原因。**绝不删除封面(cover)与结束页(end)**。
4. move 用于调整页面顺序，to 为目标页号；**绝不移动封面与结束页**，也不要把内容页移到它们之外。
5. add 用于新增一页：新页插在**第 page 页之后**（不能插在结束页之后）；instruction 必须自包含——写清新页的主题与要点方向，执行者看不到其他页的修改。需要加几页就输出几个 add。
6. relayout 用于更换某一页的版式：layout 只能取 section / bullets / two-col / big-number / stats / quote / comparison / timeline / code / image-text 之一，且必须与该页现版式不同；可用 instruction 补充转换侧重点。**封面与结束页绝不更换版式**。
7. 除 add 外每页最多一个操作（被 add 锚定的页仍可有自己的操作）。
8. instruction 与课件同语言。`

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

export interface GlobalEditPlan {
  ops: GlobalEditOp[]
  /** Ops the model proposed but the deck's PROTECTION rules refused (cover/end,
   * duplicate page, bad target) — surfaced so an empty plan isn't misread as
   * "nothing to change". */
  ignored: number
  /** Ops dropped for being malformed (no page, unknown action, no instruction). */
  invalid: number
}

/** Page numbers arrive as numbers — or, from lenient/thinking models, as
 * numeric strings ("3"); both count. */
function asPageNumber(v: unknown): number {
  if (typeof v === 'number') return Math.round(v)
  if (typeof v === 'string' && /^\s*\d+\s*$/.test(v)) return Number(v)
  return NaN
}

/** Ask the model for a per-page edit plan; invalid ops are filtered locally. */
export async function planGlobalEdit(
  deck: Deck,
  instruction: string,
  settings: LlmSettings,
  signal?: AbortSignal,
): Promise<GlobalEditPlan> {
  const user =
    `课件标题：${deck.title}\n共 ${deck.slides.length} 页，逐页摘要：\n${digest(deck)}\n\n` +
    `用户的全局修改要求：${instruction}\n\n请输出修改计划 JSON。只输出 JSON。`
  const text = await requestText(PLAN_SYSTEM, user, settings, { signal, maxTokens: 2000 })
  const parsed = extractJson(text) as { ops?: unknown }
  if (!Array.isArray(parsed.ops)) throw new Error(t('err.noJson'))

  // Distrust the plan: page in range, valid action, cover/end untouchable by
  // structural ops, rewrite/add need an instruction, move needs a sane target,
  // relayout needs a valid different content layout, one op per page (adds
  // don't occupy their anchor), hard cap. Refused ops are COUNTED, not just
  // dropped, so the panel can tell the user "N ops were disallowed" instead
  // of a false "nothing to change".
  const n = deck.slides.length
  const seen = new Set<number>()
  const ops: GlobalEditOp[] = []
  let ignored = 0
  let invalid = 0
  for (const item of parsed.ops) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const page = asPageNumber(o.page)
    const action = (typeof o.action === 'string' ? o.action : 'rewrite') as GlobalEditAction
    const instr = typeof o.instruction === 'string' ? o.instruction.trim() : ''
    if (
      !Number.isInteger(page) || page < 1 || page > n ||
      !['rewrite', 'drop', 'move', 'add', 'relayout'].includes(action)
    ) {
      invalid++
      continue
    }
    const isEdge = page === 1 || page === n
    if (action === 'add') {
      // The anchor page itself is untouched, so adds bypass the seen-set. An
      // anchor on the end page ("add at the very end") is retargeted to the
      // last content page instead of refused — the recompose clamps the
      // insert before the end page anyway.
      if (!instr || n < 2) {
        invalid++
        continue
      }
      ops.push({ page: Math.min(page, n - 1), action, instruction: instr })
    } else if (seen.has(page)) {
      ignored++
      continue
    } else if (action === 'rewrite') {
      if (!instr) {
        invalid++
        continue
      }
      ops.push({ page, action, instruction: instr })
      seen.add(page)
    } else if (isEdge) {
      ignored++ // cover/end are structural anchors
      continue
    } else if (action === 'drop') {
      ops.push({ page, action, instruction: instr || undefined })
      seen.add(page)
    } else if (action === 'relayout') {
      const layout = typeof o.layout === 'string' ? o.layout.trim() : ''
      if (!CONTENT_LAYOUTS.has(layout) || layout === deck.slides[page - 1].layout) {
        ignored++
        continue
      }
      ops.push({ page, action, layout: layout as SlideLayout, instruction: instr || undefined })
      seen.add(page)
    } else {
      const to = asPageNumber(o.to)
      if (!Number.isInteger(to) || to < 2 || to > n - 1 || to === page) {
        ignored++
        continue
      }
      ops.push({ page, action, to })
      seen.add(page)
    }
    if (ops.length >= 20) break
  }
  return { ops: ops.sort((a, b) => a.page - b.page), ignored, invalid }
}

/**
 * Apply the plan's structural ops (drops, then moves, then inserts, each in
 * plan order) to a slide array in ONE recompose. Move/insert positions are
 * clamped inside the cover…end zone of the current array. `add` ops without a
 * generated `slide` (executor failure) are skipped. Pure — returns a new array.
 */
export function recomposeSlides(slides: Slide[], ops: GlobalEditOp[]): Slide[] {
  const dropSet = new Set(ops.filter((o) => o.action === 'drop').map((o) => o.page))
  const arr = slides.map((s, i) => ({ s, orig: i + 1 })).filter((x) => !dropSet.has(x.orig))
  for (const op of ops) {
    if (op.action !== 'move') continue
    const from = arr.findIndex((x) => x.orig === op.page)
    if (from < 0) continue
    const [item] = arr.splice(from, 1)
    const at = Math.max(1, Math.min(arr.length - 1, (op.to ?? 2) - 1))
    arr.splice(at, 0, item)
  }
  // Inserts land right after their anchor (wherever it moved to), behind any
  // earlier inserts at the same spot; a dropped anchor falls back to the
  // nearest surviving page before it.
  for (const op of ops) {
    if (op.action !== 'add' || !op.slide) continue
    let idx = arr.findIndex((x) => x.orig === op.page)
    if (idx < 0) {
      let bestOrig = 0
      for (let i = 0; i < arr.length; i++) {
        const g = arr[i].orig
        if (g > bestOrig && g < op.page) {
          bestOrig = g
          idx = i
        }
      }
    }
    let at = idx + 1
    while (at < arr.length && arr[at].orig === 0) at++
    at = Math.max(1, Math.min(arr.length - 1, at))
    arr.splice(at, 0, { s: op.slide, orig: 0 })
  }
  return arr.map((x) => x.s)
}
