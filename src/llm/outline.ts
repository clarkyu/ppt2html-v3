import {
  type GenerateOptions,
  type Outline,
  type OutlineSlide,
  type Section,
  type SlideLayout,
  type Structure,
  type ThemeName,
  LAYOUTS,
  THEMES,
} from '../types'
import type { LlmSettings } from './settings'
import { streamText, type GenerateHandlers } from './client'
import { extractJson } from './extractJson'
import { DECK_SCHEMA_GUIDE, contextBlock } from './prompt'
import { slidesForMinutes } from '../lib/duration'
import { deckIsCjk } from '../lib/lang'

const LAYOUT_SET = new Set<string>(LAYOUTS)
const THEME_SET = new Set<string>(THEMES)

function asStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}
function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}
function coerceLayout(v: unknown, fallback: SlideLayout = 'bullets'): SlideLayout {
  return typeof v === 'string' && LAYOUT_SET.has(v) ? (v as SlideLayout) : fallback
}
function coerceTheme(v: unknown, hint?: ThemeName): ThemeName {
  return typeof v === 'string' && THEME_SET.has(v) ? (v as ThemeName) : hint ?? 'aurora'
}

/**
 * Run an LLM call and parse its JSON, retrying a few times on parse failure —
 * models (esp. DeepSeek in thinking mode) occasionally return an empty or
 * non-JSON answer; a retry almost always recovers. Aborts are not retried.
 */
async function genJson(run: () => Promise<string>, attempts = 3): Promise<unknown> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return extractJson(await run())
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      lastErr = e
    }
  }
  throw lastErr
}

/* ------------------------- step 1: overall structure ------------------------- */

const STRUCTURE_SYSTEM = `你是课件结构规划专家。这是**第一步**：先规划课件的「整体结构」（分成哪几个部分），供用户确认后，再细化每一页。

严格只输出一个 JSON 对象，不要解释或代码块标记：
{ "understanding": "一句话还原用户想要的课件：讲给谁、达到什么目的、重点是什么",
  "title": "课件标题", "subtitle": "副标题",
  "theme": "aurora|ink|sunrise|forest|noir|sand|rose",
  "sections": [ { "title": "部分标题", "brief": "这一部分讲什么（一句话）", "pages": 4 } ] }

规则：
1. understanding：用一句话**准确复述用户意图**（结合主题与引导回答），像在向用户确认"你是想要……对吗"。要具体、贴合，不空泛。
2. sections：把课件分成循序渐进的**内容部分**（不含封面与结束页），不要展开到每一页。brief 写出这一部分的**核心论点或结论**，不要「介绍…/分析…」式的目录描述。
3. 部分数量与分享时长 / 期望页数匹配：**约每 6~8 分钟一个部分**——短（≤10 分钟）2~3 个；中（约 15~20 分钟）3~5 个；长（≥30 分钟）**5~7 个**。时间越长部分越多、越细。
4. pages：为每个部分给出建议页数（正整数，**含该部分的分隔页**）；内容多 / 重要的部分多给。所有部分 pages 之和应约等于「期望页数」减 2（封面、结束各 1 页）。
5. title/subtitle 精炼有力；theme 依主题气质选择（科技/商业→aurora 或 noir；人文/教育→ink、sunrise 或 sand；自然/健康→forest；情感/创意/营销→rose）。
6. 语言与主题保持一致。`

export async function generateStructure(
  topic: string,
  opts: GenerateOptions,
  settings: LlmSettings,
  handlers: GenerateHandlers = {},
  /** Re-plan on top of the user's current (possibly edited) structure. */
  current?: Structure,
  instruction?: string,
): Promise<Structure> {
  const user =
    `${contextBlock(topic, opts)}\n\n` +
    (current
      ? `当前结构（用户可能已手动编辑，请在此基础上调整而非从零重来）：${JSON.stringify({
          title: current.title,
          subtitle: current.subtitle,
          sections: current.sections,
        })}\n\n`
      : '') +
    (instruction ? `用户对结构的调整要求（请据此重新规划）：${instruction}\n\n` : '') +
    `请先输出「整体结构」JSON（只列几个部分，不要展开到每一页）。只输出 JSON。`
  // Streamed so thinking-heavy models don't leave the user on a bare spinner.
  const raw = await genJson(() => streamText(STRUCTURE_SYSTEM, user, settings, handlers))
  return normalizeStructure(raw, topic, opts)
}

/** Distribute `budget` pages across parts by weight, each ≥1, summing exactly. */
function allocatePages(weights: number[], budget: number): number[] {
  const n = weights.length
  if (!n) return []
  const wsum = weights.reduce((a, b) => a + b, 0) || n
  const alloc = weights.map((w) => Math.max(1, Math.round((budget * w) / wsum)))
  let cur = alloc.reduce((a, b) => a + b, 0)
  while (cur > budget) {
    let mi = -1
    for (let i = 0; i < n; i++) if (alloc[i] > 1 && (mi < 0 || alloc[i] > alloc[mi])) mi = i
    if (mi < 0) break
    alloc[mi]--
    cur--
  }
  while (cur < budget) {
    let mi = 0
    for (let i = 1; i < n; i++) if (alloc[i] > alloc[mi]) mi = i
    alloc[mi]++
    cur++
  }
  return alloc
}

function normalizeStructure(raw: unknown, topic: string, opts: GenerateOptions): Structure {
  const o = asObj(raw)
  const rawSecs = Array.isArray(o.sections) ? o.sections : []

  const sections: Section[] = []
  const weights: number[] = []
  for (const item of rawSecs) {
    const s = asObj(item)
    const title = asStr(s.title)
    const brief = asStr(s.brief) || undefined
    if (!title && !brief) continue
    const p = typeof s.pages === 'number' && s.pages > 0 ? Math.round(s.pages) : 0
    weights.push(p || 1)
    sections.push({ title: title || (brief as string), brief: title ? brief : undefined })
    if (sections.length >= 8) break
  }
  if (!sections.length) {
    sections.push({ title: '背景与概念' }, { title: '核心内容' }, { title: '应用与小结' })
    weights.push(1, 1, 1)
  }

  // Allocate a page budget per part (reserving cover + end). Each part ≥2 pages.
  const target = opts.slideCount ?? (opts.durationMinutes ? slidesForMinutes(opts.durationMinutes) : 10)
  const budget = Math.max(sections.length * 2, target - 2)
  const alloc = allocatePages(weights, budget)
  sections.forEach((s, i) => (s.pages = Math.max(2, alloc[i] ?? 2)))

  const title = asStr(o.title) || topic.slice(0, 40)
  return {
    understanding: asStr(o.understanding) || undefined,
    title,
    subtitle: asStr(o.subtitle) || undefined,
    theme: coerceTheme(o.theme, opts.theme),
    sections,
  }
}

/* --------------- step 2: detail ONE part at a time (streamed) --------------- */

const PART_SYSTEM = `你是课件逐页规划专家。下面给你整份课件的结构，以及**当前要细化的一个部分**。只为**这一个部分**生成逐页大纲——不要生成其它部分、也不要封面(cover)或结束页(end)。

严格只输出一个 JSON 对象，不要解释或代码块标记：
{ "slides": [ { "layout": "版式", "title": "页标题", "brief": "一句话要点" } ] }

版式(layout)取值：section / bullets / two-col / big-number / stats / quote / comparison / timeline / code / image-text（本部分不要用 cover / end）

规则：
1. 按给定的目标页数生成：**第 1 页 layout=section**（该部分的分隔页，标题即部分标题），其后为内容页。
2. 版式看内容形态选择：有真实数字支撑的结论→big-number；多个并列关键数字→stats；流程/步骤/发展史→timeline；方案取舍→comparison；正反两面→two-col；权威引言(真实可溯源)→quote；连贯叙述的背景/故事→image-text；并列观点→bullets。**不要连续超过 2 页 bullets**；若本部分内容适合，安排一页 big-number / quote / timeline / comparison 制造记忆点——不硬凑。
3. brief 写出该页的**核心结论、关键数据或具体例子本身**，不要「介绍…/分析…」式的目录描述。特殊版式的 brief 要携带关键素材：big-number 写出那个数字及含义；quote 写出引言与出处；timeline 列出步骤名；comparison 写明对比双方与结论。
4. 语言与主题一致，与整份课件连贯。
5. 若给出了「前面部分已确认的页面」：不要与其重复主题或素材；延续其术语与口径；自然承接上一部分的结尾。`

/** Generate (streaming) the pages for a single confirmed part. */
export async function generatePartPages(
  topic: string,
  opts: GenerateOptions,
  structure: Structure,
  index: number,
  settings: LlmSettings,
  handlers: GenerateHandlers = {},
  instruction?: string,
  /** Already-confirmed pages of earlier parts, so this part can stay coherent
      with them (no repeated topics, consistent terminology). */
  confirmed?: OutlineSlide[],
): Promise<OutlineSlide[]> {
  const sec = structure.sections[index]
  const pages = sec?.pages ?? 3
  const overview = {
    title: structure.title,
    sections: structure.sections.map((s, i) => ({ n: i + 1, title: s.title })),
  }
  const prior = (confirmed ?? []).map((s) => ({ layout: s.layout, title: s.title, brief: s.brief }))
  const user =
    `${contextBlock(topic, opts)}\n\n` +
    `整份课件结构（供参考，保持连贯）：${JSON.stringify(overview)}\n\n` +
    (prior.length
      ? `前面部分已确认的页面（不要重复其内容，延续其术语与风格）：${JSON.stringify(prior)}\n\n`
      : '') +
    `当前要细化的部分（第 ${index + 1}/${structure.sections.length} 个）：${JSON.stringify(sec)}\n\n` +
    (instruction ? `用户对这一部分的额外调整要求（请据此重写）：${instruction}\n\n` : '') +
    `请只输出这一部分的 slides JSON，共约 ${pages} 页，第 1 页为 section 分隔页（标题：${sec?.title ?? ''}）。只输出 JSON。`

  const raw = await genJson(() => streamText(PART_SYSTEM, user, settings, handlers))
  return normalizePartSlides(raw, sec)
}

function normalizePartSlides(raw: unknown, sec?: Section): OutlineSlide[] {
  const o = asObj(raw)
  const rawSlides = Array.isArray(o.slides) ? o.slides : []
  const out: OutlineSlide[] = []
  for (const item of rawSlides) {
    const s = asObj(item)
    const layout = coerceLayout(s.layout)
    if (layout === 'cover' || layout === 'end') continue // not allowed inside a part
    const title = asStr(s.title)
    const brief = asStr(s.brief) || undefined
    if (!title && !brief) continue
    out.push({ layout, title, brief })
    if (out.length >= 14) break
  }
  // Ensure the part opens with its section-divider page.
  if (!out.length || out[0].layout !== 'section') {
    out.unshift({ layout: 'section', title: sec?.title ?? '', brief: sec?.brief })
  }
  return out
}

/** Concatenate confirmed groups (cover + parts + end) into a final outline. */
export function assembleOutline(structure: Structure, groups: OutlineSlide[][]): Outline {
  const slides = groups.flat()
  return normalizeOutline(
    { title: structure.title, subtitle: structure.subtitle, theme: structure.theme, slides },
    structure.title,
    structure.theme,
  )
}

function normalizeOutline(raw: unknown, topic: string, themeHint?: ThemeName): Outline {
  const o = asObj(raw)
  const rawSlides = Array.isArray(o.slides) ? o.slides : []

  const slides: OutlineSlide[] = []
  for (const item of rawSlides) {
    const s = asObj(item)
    const layout = coerceLayout(s.layout)
    const title = asStr(s.title)
    const brief = asStr(s.brief) || undefined
    if (!title && !brief && layout !== 'end') continue
    slides.push({ layout, title, brief })
    if (slides.length >= 60) break
  }

  const title = asStr(o.title) || slides.find((s) => s.layout === 'cover')?.title || topic.slice(0, 40)
  if (!slides.some((s) => s.layout === 'cover')) {
    slides.unshift({ layout: 'cover', title })
  }
  if (!slides.length || slides[slides.length - 1].layout !== 'end') {
    slides.push({ layout: 'end', title: deckIsCjk({ title, slides }) ? '谢谢观看' : 'Thank You' })
  }

  return {
    title,
    subtitle: asStr(o.subtitle) || undefined,
    theme: coerceTheme(o.theme, themeHint),
    slides,
  }
}

/* ----------------------- deck from confirmed page outline ----------------------- */
// The final pass runs SEGMENTED: one LLM call per 环节-sized chunk. A single
// monolithic call for a 20+ page deck runs into provider output caps and
// spreads quality thin across pages; segments keep every call small, allow
// per-segment retry without redoing finished pages, and enable live per-slide
// previews while streaming.

const SEGMENT_SYSTEM = `${DECK_SCHEMA_GUIDE}

现在你在为一份**用户已确认大纲**的课件生成其中**一段连续的页面**。请严格遵守：
- 只输出一个 JSON 对象：{ "slides": [ SlideObject, ... ] } —— 只含本段页面，按给定顺序。
- 每页的 layout 与 title 照大纲执行，**不要增删或重排**。
- 每页的 brief 是用户确认过的要点：成稿内容必须**覆盖并深化 brief**，不得偏题，不得丢弃 brief 中给出的数字 / 案例 / 结论。
- 与「前文已生成页面」保持连贯：延续其术语与口径，不重复其内容。
- 若要求「详实丰富」，体现在措辞更具体、例子更完整、note 更充分——页数不变。`

/** Split outline slides into generation segments: a new segment starts at each
    section divider (the cover rides with the first chunk); oversized segments
    are chunked so a single call never nears provider output caps. */
export function splitOutlineSegments(outline: Outline): OutlineSlide[][] {
  const MAX = 8
  const segs: OutlineSlide[][] = []
  let cur: OutlineSlide[] = []
  for (const s of outline.slides) {
    if (s.layout === 'section' && cur.length) {
      segs.push(cur)
      cur = []
    }
    cur.push(s)
    if (cur.length >= MAX) {
      segs.push(cur)
      cur = []
    }
  }
  if (cur.length) segs.push(cur)
  return segs
}

/**
 * Incremental parser: the complete top-level objects inside `"slides": [ … ` of
 * a (possibly still-streaming) JSON text. Lets the UI reveal each page as soon
 * as its JSON closes, long before the segment finishes.
 */
export function completeSlides(text: string): unknown[] {
  const key = text.indexOf('"slides"')
  const arr = key >= 0 ? text.indexOf('[', key) : -1
  if (arr < 0) return []
  const out: unknown[] = []
  let inStr = false
  let esc = false
  let depth = 0
  let start = -1
  for (let i = arr + 1; i < text.length; i++) {
    const c = text[i]
    if (esc) {
      esc = false
      continue
    }
    if (inStr) {
      if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') {
      inStr = true
      continue
    }
    if (c === '{') {
      if (!depth) start = i
      depth++
    } else if (c === '}') {
      depth--
      if (!depth && start >= 0) {
        try {
          out.push(JSON.parse(text.slice(start, i + 1)))
        } catch {
          /* malformed object — skip it, later ones may still parse */
        }
        start = -1
      }
    } else if (c === ']' && !depth) {
      break
    }
  }
  return out
}

/**
 * Generate ONE segment's slides (streamed). Returns raw slide objects aligned
 * to the segment's outline: the layout is pinned per page, missing pages are
 * padded from the outline entry (so a confirmed page is never lost) and extras
 * are dropped.
 */
export async function generateSegmentSlides(
  topic: string,
  opts: GenerateOptions,
  outline: Outline,
  segments: OutlineSlide[][],
  segIndex: number,
  /** Titles of pages already generated in earlier segments (for coherence). */
  priorTitles: string[],
  settings: LlmSettings,
  handlers: GenerateHandlers = {},
): Promise<Array<Record<string, unknown>>> {
  const seg = segments[segIndex]
  const user =
    `${contextBlock(topic, opts)}\n\n` +
    `课件标题：《${outline.title}》${outline.subtitle ? `（${outline.subtitle}）` : ''}，theme=${outline.theme}\n` +
    `整份大纲（供连贯参考）：${JSON.stringify(outline.slides.map((s, n) => ({ n: n + 1, layout: s.layout, title: s.title })))}\n\n` +
    (priorTitles.length ? `前文已生成页面的标题：${JSON.stringify(priorTitles)}\n\n` : '') +
    `本段要生成的页面（第 ${segIndex + 1}/${segments.length} 段，共 ${seg.length} 页）：${JSON.stringify(seg)}\n\n` +
    `请输出本段的 {"slides":[...]} JSON，共 ${seg.length} 页，每页 layout/title 与上面一致。只输出 JSON。`

  const raw = await genJson(() => streamText(SEGMENT_SYSTEM, user, settings, handlers))
  const o = asObj(raw)
  const rawSlides = (Array.isArray(o.slides) ? o.slides : []).map(asObj)

  const out: Array<Record<string, unknown>> = []
  for (let k = 0; k < seg.length; k++) {
    const cand = rawSlides[k]
    if (cand && Object.keys(cand).length) {
      cand.layout = seg[k].layout
      if (!asStr(cand.title) && seg[k].title) cand.title = seg[k].title
      out.push(cand)
    } else {
      // Model dropped this page — keep the confirmed outline's skeleton.
      out.push({
        layout: seg[k].layout,
        title: seg[k].title,
        ...(seg[k].brief ? { bullets: [seg[k].brief] } : {}),
      })
    }
  }
  return out
}
