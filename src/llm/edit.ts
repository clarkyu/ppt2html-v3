import type { Deck, Slide, SlideLayout } from '../types'
import type { LlmSettings } from './settings'
import { requestText } from './client'
import { extractJson } from './extractJson'
import { normalizeSlide } from '../render/normalize'
import { DECK_SCHEMA_GUIDE } from './prompt'
import { sliceMaterial, SLICE_THRESHOLD } from '../lib/materialSlice'
import { t } from '../i18n'

const EDIT_SYSTEM = `${DECK_SCHEMA_GUIDE}

现在你在**编辑一份已生成课件中的某一页**。根据用户的调整要求，重写这一页的内容。
- **只输出这一页的一个 SlideObject JSON 对象**（不是整份课件、不是数组，就一个对象）。
- **layout 保持不变**（沿用给定的版式）。
- 按该 layout 对应的字段把内容填充到位，准确、精炼、有信息量。
- 不要输出任何解释或代码块标记。`

/** Rewrite a single slide's content per a user instruction, keeping its layout. */
export async function regenerateSlide(
  deck: Deck,
  index: number,
  instruction: string,
  settings: LlmSettings,
  signal?: AbortSignal,
): Promise<Slide> {
  const slide = deck.slides[index]
  const user =
    `课件主题：${deck.prompt || deck.title}\n` +
    `课件标题：${deck.title}${deck.subtitle ? `（${deck.subtitle}）` : ''}\n` +
    `配色主题：${deck.theme}\n` +
    `这一页的版式(layout)：${slide.layout}（必须保持不变）\n` +
    `这一页当前内容：${JSON.stringify(slide)}\n\n` +
    `用户的调整要求：${instruction}\n\n` +
    `请据此重写这一页，只输出一个 SlideObject JSON 对象。`

  const text = await requestText(EDIT_SYSTEM, user, settings, { signal, maxTokens: 1600 })
  const norm = normalizeSlide(extractJson(text))
  // A response that parses but normalizes to nothing is a failure — throw so
  // the editor shows a retryable error instead of silently keeping the old
  // content while toasting success.
  if (!norm) throw new Error(t('err.noJson'))
  // Never change the layout; keep the existing background state.
  return { ...norm, layout: slide.layout, bg: slide.bg, bgOff: slide.bgOff, imageQuery: norm.imageQuery ?? slide.imageQuery }
}

/** The one field group `layout` cannot render without — a reply that declares a
 * layout but lacks its fields (e.g. echoing the original slide) must be
 * rejected, not force-relabeled into an empty or gutted page. */
function layoutHasContent(s: Slide, layout: SlideLayout): boolean {
  switch (layout) {
    case 'two-col':
      return !!(s.left || s.right)
    case 'big-number':
      return !!s.value
    case 'stats':
      return !!s.stats?.length
    case 'quote':
      return !!s.text
    case 'comparison':
      return !!s.items?.length
    case 'timeline':
      return !!s.steps?.length
    case 'code':
      return !!s.code
    case 'bullets':
    case 'image-text':
      return !!(s.bullets?.length || s.body)
    case 'section':
      return !!(s.title || s.subtitle)
    default:
      return true // cover/end never reach here as targets
  }
}

const RELAYOUT_SYSTEM = `${DECK_SCHEMA_GUIDE}

现在你在**更换一份已生成课件中某一页的版式**：把这一页的内容重新表达为指定的新版式。
- **只输出这一页的一个 SlideObject JSON 对象**（不是整份课件、不是数组，就一个对象）。
- **layout 必须是指定的新版式**，并按新版式对应的字段重新组织内容。
- 保留原页的信息与观点：能映射的内容映射过去，不适合新版式的可精炼合并；不要凭空编造新事实。
- 不要输出任何解释或代码块标记。`

/** Re-express one slide in a different layout, keeping its substance. */
export async function relayoutSlide(
  deck: Deck,
  index: number,
  layout: SlideLayout,
  instruction: string,
  settings: LlmSettings,
  signal?: AbortSignal,
): Promise<Slide> {
  const slide = deck.slides[index]
  const user =
    `课件主题：${deck.prompt || deck.title}\n` +
    `课件标题：${deck.title}${deck.subtitle ? `（${deck.subtitle}）` : ''}\n` +
    `这一页当前版式：${slide.layout}，目标新版式：${layout}\n` +
    `这一页当前内容：${JSON.stringify(slide)}\n\n` +
    (instruction ? `转换时的额外要求：${instruction}\n\n` : '') +
    `请把这一页重新表达为 ${layout} 版式，只输出一个 SlideObject JSON 对象。`

  const text = await requestText(RELAYOUT_SYSTEM, user, settings, { signal, maxTokens: 1600 })
  const norm = normalizeSlide(extractJson(text))
  // Forcing the target layout onto a reply missing its key fields would render
  // an empty page — treat that as a failure too (caller skips, original stays).
  if (!norm || !layoutHasContent(norm, layout)) throw new Error(t('err.noJson'))
  return { ...norm, layout, bg: slide.bg, bgOff: slide.bgOff, imageQuery: norm.imageQuery ?? slide.imageQuery }
}

const ADD_SYSTEM = `${DECK_SCHEMA_GUIDE}

现在你在为一份已生成课件**新增一页**。根据新页要求与前后页语境，写出这一页的完整内容。
- **只输出这一页的一个 SlideObject JSON 对象**（不是整份课件、不是数组，就一个对象）。
- layout 按内容自选最合适的内容版式（不能是 cover 或 end；要求里指明了版式就用指明的）。
- 内容要具体、有信息量，风格与语言和全篇一致；与相邻页衔接自然、不重复既有页面。
- 若提供了参考素材，优先引用其中的数字与事实并保真；素材没有的绝不编造数字。
- 不要输出任何解释或代码块标记。`

/**
 * Synthesize a brand-new slide to be inserted after `afterIndex` (0-based).
 * The whole-deck overview + neighbor titles anchor tone and avoid repetition;
 * the deck's generation material (if any) rides along so real facts get used.
 */
export async function generateNewSlide(
  deck: Deck,
  afterIndex: number,
  instruction: string,
  settings: LlmSettings,
  signal?: AbortSignal,
): Promise<Slide> {
  const strip = (s: string | undefined): string => (s ?? '').replace(/\*\*/g, '')
  const overview = deck.slides
    .map((s, i) => `${i + 1}. [${s.layout}] ${strip(s.title ?? s.value ?? s.text)}`)
    .join('\n')
  const anchor = deck.slides[afterIndex]
  const next = deck.slides[afterIndex + 1]
  let materialBlock = ''
  const mat = deck.material?.trim()
  if (mat) {
    const scoped = mat.length > SLICE_THRESHOLD ? sliceMaterial(mat, `${instruction} ${deck.title}`) : mat
    materialBlock = `\n\n参考素材（生成本课件时用户提供，优先引用其中的事实）：\n"""\n${scoped}\n"""`
  }
  const user =
    `课件主题：${deck.prompt || deck.title}\n` +
    `课件标题：${deck.title}${deck.subtitle ? `（${deck.subtitle}）` : ''}\n` +
    `全篇页面一览：\n${overview}\n\n` +
    `新页位置：插在第 ${afterIndex + 1} 页《${strip(anchor?.title)}》之后` +
    (next ? `、第 ${afterIndex + 2} 页《${strip(next.title)}》之前` : '') +
    `。\n新页要求：${instruction}${materialBlock}\n\n` +
    `请写出这一页，只输出一个 SlideObject JSON 对象。`

  const text = await requestText(ADD_SYSTEM, user, settings, { signal, maxTokens: 1600 })
  const norm = normalizeSlide(extractJson(text))
  if (!norm) throw new Error(t('err.noJson'))
  // A second cover/end would break the deck's structural anchors — demote it.
  if (norm.layout === 'cover' || norm.layout === 'end')
    norm.layout = norm.bullets || norm.body ? 'bullets' : 'section'
  // Same guard as relayout: a declared layout whose key fields were stripped
  // by normalization would insert a visually empty page — fail so the op is
  // counted as skipped instead.
  if (!layoutHasContent(norm, norm.layout)) throw new Error(t('err.noJson'))
  return norm
}
