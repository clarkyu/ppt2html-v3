// Types for qualityContract.js (plain ESM shared with scripts/eval). Keep in
// step with the JS — this file is what the app compiles against.
import type { Slide } from '../types'

export interface QualityIssue {
  /** e.g. 'bullet.tooLong', 'anchor.missing' — see TEXT in qualityContract.js */
  code: string
  params: Record<string, string | number>
}

export type QualityLang = 'zh' | 'en'

export const LIMITS: {
  title: number
  subtitle: number
  bullets: { count: number; len: number; min: number }
  twoCol: { count: number; len: number; min: number }
  comparison: { cards: number; points: number; len: number }
  timeline: { steps: number; len: number }
  imageText: number
  code: { lines: number; cols: number }
  bigNumberCaption: number
  statsLabel: number
}
export const CONTENT_LAYOUTS: ReadonlySet<string>
export const ANCHOR_EXEMPT: ReadonlySet<string>
export const CAPACITY_CODES: ReadonlySet<string>

export function hasCjk(s: unknown): boolean
export function strip(s: unknown): string
export function textLen(s: unknown): number
export function wordCount(s: unknown): number
export function labelLike(b: unknown): boolean
export function sentenceLike(b: unknown): boolean
export function hasNumberAnchor(text: string): boolean
export function hasCaseAnchor(text: string): boolean
export function hasAnchor(text: string): boolean
export function bulletTexts(s: Slide): string[]
export function slideText(s: Slide): string
export function slideTextRaw(s: Slide): string
export function slideIssues(s: Slide): QualityIssue[]
export function deckLanguage(deck: { title?: string; slides?: Slide[] }): QualityLang
export function formatIssue(issue: QualityIssue, lang: QualityLang): string
