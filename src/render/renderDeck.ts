import type { Deck, Branding } from '../types'
import { renderSlideInner, slideBgHtml, slideCreditHtml } from './layouts'
import { escapeHtml } from '../lib/markdown'
import { deckIsCjk } from '../lib/lang'

function validLogo(u?: string): string {
  const s = (u ?? '').trim()
  return /^(https?:\/\/|data:image\/)/i.test(s) ? s : ''
}

/** "presenter · org · date" line, for the cover / end slides. */
function brandLineHtml(b?: Branding): string {
  const parts = [b?.presenter, b?.org, b?.date].map((x) => (x ?? '').trim()).filter(Boolean)
  return parts.length ? `<div class="deck-slide__brand">${parts.map(escapeHtml).join(' · ')}</div>` : ''
}

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
  // Baked-in labels follow the deck's language (an English deck must not get
  // a Chinese "环节" corner label).
  const partWord = deckIsCjk(deck) ? '环节' : 'Part'

  const logo = validLogo(deck.branding?.logo)
  const logoHtml = logo ? `<img class="deck-slide__logo" src="${escapeHtml(logo)}" alt="">` : ''

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
        ? `<div class="deck-slide__section">${partWord} ${sectionNum}${sectionTitle ? ` · ${escapeHtml(sectionTitle)}` : ''}</div>`
        : ''
      const pageHtml = `<div class="deck-slide__pagenum">${i + 1} / ${total}</div>`
      // Section dividers get a giant ghost part number behind the content —
      // the page already knows its number, so give it presence.
      const ghostHtml =
        slide.layout === 'section'
          ? `<div class="deck-slide__ghost" aria-hidden="true">${String(sectionNum).padStart(2, '0')}</div>`
          : ''
      // Presenter · org · date on the title & closing slides.
      const brandHtml = slide.layout === 'cover' || slide.layout === 'end' ? brandLineHtml(deck.branding) : ''

      return (
        `<section data-layout="${slide.layout}" class="deck-slide">` +
        slideBgHtml(slide) +
        ghostHtml +
        renderSlideInner(slide) +
        logoHtml +
        sectionHtml +
        pageHtml +
        brandHtml +
        slideCreditHtml(slide) +
        note +
        `</section>`
      )
    })
    .join('\n')
}
