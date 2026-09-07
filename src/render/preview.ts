import type { CustomTheme, Deck, Slide, ThemeName } from '../types'
import { renderSlideInner, slideBgHtml, slideCreditHtml } from './layouts'
import { applyCustomTheme } from './customTheme'
import { fitSlide } from './fit'
import { escapeHtml } from '../lib/markdown'
import './themes.css'
import './slides.css'

/**
 * Render a static, scaled preview of a single arbitrary slide into `container`
 * (expected to carry the `.thumb` class for the visibility overrides).
 * Returns a cleanup function. Pass `custom` to preview a "我的风格" palette.
 */
export function mountSlidePreview(
  container: HTMLElement,
  theme: ThemeName,
  slide: Slide,
  custom?: CustomTheme,
): () => void {
  container.innerHTML =
    `<div class="thumb__stage">` +
    `<div class="player theme-${escapeHtml(theme)}">` +
    `<div class="player__bg"></div>` +
    `<div class="reveal deck"><div class="slides">` +
    `<section class="deck-slide" data-layout="${escapeHtml(slide.layout)}">${slideBgHtml(slide)}${renderSlideInner(slide)}${slideCreditHtml(slide)}</section>` +
    `</div></div></div></div>`

  applyCustomTheme(container.querySelector<HTMLElement>('.player')!, custom)
  fitSlide(container)

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

/**
 * Render a static, scaled-down preview of a deck's first slide into `container`
 * (expected to be a `.thumb` element). Returns a cleanup function.
 */
export function mountThumb(container: HTMLElement, deck: Deck): () => void {
  // A stored deck with no slides or a corrupt first slide (old import,
  // hand-edited backup) must not throw here — one bad thumbnail used to blank
  // the entire library.
  const cover = deck.slides?.[0]
  let coverHtml = ''
  try {
    coverHtml = cover ? `${slideBgHtml(cover)}${renderSlideInner(cover)}` : ''
  } catch {
    coverHtml = ''
  }
  container.innerHTML =
    `<div class="thumb__stage">` +
    `<div class="player theme-${escapeHtml(deck.theme)}">` +
    `<div class="player__bg"></div>` +
    `<div class="reveal deck"><div class="slides">` +
    `<section class="deck-slide">${coverHtml}</section>` +
    `</div></div></div></div>`

  applyCustomTheme(container.querySelector<HTMLElement>('.player')!, deck.customTheme)
  fitSlide(container)

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
