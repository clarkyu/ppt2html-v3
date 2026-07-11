// Rehearsal timing: estimate how long each page should take to present from
// its speaker script (falling back to the visible content), so the presenter
// can practice against a per-page budget. Speaking rates: ~4 CJK chars/sec,
// ~2.5 English words/sec — standard comfortable presentation pace.

import type { Deck, Slide } from '../types'
import { speechText } from './narrate'

const CJK_RE = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/g

/** Seconds a presenter needs for this slide (≥8s floor for glance pages). */
export function estimateSeconds(slide: Slide): number {
  const text = (slide.note ?? '').trim() || speechText(slide)
  const cjkChars = (text.match(CJK_RE) ?? []).length
  const words = text.replace(CJK_RE, ' ').split(/\s+/).filter(Boolean).length
  return Math.max(8, Math.round(cjkChars / 4 + words / 2.5))
}

/** Per-page budgets + the deck total, in seconds. */
export function deckBudget(deck: Deck): { pages: number[]; total: number } {
  const pages = deck.slides.map(estimateSeconds)
  return { pages, total: pages.reduce((a, b) => a + b, 0) }
}

export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const mm = Math.floor(s / 60)
  const ss = s % 60
  return `${mm}:${String(ss).padStart(2, '0')}`
}
