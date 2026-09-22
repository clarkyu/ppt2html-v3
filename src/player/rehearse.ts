// Rehearsal timing: estimate how long each page should take to present from
// its speaker script (falling back to the visible content), so the presenter
// can practice against a per-page budget. Speaking rates: ~4 CJK chars/sec,
// ~2.5 English words/sec — standard comfortable presentation pace.

import type { Deck, Slide } from '../types'
import { speechText } from './narrate'
import { cjkMatcher } from '../lib/lang'

/** Seconds a presenter needs for this slide (≥8s floor for glance pages). */
export function estimateSeconds(slide: Slide): number {
  const text = (slide.note ?? '').trim() || speechText(slide)
  const cjkChars = (text.match(cjkMatcher()) ?? []).length
  // Words = runs of letters/digits once CJK and punctuation are stripped: a
  // Chinese script's 。，、 used to count as English "words" and inflate the
  // budget of every CJK page.
  const words = text
    .replace(cjkMatcher(), ' ')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean).length
  return Math.max(8, Math.round(cjkChars / 4 + words / 2.5))
}

/** Per-page budgets + the deck total, in seconds. */
export function deckBudget(deck: Deck): { pages: number[]; total: number } {
  const pages = deck.slides.map(estimateSeconds)
  return { pages, total: pages.reduce((a, b) => a + b, 0) }
}

/** m:ss for rehearsal budgets. */
export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const mm = Math.floor(s / 60)
  const ss = s % 60
  return `${mm}:${String(ss).padStart(2, '0')}`
}

/** mm:ss (h:mm:ss past an hour) for elapsed-time clocks — the viewer bar and
 * the presenter window share this one instead of two private copies. */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return hh ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`
}
