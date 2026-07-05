import Reveal from 'reveal.js'
import RevealNotes from 'reveal.js/plugin/notes'
import type { RevealApi } from 'reveal.js'
import 'reveal.js/reveal.css'
import '../render/themes.css'
import '../render/slides.css'
import './player.css'

import type { Deck, SlideBg } from '../types'
import { renderDeckSlides } from '../render/renderDeck'
import { bgCssUrl } from '../render/layouts'
import { fitSlide } from '../render/fit'

export interface PlayerHandle {
  reveal: RevealApi
  root: HTMLElement
  destroy: () => void
  toggleOverview: () => void
  next: () => void
  prev: () => void
  getIndices: () => { h: number; v: number }
  onSlideChange: (cb: (index: number, total: number) => void) => void
  /** Patch (or create) the background image of the slide at `index`, live. */
  setSlideBackground: (index: number, bg: SlideBg) => void
}

const REVEAL_CONFIG = {
  embedded: false,
  width: 1280,
  height: 720,
  margin: 0.04,
  minScale: 0.2,
  maxScale: 2.0,
  controls: true,
  controlsTutorial: false,
  controlsLayout: 'bottom-right' as const,
  progress: true,
  slideNumber: 'c/t' as const,
  hash: false,
  respondToHashChanges: false,
  history: false,
  keyboard: true,
  overview: true,
  center: true,
  touch: true,
  hideInactiveCursor: true,
  hideCursorTime: 3000,
  transition: 'slide' as const,
  transitionSpeed: 'default' as const,
  backgroundTransition: 'fade' as const,
}

/**
 * Mount a deck into `container` and start reveal.js.
 * Returns a handle for control + teardown.
 */
export function mountPlayer(container: HTMLElement, deck: Deck): PlayerHandle {
  container.innerHTML = ''

  const root = document.createElement('div')
  root.className = `player theme-${deck.theme}`

  const bg = document.createElement('div')
  bg.className = 'player__bg'
  root.appendChild(bg)

  const revealEl = document.createElement('div')
  revealEl.className = 'reveal deck'
  const slidesEl = document.createElement('div')
  slidesEl.className = 'slides'
  slidesEl.innerHTML = renderDeckSlides(deck)
  revealEl.appendChild(slidesEl)
  root.appendChild(revealEl)
  container.appendChild(root)

  const reveal: RevealApi = new Reveal(revealEl, {
    ...REVEAL_CONFIG,
    plugins: [RevealNotes],
  })

  // Fit the current slide so long titles and content never clip: shrink
  // oversized headings, then scale the whole block down if it still overflows.
  // Re-run on every slide change.
  const fitCurrent = () => {
    const cur = reveal.getCurrentSlide() as HTMLElement | null
    if (cur) fitSlide(cur)
  }
  reveal.on('ready', () => requestAnimationFrame(fitCurrent))
  reveal.on('slidechanged', fitCurrent)

  void reveal.initialize()

  return {
    reveal,
    root,
    destroy: () => {
      try {
        reveal.destroy()
      } catch {
        /* reveal may already be torn down */
      }
      container.innerHTML = ''
    },
    toggleOverview: () => reveal.toggleOverview(),
    next: () => reveal.next(),
    prev: () => reveal.prev(),
    getIndices: () => {
      const { h, v } = reveal.getIndices()
      return { h, v }
    },
    onSlideChange: (cb) => {
      const emit = () => cb(reveal.getSlidePastCount() + 1, reveal.getTotalSlides())
      reveal.on('slidechanged', emit)
      reveal.on('ready', emit)
    },
    setSlideBackground: (index, bg) => {
      const css = bgCssUrl(bg.url)
      if (!css) return
      const sec = slidesEl.children[index] as HTMLElement | undefined
      if (!sec) return
      let bgEl = sec.querySelector<HTMLElement>('.deck-slide__bg')
      if (!bgEl) {
        bgEl = document.createElement('div')
        bgEl.className = 'deck-slide__bg'
        bgEl.setAttribute('aria-hidden', 'true')
        sec.insertBefore(bgEl, sec.firstChild)
      }
      bgEl.style.backgroundImage = css
    },
  }
}
