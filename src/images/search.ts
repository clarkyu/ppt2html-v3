// Per-page background image search. Runs entirely in the user's browser
// (this is a no-backend static app). Hybrid source, matching the app's
// system-fallback + BYOK ethos:
//   - free Openverse (CC-licensed, no key, works out of the box), or
//   - the user's own Unsplash / Pexels key when provided (better quality).
//
// All lookups are best-effort: any network / CORS / rate-limit error resolves
// to null so generation never breaks — a page simply keeps its theme gradient.

import type { Deck, Slide, SlideBg } from '../types'
import type { LlmSettings } from '../llm/settings'

const REQ_TIMEOUT = 10000
const CONCURRENCY = 4

interface SearchOpts {
  signal?: AbortSignal
  /** URLs already used elsewhere in the deck, to avoid repeats. */
  exclude?: Set<string>
}

/** Search a subtle background image for `query`. Best-effort → null on failure. */
export async function searchImage(
  query: string,
  settings: LlmSettings,
  opts: SearchOpts = {},
): Promise<SlideBg | null> {
  const q = query.trim()
  if (!q) return null
  try {
    const unsplashKey = settings.images.unsplashKey.trim()
    const pexelsKey = settings.images.pexelsKey.trim()
    const candidates = unsplashKey
      ? await unsplash(q, unsplashKey, opts.signal)
      : pexelsKey
        ? await pexels(q, pexelsKey, opts.signal)
        : await openverse(q, opts.signal)
    const pick = candidates.find((c) => !opts.exclude?.has(c.url)) ?? candidates[0]
    return pick ?? null
  } catch {
    return null
  }
}

/**
 * Fill in `bg` for every slide that lacks one (when images are enabled).
 * Concurrency-limited and best-effort; mutates `deck` in place.
 */
export async function populateDeckImages(
  deck: Deck,
  settings: LlmSettings,
  opts: {
    signal?: AbortSignal
    onProgress?: (done: number, total: number) => void
    /** Called as soon as each slide's image resolves (index into deck.slides). */
    onImage?: (slideIndex: number, bg: SlideBg) => void
  } = {},
): Promise<void> {
  if (!settings.images.enabled) return
  const targets = deck.slides
    .map((slide, index) => ({ slide, index }))
    .filter((t) => !t.slide.bg)
  const total = targets.length
  if (!total) return

  const used = new Set<string>()
  for (const s of deck.slides) if (s.bg?.url) used.add(s.bg.url)

  let done = 0
  let idx = 0
  const worker = async (): Promise<void> => {
    while (idx < targets.length) {
      if (opts.signal?.aborted) return
      const { slide, index } = targets[idx++]
      const bg = await searchImage(queryForSlide(slide, deck), settings, {
        signal: opts.signal,
        exclude: used,
      })
      if (bg) {
        slide.bg = bg
        used.add(bg.url)
        opts.onImage?.(index, bg)
      }
      done++
      opts.onProgress?.(done, total)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker))
}

/** Derive a search query for a slide: model hint first, else its text. */
export function queryForSlide(slide: Slide, deck: Deck): string {
  const hint = slide.imageQuery?.trim()
  if (hint) return hint
  const text = plain(slide.title || slide.eyebrow || slide.value || slide.caption || '')
  return text || plain(deck.title) || deck.prompt || 'abstract background'
}

function plain(s: string): string {
  return s
    .replace(/[*_`#>~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

/* ------------------------------- providers ------------------------------- */

async function openverse(q: string, signal?: AbortSignal): Promise<SlideBg[]> {
  const url =
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}` +
    `&page_size=6&aspect_ratio=wide&mature=false`
  const data = await getJson(url, {}, signal)
  const results = Array.isArray(data?.results) ? data.results : []
  return results
    .map((r: Record<string, unknown>): SlideBg | null => {
      const thumb = typeof r.thumbnail === 'string' ? r.thumbnail : ''
      if (!thumb) return null
      const credit = [r.creator, r.provider].filter((x) => typeof x === 'string').join(' · ')
      return {
        url: thumb,
        source: 'openverse',
        credit: credit || undefined,
        link: typeof r.foreign_landing_url === 'string' ? r.foreign_landing_url : undefined,
      }
    })
    .filter((x: SlideBg | null): x is SlideBg => x !== null)
}

async function unsplash(q: string, key: string, signal?: AbortSignal): Promise<SlideBg[]> {
  const url =
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}` +
    `&per_page=6&orientation=landscape&content_filter=high`
  const data = await getJson(url, { Authorization: `Client-ID ${key}` }, signal)
  const results = Array.isArray(data?.results) ? data.results : []
  return results
    .map((r: Record<string, any>): SlideBg | null => {
      const u = r?.urls?.regular
      if (typeof u !== 'string') return null
      return {
        url: u,
        source: 'unsplash',
        credit: typeof r?.user?.name === 'string' ? r.user.name : undefined,
        link: typeof r?.links?.html === 'string' ? r.links.html : undefined,
      }
    })
    .filter((x: SlideBg | null): x is SlideBg => x !== null)
}

async function pexels(q: string, key: string, signal?: AbortSignal): Promise<SlideBg[]> {
  const url =
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}` +
    `&per_page=6&orientation=landscape`
  const data = await getJson(url, { Authorization: key }, signal)
  const photos = Array.isArray(data?.photos) ? data.photos : []
  return photos
    .map((p: Record<string, any>): SlideBg | null => {
      const u = p?.src?.large2x || p?.src?.large || p?.src?.original
      if (typeof u !== 'string') return null
      return {
        url: u,
        source: 'pexels',
        credit: typeof p?.photographer === 'string' ? p.photographer : undefined,
        link: typeof p?.url === 'string' ? p.url : undefined,
      }
    })
    .filter((x: SlideBg | null): x is SlideBg => x !== null)
}

async function getJson(
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<any> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), REQ_TIMEOUT)
  const onAbort = () => ac.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    const res = await fetch(url, { headers, signal: ac.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}
