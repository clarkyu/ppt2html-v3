import {
  type DeckSpec,
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
import { requestText, streamText, type GenerateHandlers } from './client'
import { extractJson } from './extractJson'
import { DECK_SCHEMA_GUIDE, contextBlock } from './prompt'

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

/* ------------------------- step 1: overall structure ------------------------- */

const STRUCTURE_SYSTEM = `你是课件结构规划专家。这是**第一步**：先规划课件的「整体结构」（分成哪几个部分），供用户确认后，再细化每一页。

严格只输出一个 JSON 对象，不要解释或代码块标记：
{ "understanding": "一句话还原用户想要的课件：讲给谁、达到什么目的、重点是什么",
  "title": "课件标题", "subtitle": "副标题",
  "theme": "aurora|ink|sunrise|forest|noir",
  "sections": [ { "title": "部分标题", "brief": "这一部分讲什么（一句话）" } ] }

规则：
1. understanding：用一句话**准确复述用户意图**（结合主题与引导回答），像在向用户确认"你是想要……对吗"。要具体、贴合，不空泛。
2. sections：把课件分成循序渐进的**内容部分**（不含封面与结束页），不要展开到每一页。
3. 部分数量与分享时长 / 期望页数匹配：**约每 6~8 分钟一个部分**——短（≤10 分钟）2~3 个；中（约 15~20 分钟）3~5 个；长（≥30 分钟）**5~7 个**。时间越长部分越多、越细。
4. title/subtitle 精炼有力；theme 依主题气质选择（科技/商业→aurora 或 noir；人文/教育→ink 或 sunrise；自然/健康→forest）。
5. 语言与主题保持一致。`

export async function generateStructure(
  topic: string,
  opts: GenerateOptions,
  settings: LlmSettings,
  signal?: AbortSignal,
): Promise<Structure> {
  const user = `${contextBlock(topic, opts)}\n\n请先输出「整体结构」JSON（只列几个部分，不要展开到每一页）。只输出 JSON。`
  const text = await requestText(STRUCTURE_SYSTEM, user, settings, { signal, maxTokens: 1200 })
  return normalizeStructure(extractJson(text), topic, opts.theme)
}

function normalizeStructure(raw: unknown, topic: string, themeHint?: ThemeName): Structure {
  const o = asObj(raw)
  const rawSecs = Array.isArray(o.sections) ? o.sections : []

  const sections: Section[] = []
  for (const item of rawSecs) {
    const s = asObj(item)
    const title = asStr(s.title)
    const brief = asStr(s.brief) || undefined
    if (!title && !brief) continue
    sections.push({ title: title || (brief as string), brief: title ? brief : undefined })
    if (sections.length >= 8) break
  }
  if (!sections.length) {
    sections.push({ title: '背景与概念' }, { title: '核心内容' }, { title: '应用与小结' })
  }

  const title = asStr(o.title) || topic.slice(0, 40)
  return {
    understanding: asStr(o.understanding) || undefined,
    title,
    subtitle: asStr(o.subtitle) || undefined,
    theme: coerceTheme(o.theme, themeHint),
    sections,
  }
}

/* --------------- step 2: page-level outline from confirmed structure --------------- */

const FROM_STRUCTURE_SYSTEM = `你是课件结构规划专家。下面给你一份**用户已确认的整体结构**（若干部分）。这是**第二步**：把它细化成完整的「逐页大纲」，供用户确认后再生成课件。

严格只输出一个 JSON 对象，不要解释或代码块标记：
{ "title": "课件标题", "subtitle": "副标题", "theme": "aurora|ink|sunrise|forest|noir",
  "slides": [ { "layout": "版式", "title": "该页标题", "brief": "一句话说明这页讲什么/要点" } ] }

版式(layout)取值：cover / section / bullets / two-col / big-number / quote / comparison / timeline / code / image-text / end

规则：
1. 第一页必须是 cover，最后一页必须是 end。
2. **严格按给定部分的顺序展开**，不新增 / 删除 / 重排部分：每个部分前放一页 section 分隔页，其后是该部分的**若干内容页**。
3. **总页数必须接近「期望页数」**（见上下文，含封面与结束页）：据此把内容页分配到各部分——每个部分可 2~7 页内容不等，内容多 / 重要的部分多给几页。**不要明显少于期望页数**；宁可把一个部分拆成多页，也不要每页塞太多。
4. 版式必须多样：整份至少用到 5 种不同的内容版式；**不要连续超过 2 页 bullets**；主动穿插 big-number / quote / comparison / timeline / two-col / image-text / code。
5. brief 用一句话概括该页要点，简短具体。
6. 沿用给定的 title / subtitle / theme。语言与主题保持一致。`

export async function generateOutlineFromStructure(
  topic: string,
  opts: GenerateOptions,
  structure: Structure,
  settings: LlmSettings,
  signal?: AbortSignal,
): Promise<Outline> {
  const target = opts.slideCount
  const user =
    `${contextBlock(topic, opts)}\n\n` +
    `已确认的整体结构（请据此细化为逐页大纲，部分顺序与数量保持一致）：\n${JSON.stringify(structure)}\n\n` +
    (target ? `目标总页数：约 ${target} 页（含封面与结束页），请尽量接近该数量，不要明显偏少。\n` : '') +
    `请输出「逐页大纲」JSON。只输出 JSON。`
  const text = await requestText(FROM_STRUCTURE_SYSTEM, user, settings, { signal, maxTokens: 4096 })
  return normalizeOutline(extractJson(text), topic, structure.theme ?? opts.theme)
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
    slides.push({ layout: 'end', title: '谢谢观看' })
  }

  return {
    title,
    subtitle: asStr(o.subtitle) || undefined,
    theme: coerceTheme(o.theme, themeHint),
    slides,
  }
}

/* ----------------------- deck from confirmed page outline ----------------------- */

const FROM_OUTLINE_SYSTEM = `${DECK_SCHEMA_GUIDE}

重要：下面会给你一份**用户已确认的大纲**。请严格遵守：
- 页数、顺序、每一页的 layout 与 title 都**照大纲执行，不要增删或重排页面**。
- 你的任务是把每页内容**充实到位**：按该页的 layout 填好对应字段（bullets / items / steps / left / right / value / caption / text / code / body 等），内容准确、精炼、有信息量。
- 保持大纲给定的 theme。`

export async function generateDeckFromOutline(
  topic: string,
  opts: GenerateOptions,
  outline: Outline,
  settings: LlmSettings,
  handlers: GenerateHandlers = {},
): Promise<DeckSpec> {
  const user =
    `${contextBlock(topic, opts)}\n\n` +
    `已确认的大纲（请严格照此生成完整课件）：\n${JSON.stringify(outline)}\n\n` +
    `请输出符合 schema 的完整课件 JSON，页数/顺序/每页 layout 与 title 与大纲一致。只输出 JSON。`

  const text = await streamText(FROM_OUTLINE_SYSTEM, user, settings, handlers)
  const spec = extractJson(text) as DeckSpec
  if (!spec || typeof spec !== 'object' || !Array.isArray(spec.slides) || !spec.slides.length) {
    throw new Error('模型返回的内容不是有效的课件结构，请重试。')
  }
  return spec
}
