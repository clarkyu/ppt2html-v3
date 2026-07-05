import type { Deck } from '../types'
import { renderSlideInner, slideBgHtml, slideCreditHtml } from './layouts'
import { escapeHtml } from '../lib/markdown'

/**
 * Render a deck to the innerHTML of a reveal.js `.slides` container:
 * one `<section>` per slide. Each slide also gets a page number ("X / total")
 * and, when it belongs to a chapter (环节), a section label ("环节 N · 主题").
 * Section membership is derived by walking the deck: every `section`-layout
 * slide starts a new chapter.
 */
export function renderDeckSlides(deck: Deck): string {
  const total = deck.slides.length
  let sectionNum = 0
  let sectionTitle = ''

  return deck.slides
    .map((slide, i) => {
      if (slide.layout === 'section') {
        sectionNum += 1
        sectionTitle = (slide.title ?? '').trim()
      }
      const note = slide.note ? `<aside class="notes">${escapeHtml(slide.note)}</aside>` : ''

      // Section label on content slides within a chapter (not the cover / end /
      // the divider itself, which already shows the chapter title big).
      const showSection =
        sectionNum > 0 && slide.layout !== 'cover' && slide.layout !== 'end' && slide.layout !== 'section'
      const sectionHtml = showSection
        ? `<div class="deck-slide__section">环节 ${sectionNum}${sectionTitle ? ` · ${escapeHtml(sectionTitle)}` : ''}</div>`
        : ''
      const pageHtml = `<div class="deck-slide__pagenum">${i + 1} / ${total}</div>`

      return (
        `<section data-layout="${slide.layout}" class="deck-slide">` +
        slideBgHtml(slide) +
        renderSlideInner(slide) +
        sectionHtml +
        pageHtml +
        slideCreditHtml(slide) +
        note +
        `</section>`
      )
    })
    .join('\n')
}
