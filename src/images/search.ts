// Per-page background image search. Runs entirely in the user's browser
// (this is a no-backend static app). Hybrid source, matching the app's
// system-fallback + BYOK ethos:
//   - free Openverse (CC-licensed, no key, works out of the box), or
//   - the user's own Unsplash / Pexels key when provided (better quality).
//
// All lookups are best-effort: any network / CORS / rate-limit error resolves
// to null so generation never breaks — a page simply keeps its theme gradient.

import type { Deck, Slide, SlideBg } from '../types'
import { effectiveImageProvider, type LlmSettings } from '../llm/settings'
import { abstractBg, resolveAbstractStyle } from './abstract'

const REQ_TIMEOUT = 10000
const CONCURRENCY = 4
const UTM = 'utm_source=ppt2html_v3&utm_medium=referral'

/** A search result plus Unsplash's download-tracking URL (stripped before use). */
type Candidate = SlideBg & { _download?: string }

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
    const { source, key } = effectiveImageProvider(settings)
    const candidates: Candidate[] =
      source === 'unsplash'
        ? await unsplash(q, key, opts.signal)
        : source === 'pexels'
          ? await pexels(q, key, opts.signal)
          : source === 'pixabay'
            ? await pixabay(q, key, opts.signal)
            : await openverse(q, opts.signal)
    const pick = candidates.find((c) => !opts.exclude?.has(c.url)) ?? candidates[0]
    if (!pick) return null
    // Unsplash API terms require pinging the download endpoint when a photo is used.
    if (pick.source === 'unsplash' && pick._download) void triggerUnsplashDownload(pick._download, key)
    const { _download, ...bg } = pick
    return bg
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
    // bgOff = the user explicitly removed this slide's background; respect it.
    .filter((t) => !t.slide.bg && !t.slide.bgOff)
  const total = targets.length
  if (!total) return

  // Abstract mode: generate a themed pattern per slide — instant, offline, no
  // search, no attribution. Seeded by the slide's text so it's stable. 'auto' is
  // resolved once per deck so every page shares one pattern family.
  if (settings.images.mode === 'abstract') {
    const style = resolveAbstractStyle(settings.images.abstractStyle, deck.id || deck.title || deck.theme)
    targets.forEach(({ slide, index }, i) => {
      if (opts.signal?.aborted) return
      const bg = abstractBg(`${queryForSlide(slide, deck)}#${index}`, deck.theme, style)
      slide.bg = bg
      opts.onImage?.(index, bg)
      opts.onProgress?.(i + 1, total)
    })
    return
  }

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

async function openverse(q: string, signal?: AbortSignal): Promise<Candidate[]> {
  const url =
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}` +
    `&page_size=6&aspect_ratio=wide&mature=false`
  const data = await getJson(url, {}, signal)
  const results = Array.isArray(data?.results) ? data.results : []
  return results
    .map((r: Record<string, unknown>): Candidate | null => {
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
    .filter((x: Candidate | null): x is Candidate => x !== null)
}

async function unsplash(q: string, key: string, signal?: AbortSignal): Promise<Candidate[]> {
  const url =
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}` +
    `&per_page=6&orientation=landscape&content_filter=high`
  const data = await getJson(url, { Authorization: `Client-ID ${key}` }, signal)
  const results = Array.isArray(data?.results) ? data.results : []
  return results
    .map((r: Record<string, any>): Candidate | null => {
      const u = r?.urls?.regular
      if (typeof u !== 'string') return null
      const html = typeof r?.links?.html === 'string' ? r.links.html : undefined
      return {
        url: u,
        source: 'unsplash',
        credit: typeof r?.user?.name === 'string' ? r.user.name : undefined,
        link: html ? `${html}?${UTM}` : undefined,
        _download: typeof r?.links?.download_location === 'string' ? r.links.download_location : undefined,
      }
    })
    .filter((x: Candidate | null): x is Candidate => x !== null)
}

async function pexels(q: string, key: string, signal?: AbortSignal): Promise<Candidate[]> {
  const url =
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}` +
    `&per_page=6&orientation=landscape`
  const data = await getJson(url, { Authorization: key }, signal)
  const photos = Array.isArray(data?.photos) ? data.photos : []
  return photos
    .map((p: Record<string, any>): Candidate | null => {
      const u = p?.src?.large2x || p?.src?.large || p?.src?.original
      if (typeof u !== 'string') return null
      return {
        url: u,
        source: 'pexels',
        credit: typeof p?.photographer === 'string' ? p.photographer : undefined,
        link: typeof p?.url === 'string' ? p.url : undefined,
      }
    })
    .filter((x: Candidate | null): x is Candidate => x !== null)
}

async function pixabay(q: string, key: string, signal?: AbortSignal): Promise<Candidate[]> {
  const url =
    `https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}` +
    `&image_type=photo&orientation=horizontal&safesearch=true&per_page=6&order=popular`
  const data = await getJson(url, {}, signal)
  const hits = Array.isArray(data?.hits) ? data.hits : []
  return hits
    .map((h: Record<string, any>): Candidate | null => {
      const u = h?.largeImageURL || h?.webformatURL
      if (typeof u !== 'string') return null
      return {
        url: u,
        source: 'pixabay',
        credit: typeof h?.user === 'string' ? h.user : undefined,
        link: typeof h?.pageURL === 'string' ? h.pageURL : undefined,
      }
    })
    .filter((x: Candidate | null): x is Candidate => x !== null)
}

/** Unsplash requires a GET to the photo's download_location when it's used. */
async function triggerUnsplashDownload(loc: string, key: string): Promise<void> {
  try {
    await fetch(loc, { headers: { Authorization: `Client-ID ${key}` } })
  } catch {
    /* best-effort; ignore */
  }
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
