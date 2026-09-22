import {
  type Branding,
  type Deck,
  type DeckSpec,
  type Slide,
  type SlideBg,
  type SlideLayout,
  type ThemeName,
  type Column,
  type CompareItem,
  type TimelineStep,
  LAYOUTS,
  THEMES,
} from '../types'
import { genId } from '../lib/dom'
import { deckIsCjk } from '../lib/lang'
import { semIconKey } from './semanticIcons'
import { sanitizeCustomTheme } from './customTheme'
import { MATERIAL_MAX_CHARS } from '../llm/prompt'
import { clampChars } from '../lib/materialSlice'

const LAYOUT_SET = new Set<string>(LAYOUTS)
const THEME_SET = new Set<string>(THEMES)

function asString(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined
  if (typeof v === 'number') return String(v)
  return undefined
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out = v.map((x) => asString(x)).filter((x): x is string => !!x)
  return out.length ? out : undefined
}

/** Bullets accept plain strings or {text, icon} objects (semantic bullet icons). */
function asBullets(v: unknown): { texts?: string[]; icons?: Array<string | undefined> } {
  if (!Array.isArray(v)) return {}
  const texts: string[] = []
  const icons: Array<string | undefined> = []
  let anyIcon = false
  for (const item of v) {
    if (typeof item === 'string' || typeof item === 'number') {
      const s = asString(item)
      if (!s) continue
      texts.push(s)
      icons.push(undefined)
    } else if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>
      const s = asString(o.text) ?? asString(o.content)
      if (!s) continue
      const icon = semIconKey(o.icon)
      texts.push(s)
      icons.push(icon)
      if (icon) anyIcon = true
    }
  }
  if (!texts.length) return {}
  return { texts, icons: anyIcon ? icons : undefined }
}

function asStats(v: unknown): Array<{ value: string; label: string }> | undefined {
  if (!Array.isArray(v)) return undefined
  const out: Array<{ value: string; label: string }> = []
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    const value = asString(o.value)
    if (!value) continue
    out.push({ value, label: asString(o.label) ?? '' })
    if (out.length >= 4) break
  }
  return out.length ? out : undefined
}

function asColumn(v: unknown): Column | undefined {
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  const col: Column = {
    heading: asString(o.heading),
    bullets: asStringArray(o.bullets),
    body: asString(o.body),
  }
  return col.heading || col.bullets || col.body ? col : undefined
}

function asCompareItems(v: unknown): CompareItem[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: CompareItem[] = []
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    // The editor allows a heading-less card that only carries points — keep
    // anything content-bearing rather than dropping the whole card.
    const heading = asString(o.heading) ?? ''
    const points = asStringArray(o.points)
    if (!heading && !points) continue
    const tone = asString(o.tone)
    out.push({
      heading,
      points,
      tone: tone === 'positive' || tone === 'negative' ? tone : 'neutral',
    })
  }
  return out.length ? out : undefined
}

function asTimelineSteps(v: unknown): TimelineStep[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: TimelineStep[] = []
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    const label = asString(o.label) ?? ''
    const text = asString(o.text)
    if (!label && !text) continue // keep label-less steps that carry text
    out.push({ label, text })
  }
  return out.length ? out : undefined
}

/** Where a background may come from (src/images/*); anything else → 'unknown'
 * so a prototype-key `source` can never reach an object lookup. */
const BG_SOURCES = new Set(['unsplash', 'pexels', 'pixabay', 'openverse', 'abstract', 'ai', 'unknown'])
/** Strict data-URL grammar for images: `data:image/<type>[;param[=value]]*,…`
 * (covers `;base64`, `;charset=utf-8` and the common non-standard `;utf8`). */
const DATA_IMAGE_RE = /^data:image\/[a-z0-9.+-]+(;[a-z0-9.+-]+(=[a-z0-9.+-]+)?)*,/i
const IMAGE_URL_MAX = 3_000_000

/** An image URL we are willing to put into a src/background sink. */
function asImageUrl(v: unknown): string | undefined {
  const url = asString(v)
  if (!url || url.length > IMAGE_URL_MAX) return undefined
  return /^https?:\/\//i.test(url) || DATA_IMAGE_RE.test(url) ? url : undefined
}

function asSlideBg(v: unknown): SlideBg | undefined {
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  // http(s) photos, or data:image/ (generated abstract SVGs / AI illustrations
  // already stored on a deck — a backup restore must not lose them). Anything
  // else (javascript:, blob:, relative) is dropped; bgCssUrl encodes the rest.
  const url = asImageUrl(o.url)
  if (!url) return undefined
  const source = asString(o.source) ?? 'unknown'
  const link = asString(o.link)
  const licenseUrl = asString(o.licenseUrl)
  return {
    url,
    source: BG_SOURCES.has(source) ? source : 'unknown',
    credit: asString(o.credit),
    link: link && /^https?:\/\//i.test(link) ? link : undefined,
    license: asString(o.license)?.slice(0, 40),
    licenseUrl: licenseUrl && /^https?:\/\//i.test(licenseUrl) ? licenseUrl : undefined,
  }
}

/** Branding fields are user text that lands in innerHTML sinks (escaped there)
 * and a logo URL that lands in a src attribute — allow only image-ish schemes. */
export function sanitizeBranding(v: unknown): Branding | undefined {
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  const short = (x: unknown): string | undefined => asString(x)?.slice(0, 120)
  const b: Branding = { presenter: short(o.presenter), org: short(o.org), date: short(o.date), logo: asImageUrl(o.logo) }
  return b.presenter || b.org || b.date || b.logo ? b : undefined
}

function coerceLayout(v: unknown, slide: Record<string, unknown>): SlideLayout {
  const raw = typeof v === 'string' ? v.trim() : ''
  if (LAYOUT_SET.has(raw)) return raw as SlideLayout
  // Best-effort inference when the model gives an unknown / missing layout.
  if (slide.code) return 'code'
  if (Array.isArray(slide.stats)) return 'stats'
  if (slide.value) return 'big-number'
  if (slide.text && slide.author) return 'quote'
  if (Array.isArray(slide.items)) return 'comparison'
  if (Array.isArray(slide.steps)) return 'timeline'
  if (slide.left || slide.right) return 'two-col'
  if (Array.isArray(slide.bullets)) return 'bullets'
  return 'section'
}

export function normalizeSlide(raw: unknown): Slide | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const layout = coerceLayout(o.layout, o)

  const b = asBullets(o.bullets)
  const slide: Slide = {
    layout,
    title: asString(o.title),
    subtitle: asString(o.subtitle),
    eyebrow: asString(o.eyebrow),
    bullets: b.texts,
    bulletIcons: b.icons,
    stats: asStats(o.stats),
    left: asColumn(o.left),
    right: asColumn(o.right),
    value: asString(o.value),
    caption: asString(o.caption),
    text: asString(o.text),
    author: asString(o.author),
    items: asCompareItems(o.items),
    steps: asTimelineSteps(o.steps),
    // Code keeps its whitespace (first-line indentation, trailing newline): the
    // editor stores it verbatim and a restore/share must not reflow it.
    code: typeof o.code === 'string' && o.code.trim() ? o.code : undefined,
    language: asString(o.language),
    body: asString(o.body),
    note: asString(o.note),
    imageQuery: asString(o.imageQuery),
    bg: asSlideBg(o.bg),
    bgOff: o.bgOff === true ? true : undefined,
  }

  // Drop slides that would render empty. A picture-only image-text page, an
  // eyebrow-only divider or a note-carrying page is NOT empty (the editor
  // produces all three), so those fields count too.
  const hasContent =
    slide.title ||
    slide.subtitle ||
    slide.eyebrow ||
    slide.bullets ||
    slide.stats ||
    slide.left ||
    slide.right ||
    slide.value ||
    slide.caption ||
    slide.text ||
    slide.author ||
    slide.items ||
    slide.steps ||
    slide.code ||
    slide.body ||
    slide.note ||
    slide.bg
  return hasContent ? slide : null
}

function pickTheme(specTheme: unknown, fallback?: ThemeName): ThemeName {
  const t = typeof specTheme === 'string' ? specTheme.trim() : ''
  if (THEME_SET.has(t)) return t as ThemeName
  return fallback ?? 'aurora'
}

/** Validate + normalize a loose model/sample spec into a renderable Deck. */
export function normalizeDeck(
  spec: DeckSpec,
  meta: { prompt: string; model?: string; theme?: ThemeName; id?: string; createdAt?: number; fill?: boolean },
): Deck {
  const slides = (Array.isArray(spec.slides) ? spec.slides : [])
    .map(normalizeSlide)
    .filter((s): s is Slide => s !== null)

  const firstCover = slides.find((s) => s.layout === 'cover')
  const title =
    asString(spec.title) || firstCover?.title || meta.prompt.slice(0, 40) || '未命名课件'

  // Guarantee a title slide up front and a closing slide (in the deck's own
  // language) — for fresh model output only (`fill` defaults on). A stored
  // deck the user edited may legitimately lack either (cover deleted, a page
  // added after the end) and must come back exactly as saved.
  if (meta.fill !== false) {
    if (!firstCover) {
      slides.unshift({ layout: 'cover', title, subtitle: asString(spec.subtitle) })
    }
    if (slides.length && slides[slides.length - 1].layout !== 'end') {
      slides.push({ layout: 'end', title: deckIsCjk({ title, slides }) ? '谢谢观看' : 'Thank You' })
    }
  }

  const now = meta.createdAt ?? Date.now()
  return {
    id: meta.id ?? genId(),
    title,
    subtitle: asString(spec.subtitle),
    theme: pickTheme(spec.theme, meta.theme),
    slides,
    prompt: meta.prompt,
    model: meta.model,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Trust boundary for a whole deck object that did NOT come from this app's own
 * generator: share-link payloads (attacker-controllable) and backup files
 * (user-controllable, possibly hand-edited or from an older version). Every
 * field is re-validated — layouts, theme, tones, URLs, palette, branding — so
 * nothing unnormalized can reach an innerHTML/attribute sink or IndexedDB.
 * Returns null when no slide survives (an empty deck would crash the library
 * thumbnails and the player).
 */
/** Hard ceiling on pages accepted from outside — a deflated share link can
 * pack hundreds of thousands of repetitive slides into a few KB and freeze
 * the receiver's tab for minutes while reveal mounts them. */
export const DECK_MAX_SLIDES = 400

/** A stored slide keeps icons in the parallel `bulletIcons` array while the
 * model emits them inline ({text, icon}); fold the stored form into the inline
 * one so normalizeSlide (unchanged for the generator path) keeps them. */
function inlineStoredIcons(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const o = raw as Record<string, unknown>
  if (!Array.isArray(o.bullets) || !Array.isArray(o.bulletIcons)) return raw
  const icons = o.bulletIcons
  return {
    ...o,
    bullets: o.bullets.map((b, i) => (typeof b === 'string' && semIconKey(icons[i]) ? { text: b, icon: icons[i] } : b)),
  }
}

export function sanitizeDeck(
  raw: unknown,
  opts: { id?: string; allowMaterial: boolean; now: number },
): Deck | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!Array.isArray(o.slides)) return null
  const slides = o.slides.slice(0, DECK_MAX_SLIDES).map(inlineStoredIcons)
  if (!slides.some((s) => normalizeSlide(s))) return null
  const id = opts.id ?? (typeof o.id === 'string' && o.id.trim() ? o.id.trim() : undefined)
  const createdAt = typeof o.createdAt === 'number' && Number.isFinite(o.createdAt) ? o.createdAt : opts.now
  const deck = normalizeDeck(
    { title: o.title, subtitle: o.subtitle, theme: o.theme, slides } as DeckSpec,
    { prompt: asString(o.prompt) ?? '', model: asString(o.model), id, createdAt, fill: false },
  )
  deck.updatedAt = typeof o.updatedAt === 'number' && Number.isFinite(o.updatedAt) ? o.updatedAt : createdAt
  deck.customTheme = sanitizeCustomTheme(o.customTheme)
  deck.branding = sanitizeBranding(o.branding)
  // deck.material is a local-only contract (share must never carry it); the
  // restore path keeps it so speaker scripts can still quote real facts.
  const material = opts.allowMaterial && typeof o.material === 'string' ? o.material.trim() : ''
  if (material) deck.material = clampChars(material, MATERIAL_MAX_CHARS)
  return deck
}
