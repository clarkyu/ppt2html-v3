// Generative slide illustrations (BYOK): any OpenAI-compatible images endpoint
// (/images/generations — OpenAI dall-e-3 / gpt-image-1, SiliconFlow Kolors…).
// Purely opt-in from the editor; the result is stored as a data URL on the
// slide so it survives replays, exports and PPTX embedding without re-billing.

import type { Deck, Slide, SlideBg } from '../types'
import type { LlmSettings } from '../llm/settings'
import { t } from '../i18n'

export function genImageConfigured(settings: LlmSettings): boolean {
  return !!settings.imageGen.apiKey.trim() && !!settings.imageGen.baseUrl.trim()
}

/** A stable-but-specific prompt: the slide's image keywords + a style guard. */
export function genImagePrompt(slide: Slide, deck: Deck): string {
  const subject = (slide.imageQuery ?? '').trim() || (slide.title ?? deck.title ?? '').trim()
  return (
    `${subject}. Soft, atmospheric illustration for a presentation slide background: ` +
    `muted colors, gentle gradients, lots of negative space, wide 16:9 composition. ` +
    `No text, no letters, no words, no logos, no watermarks.`
  )
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`
}

/**
 * Generate one background illustration for a slide. Resolves to a SlideBg with
 * a data-URL image. Throws localized errors for the editor to toast.
 */
export async function generateSlideImage(
  slide: Slide,
  deck: Deck,
  settings: LlmSettings,
  signal?: AbortSignal,
): Promise<SlideBg> {
  const cfg = settings.imageGen
  const model = cfg.model.trim() || 'dall-e-3'
  const body: Record<string, unknown> = {
    model,
    prompt: genImagePrompt(slide, deck),
    n: 1,
    size: '1792x1024',
  }
  // gpt-image-* models reject `response_format` (they always return b64).
  if (!/^gpt-image/i.test(model)) body.response_format = 'b64_json'

  const res = await fetch(joinUrl(cfg.baseUrl, '/images/generations'), {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey.trim()}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 160)
    throw new Error(`${t('ed.genImgFailed')}${detail ? `（${detail}）` : ''}`)
  }
  const json = (await res.json().catch(() => ({}))) as { data?: Array<{ b64_json?: string; url?: string }> }
  const item = json.data?.[0]
  if (item?.b64_json) {
    return { url: `data:image/png;base64,${item.b64_json}`, source: 'ai', credit: `AI · ${model}` }
  }
  // Some providers only return a URL — fetch it into a data URL so the image
  // outlives the provider's short-lived link (best-effort; CORS permitting).
  if (item?.url) {
    const img = await fetch(item.url, { signal }).then((r) => (r.ok ? r.blob() : Promise.reject(new Error('fetch'))))
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = () => reject(new Error('read'))
      r.readAsDataURL(img)
    })
    return { url: dataUrl, source: 'ai', credit: `AI · ${model}` }
  }
  throw new Error(t('ed.genImgFailed'))
}
