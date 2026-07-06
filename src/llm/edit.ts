import type { Deck, Slide } from '../types'
import type { LlmSettings } from './settings'
import { requestText } from './client'
import { extractJson } from './extractJson'
import { normalizeSlide } from '../render/normalize'
import { DECK_SCHEMA_GUIDE } from './prompt'
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
  return { ...norm, layout: slide.layout, bg: slide.bg, bgOff: slide.bgOff, imageQuery: slide.imageQuery }
}
