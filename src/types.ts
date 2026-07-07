// The shared data contract between the AI generator, the renderer and the store.
// The LLM is asked to emit a `DeckSpec` (loose, forgiving); we validate/normalize
// it into a `Deck` before rendering or persisting.

export const THEMES = ['aurora', 'ink', 'sunrise', 'forest', 'noir', 'sand', 'rose'] as const
export type ThemeName = (typeof THEMES)[number]

export const LAYOUTS = [
  'cover',
  'section',
  'bullets',
  'two-col',
  'big-number',
  'stats',
  'quote',
  'comparison',
  'timeline',
  'code',
  'image-text',
  'end',
] as const
export type SlideLayout = (typeof LAYOUTS)[number]

export interface Column {
  heading?: string
  bullets?: string[]
  body?: string
}

export interface CompareItem {
  heading: string
  points?: string[]
  tone?: 'positive' | 'negative' | 'neutral'
}

export interface TimelineStep {
  label: string
  text?: string
}

/** One card in a multi-number `stats` slide. */
export interface StatItem {
  /** Very short figure, e.g. "87%", "3×", "¥1.2亿". */
  value: string
  /** What the figure means (short). */
  label: string
}

/** Presenter / org / date / logo shown on the cover and as a per-slide mark. */
export interface Branding {
  /** Presenter name (人). */
  presenter?: string
  /** Organization / unit (单位). */
  org?: string
  /** Display date (日期), e.g. "2026-07-05". */
  date?: string
  /** Logo image: a data: URL (uploaded) or an http(s) URL. */
  logo?: string
}

/** A resolved, subtle background image for a slide (from an online search). */
export interface SlideBg {
  url: string
  /** 'openverse' | 'unsplash' | 'pexels' */
  source: string
  /** Attribution, e.g. "creator · provider". */
  credit?: string
  /** Link back to the source page. */
  link?: string
}

/** One slide. Fields are optional; only those relevant to `layout` are used. */
export interface Slide {
  layout: SlideLayout
  title?: string
  subtitle?: string
  eyebrow?: string
  bullets?: string[]
  /** Optional per-bullet semantic icon keys (parallel to `bullets`). */
  bulletIcons?: Array<string | undefined>
  /** Cards for the `stats` layout (2~4 parallel key figures). */
  stats?: StatItem[]
  left?: Column
  right?: Column
  value?: string
  caption?: string
  text?: string
  author?: string
  items?: CompareItem[]
  steps?: TimelineStep[]
  code?: string
  language?: string
  body?: string
  /** Optional speaker note, shown in the speaker view. */
  note?: string
  /** Short English keywords for a fitting background image (from the model). */
  imageQuery?: string
  /** Resolved subtle background image for this slide. */
  bg?: SlideBg
  /** User removed the background in the editor — auto-fill must not re-add one. */
  bgOff?: boolean
}

/**
 * A user-defined "我的风格": a base background color + two accents + a serif
 * toggle. Everything else (text/muted/card/code colors) is derived by luminance
 * at apply time (see render/customTheme.ts). When present on a deck it overrides
 * the named `theme` everywhere via inline CSS variables.
 */
export interface CustomTheme {
  /** Base background color, hex (e.g. "#0b1020"). */
  bg: string
  /** Primary accent, hex. */
  accent: string
  /** Secondary accent, hex. */
  accent2: string
  /** Serif display face when true, else the sans default. */
  serif: boolean
}

/** A fully validated, renderable deck. */
export interface Deck {
  id: string
  title: string
  subtitle?: string
  theme: ThemeName
  /** Optional custom palette; when set it overrides `theme` for rendering/export. */
  customTheme?: CustomTheme
  slides: Slide[]
  /** Original one-sentence prompt the user typed. */
  prompt: string
  createdAt: number
  updatedAt: number
  /** Model id used to generate it, for reference. */
  model?: string
  /** Presenter / org / date / logo (defaults from settings, editable per deck). */
  branding?: Branding
}

/** The loose shape we accept from the model before normalization. */
export interface DeckSpec {
  title?: string
  subtitle?: string
  theme?: string
  slides?: Array<Partial<Slide> & { layout?: string }>
}

export interface Clarification {
  question: string
  answer: string
}

export interface GenerateOptions {
  audience?: string
  tone?: string
  slideCount?: number
  /** Intended talk length in minutes; the page count is estimated from this. */
  durationMinutes?: number
  language?: string
  theme?: ThemeName
  /** User answers to the AI-generated clarifying questions. */
  clarifications?: Clarification[]
  /** One-line restatement of the user's intent, confirmed at the structure step. */
  understanding?: string
  /** Whether to generate rich, detailed page content (vs. a concise framework). */
  richContent?: boolean
}

/** One AI-generated clarifying question with quick-pick suggestions. */
export interface ClarifyQuestion {
  question: string
  options?: string[]
}

/** One slide in the pre-generation outline the user reviews and edits. */
export interface OutlineSlide {
  layout: SlideLayout
  title: string
  /** One-line summary of the slide's intended content. */
  brief?: string
}

/** The deck outline shown for confirmation before full generation. */
export interface Outline {
  title: string
  subtitle?: string
  theme: ThemeName
  slides: OutlineSlide[]
}

/** One top-level part/chapter of the deck, confirmed before page-level detailing. */
export interface Section {
  title: string
  /** One-line summary of what this part covers. */
  brief?: string
  /** Estimated number of pages for this part, including its section-divider page. */
  pages?: number
}

/** The high-level structure the user reviews first (parts), before pages. */
export interface Structure {
  /** AI's one-line restatement of the user's intent (editable). */
  understanding?: string
  title: string
  subtitle?: string
  theme: ThemeName
  sections: Section[]
}
