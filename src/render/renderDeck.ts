import type { Deck } from '../types'
import { renderSlideInner } from './layouts'
import { escapeHtml } from '../lib/markdown'

/**
 * Render a deck to the innerHTML of a reveal.js `.slides` container:
 * one `<section>` per slide, with an optional speaker-note aside.
 */
export function renderDeckSlides(deck: Deck): string {
  return deck.slides
    .map((slide) => {
      const note = slide.note
        ? `<aside class="notes">${escapeHtml(slide.note)}</aside>`
        : ''
      return (
        `<section data-layout="${slide.layout}" class="deck-slide">` +
        renderSlideInner(slide) +
        note +
        `</section>`
      )
    })
    .join('\n')
}
