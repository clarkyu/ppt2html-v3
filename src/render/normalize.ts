import {
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
    const heading = asString(o.heading)
    if (!heading) continue
    const tone = asString(o.tone)
    out.push({
      heading,
      points: asStringArray(o.points),
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
    const label = asString(o.label)
    if (!label) continue
    out.push({ label, text: asString(o.text) })
  }
  return out.length ? out : undefined
}

function asSlideBg(v: unknown): SlideBg | undefined {
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  const url = asString(o.url)
  if (!url || !/^https?:\/\//i.test(url)) return undefined
  return {
    url,
    source: asString(o.source) ?? 'unknown',
    credit: asString(o.credit),
    link: asString(o.link),
  }
}

function coerceLayout(v: unknown, slide: Record<string, unknown>): SlideLayout {
  const raw = typeof v === 'string' ? v.trim() : ''
  if (LAYOUT_SET.has(raw)) return raw as SlideLayout
  // Best-effort inference when the model gives an unknown / missing layout.
  if (slide.code) return 'code'
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

  const slide: Slide = {
    layout,
    title: asString(o.title),
    subtitle: asString(o.subtitle),
    eyebrow: asString(o.eyebrow),
    bullets: asStringArray(o.bullets),
    left: asColumn(o.left),
    right: asColumn(o.right),
    value: asString(o.value),
    caption: asString(o.caption),
    text: asString(o.text),
    author: asString(o.author),
    items: asCompareItems(o.items),
    steps: asTimelineSteps(o.steps),
    code: asString(o.code),
    language: asString(o.language),
    body: asString(o.body),
    note: asString(o.note),
    imageQuery: asString(o.imageQuery),
    bg: asSlideBg(o.bg),
    bgOff: o.bgOff === true ? true : undefined,
  }

  // Drop slides that would render empty.
  const hasContent =
    slide.title ||
    slide.subtitle ||
    slide.bullets ||
    slide.left ||
    slide.right ||
    slide.value ||
    slide.text ||
    slide.items ||
    slide.steps ||
    slide.code ||
    slide.body
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
  meta: { prompt: string; model?: string; theme?: ThemeName; id?: string; createdAt?: number },
): Deck {
  const slides = (Array.isArray(spec.slides) ? spec.slides : [])
    .map(normalizeSlide)
    .filter((s): s is Slide => s !== null)

  // Guarantee a title slide up front.
  const firstCover = slides.find((s) => s.layout === 'cover')
  const title =
    asString(spec.title) || firstCover?.title || meta.prompt.slice(0, 40) || '未命名课件'

  if (!firstCover) {
    slides.unshift({ layout: 'cover', title, subtitle: asString(spec.subtitle) })
  }

  // Guarantee a closing slide (in the deck's own language).
  if (slides.length && slides[slides.length - 1].layout !== 'end') {
    slides.push({ layout: 'end', title: deckIsCjk({ title, slides }) ? '谢谢观看' : 'Thank You' })
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
