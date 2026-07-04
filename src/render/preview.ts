import type { Deck } from '../types'
import { renderSlideInner } from './layouts'
import './themes.css'
import './slides.css'

/**
 * Render a static, scaled-down preview of a deck's first slide into `container`
 * (expected to be a `.thumb` element). Returns a cleanup function.
 */
export function mountThumb(container: HTMLElement, deck: Deck): () => void {
  const cover = deck.slides[0]
  container.innerHTML =
    `<div class="thumb__stage">` +
    `<div class="player theme-${deck.theme}">` +
    `<div class="player__bg"></div>` +
    `<div class="reveal deck"><div class="slides">` +
    `<section class="deck-slide">${renderSlideInner(cover)}</section>` +
    `</div></div></div></div>`

  const stage = container.querySelector<HTMLElement>('.thumb__stage')!
  const fit = () => {
    const w = container.clientWidth
    if (w) stage.style.transform = `scale(${w / 1280})`
  }
  fit()
  const ro = new ResizeObserver(fit)
  ro.observe(container)
  return () => ro.disconnect()
}
