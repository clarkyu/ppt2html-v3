// The shared data contract between the AI generator, the renderer and the store.
// The LLM is asked to emit a `DeckSpec` (loose, forgiving); we validate/normalize
// it into a `Deck` before rendering or persisting.

export const THEMES = ['aurora', 'ink', 'sunrise', 'forest', 'noir'] as const
export type ThemeName = (typeof THEMES)[number]

export const LAYOUTS = [
  'cover',
  'section',
  'bullets',
  'two-col',
  'big-number',
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

/** One slide. Fields are optional; only those relevant to `layout` are used. */
export interface Slide {
  layout: SlideLayout
  title?: string
  subtitle?: string
  eyebrow?: string
  bullets?: string[]
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
}

/** A fully validated, renderable deck. */
export interface Deck {
  id: string
  title: string
  subtitle?: string
  theme: ThemeName
  slides: Slide[]
  /** Original one-sentence prompt the user typed. */
  prompt: string
  createdAt: number
  updatedAt: number
  /** Model id used to generate it, for reference. */
  model?: string
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
