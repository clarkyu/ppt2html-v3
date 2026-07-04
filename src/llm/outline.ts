import {
  type DeckSpec,
  type GenerateOptions,
  type Outline,
  type OutlineSlide,
  type SlideLayout,
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

/* ------------------------------ outline ------------------------------ */

const OUTLINE_SYSTEM = `你是课件结构规划专家。根据主题（及补充信息），先规划一份「幻灯片大纲」，供用户确认后再生成完整课件。

严格只输出一个 JSON 对象，不要解释或代码块标记：
{ "title": "课件标题", "subtitle": "副标题", "theme": "aurora|ink|sunrise|forest|noir",
  "slides": [ { "layout": "版式", "title": "该页标题", "brief": "一句话说明这页讲什么/要点" } ] }

版式(layout)从下列中选，并**刻意用多样化的版式**：
cover(封面·第一页) / section(章节分隔) / bullets(要点) / two-col(两栏对照) / big-number(关键数字) / quote(金句) / comparison(对比卡片) / timeline(流程或时间线) / code(代码) / image-text(图文) / end(结束·最后一页)

规则：
1. 第一页必须是 cover，最后一页必须是 end。
2. 共 8~12 页；用 section 把内容分成 2~4 个部分，让讲解有节奏。
3. 版式必须多样：整份至少用到 4 种不同的内容版式；**不要出现连续超过 2 页的 bullets**；在合适处主动使用 big-number / quote / comparison / timeline / two-col。
4. brief 用一句话概括该页内容或要点，简短具体。
5. theme 依主题气质选择（科技/商业→aurora 或 noir；人文/教育→ink 或 sunrise；自然/健康→forest）。
6. 语言与主题保持一致。`

export async function generateOutline(
  topic: string,
  opts: GenerateOptions,
  settings: LlmSettings,
  signal?: AbortSignal,
): Promise<Outline> {
  const user = `${contextBlock(topic, opts)}\n\n请先输出「大纲」JSON（不是完整课件）。只输出 JSON。`
  const text = await requestText(OUTLINE_SYSTEM, user, settings, { signal, maxTokens: 2000 })
  return normalizeOutline(extractJson(text), topic, opts.theme)
}

function coerceLayout(v: unknown, fallback: SlideLayout = 'bullets'): SlideLayout {
  return typeof v === 'string' && LAYOUT_SET.has(v) ? (v as SlideLayout) : fallback
}

function asStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function normalizeOutline(raw: unknown, topic: string, themeHint?: ThemeName): Outline {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const rawSlides = Array.isArray(o.slides) ? o.slides : []

  const slides: OutlineSlide[] = []
  for (const item of rawSlides) {
    if (!item || typeof item !== 'object') continue
    const s = item as Record<string, unknown>
    const layout = coerceLayout(s.layout)
    const title = asStr(s.title)
    const brief = asStr(s.brief) || undefined
    if (!title && !brief && layout !== 'end') continue
    slides.push({ layout, title, brief })
    if (slides.length >= 20) break
  }

  const title = asStr(o.title) || slides.find((s) => s.layout === 'cover')?.title || topic.slice(0, 40)
  if (!slides.some((s) => s.layout === 'cover')) {
    slides.unshift({ layout: 'cover', title })
  }
  if (!slides.length || slides[slides.length - 1].layout !== 'end') {
    slides.push({ layout: 'end', title: '谢谢观看' })
  }

  const theme = typeof o.theme === 'string' && THEME_SET.has(o.theme) ? (o.theme as ThemeName) : themeHint ?? 'aurora'
  return { title, subtitle: asStr(o.subtitle) || undefined, theme, slides }
}

/* ----------------------- deck from confirmed outline ----------------------- */

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
