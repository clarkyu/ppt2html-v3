// Whole-deck conversational edit, step 1 of 2: the PLANNER. One cheap call
// sees the full deck digest + the user's global instruction ("整体更口语化"
// "每页补一个真实例子") and decides WHICH pages change and HOW — with
// cross-page awareness (varied examples, consistent terms) that per-page
// rewrites alone can't have. Step 2 executes each op through the existing
// regenerateSlide pipeline (layout/background stay pinned there).
//
// v1 is content-rewrite only: no page add/drop/reorder, no layout changes —
// structural ops need player remount + baked page-number reflow (v2).

import type { Deck, Slide } from '../types'
import type { LlmSettings } from './settings'
import { requestText } from './client'
import { extractJson } from './extractJson'
import { t } from '../i18n'

export interface GlobalEditOp {
  /** 1-based page number. */
  page: number
  /** Self-contained, page-specific rewrite instruction (the executor sees only this page). */
  instruction: string
}

const PLAN_SYSTEM = `你是课件整册修改的规划师。给定一份课件的逐页摘要和用户的全局修改要求，输出一个修改计划：哪些页需要改、每页具体怎么改。

严格只输出一个 JSON 对象，不要解释或代码块标记：
{ "ops": [ { "page": 3, "instruction": "这一页具体怎么改（自包含）" } ] }

规则：
1. 只列**真正需要修改**的页——与要求无关的页绝不列入；如果全篇都不需要改，输出 {"ops":[]}。
2. 每页的 instruction 必须**自包含且具体**：执行者只能看到这一页和这条指令，看不到全篇，也看不到用户的原始要求。把"怎么改"落到这一页的内容上。
3. **跨页协调**是你的职责：补例子时各页例子不能雷同；统一术语时在每条指令里写明目标术语；语气调整要全篇一致。
4. 封面(cover)与结束页(end)仅在要求明确涉及时才修改。
5. 当前版本**只支持页内改写**：不许增删页、不许调整顺序、不许更换版式——这类要求请忽略并只做能做的部分。
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

  // Distrust the plan: page range, non-empty instruction, one op per page, cap.
  const seen = new Set<number>()
  const ops: GlobalEditOp[] = []
  for (const item of parsed.ops) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const page = typeof o.page === 'number' ? Math.round(o.page) : NaN
    const instr = typeof o.instruction === 'string' ? o.instruction.trim() : ''
    if (!Number.isInteger(page) || page < 1 || page > deck.slides.length || !instr || seen.has(page)) continue
    seen.add(page)
    ops.push({ page, instruction: instr })
    if (ops.length >= 20) break
  }
  return ops.sort((a, b) => a.page - b.page)
}
