import Reveal from 'reveal.js'
import type { RevealApi } from 'reveal.js'
import 'reveal.js/reveal.css'
import '../render/themes.css'
import '../render/slides.css'
import './player.css'

import type { Deck, SlideBg } from '../types'
import { renderDeckSlides } from '../render/renderDeck'
import { bgCssUrl, creditHtml, imgtextVisualInner } from '../render/layouts'
import { applyCustomTheme } from '../render/customTheme'
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
  /** Toggle click-to-reveal fragment stepping (persisted preference). */
  setStepMode: (on: boolean) => void
  stepMode: () => boolean
}

const STEP_PREF_KEY = 'ppt2html.stepmode'

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
  // We render our own page number baked into each slide (also shows in print),
  // so reveal's built-in number is off to avoid duplication.
  slideNumber: false as const,
  // Show each slide's full content as soon as you land on it — no click-to-reveal
  // stepping. (Bullets etc. carry a `.fragment` class; keeping stepping on made
  // freshly-flipped slides look blank, esp. behind a background image.)
  fragments: false,
  hash: false,
  respondToHashChanges: false,
  history: false,
  keyboard: true,
  overview: true,
  center: true,
  touch: true,
  // Keep PPT-style slide playback on phones. reveal.js auto-switches to its
  // vertical "scroll view" when the viewport is narrower than this (default
  // 435px), which on a portrait phone turns the deck into a scrolling web page
  // of tiny letterboxed slides you can't swipe through — users reported "can't
  // play on my phone". 0 disables that auto-activation (no viewport width is
  // ≤ 0) so swipe/tap navigation works at any width.
  scrollActivationWidth: 0,
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

  // Click-to-reveal stepping is a persisted preference: teaching decks want
  // bullets to appear one by one, business ones usually want the full page.
  let stepping = false
  try {
    stepping = localStorage.getItem(STEP_PREF_KEY) === '1'
  } catch {
    /* default off */
  }

  const root = document.createElement('div')
  root.className = `player theme-${deck.theme}${stepping ? ' player--step' : ''}`
  // A custom "我的风格" palette overrides the named theme via inline vars.
  applyCustomTheme(root, deck.customTheme)

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
    fragments: stepping,
    plugins: [],
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
      // image-text shows the image inside its framed visual, not full-bleed.
      if (sec.dataset.layout === 'image-text') {
        const vis = sec.querySelector<HTMLElement>('.s-imgtext__visual')
        if (vis) vis.innerHTML = imgtextVisualInner({ layout: 'image-text', bg })
        sec.querySelector<HTMLElement>('.deck-slide__bg')?.remove()
      } else {
        let bgEl = sec.querySelector<HTMLElement>('.deck-slide__bg')
        if (!bgEl) {
          bgEl = document.createElement('div')
          bgEl.className = 'deck-slide__bg'
          bgEl.setAttribute('aria-hidden', 'true')
          sec.insertBefore(bgEl, sec.firstChild)
        }
        // Generated backgrounds skip the photo darkening scrim.
        bgEl.classList.toggle('deck-slide__bg--gen', bg.source === 'abstract')
        bgEl.style.backgroundImage = css
      }
      // Refresh the attribution caption for the new image.
      sec.querySelector('.deck-slide__credit')?.remove()
      const credit = creditHtml(bg)
      if (credit) sec.insertAdjacentHTML('beforeend', credit)
    },
    setStepMode: (on) => {
      stepping = on
      root.classList.toggle('player--step', on)
      reveal.configure({ fragments: on })
      reveal.sync()
      try {
        localStorage.setItem(STEP_PREF_KEY, on ? '1' : '0')
      } catch {
        /* preference is best-effort */
      }
    },
    stepMode: () => stepping,
  }
}
