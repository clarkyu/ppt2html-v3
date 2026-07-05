// Overflow control for slides. Two layers, applied on every render (player
// slide-change + every preview), so both freshly generated and edited decks
// stay inside the 1280×720 canvas and never clip:
//
//   1. fitHeadings — shrink oversized titles/subtitles per element (keeps the
//      rest of the layout untouched; nicest for the common "long title" case).
//   2. fitSlide    — after headings are fitted, if the whole content block still
//      overflows the canvas, uniformly scale it down until it fits.

interface FitTarget {
  sel: string
  maxLines: number
  minScale: number
}

const TARGETS: FitTarget[] = [
  { sel: '.s-cover__title', maxLines: 3, minScale: 0.45 },
  { sel: '.s-cover__subtitle', maxLines: 2, minScale: 0.6 },
  { sel: '.s-section__title', maxLines: 3, minScale: 0.45 },
  { sel: '.s-section__subtitle', maxLines: 2, minScale: 0.6 },
  { sel: '.s-title', maxLines: 3, minScale: 0.5 },
  { sel: '.s-end__title', maxLines: 2, minScale: 0.5 },
  { sel: '.s-end__subtitle', maxLines: 2, minScale: 0.6 },
  { sel: '.s-big__value', maxLines: 2, minScale: 0.4 },
  { sel: '.s-big__caption', maxLines: 2, minScale: 0.6 },
  { sel: '.s-quote__text', maxLines: 5, minScale: 0.55 },
]

function fitOne(el: HTMLElement, maxLines: number, minScale: number): void {
  el.style.fontSize = '' // reset to the stylesheet's base size
  el.style.maxWidth = ''
  const base = parseFloat(getComputedStyle(el).fontSize)
  if (!base) return
  const min = base * minScale

  const fits = (): boolean => {
    const cs = getComputedStyle(el)
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2
    const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
    return el.scrollHeight <= lh * maxLines + pad + 2
  }
  const shrink = (): boolean => {
    let size = base
    for (let i = 0; i < 40; i++) {
      if (fits()) return true
      size = Math.max(min, size - base * 0.045)
      el.style.fontSize = `${size}px`
      if (size <= min) break
    }
    return fits()
  }

  if (shrink()) return
  // Extreme case (e.g. a long CJK title capped by max-width can't drop below N
  // lines): relax the width so it uses more of the slide, then shrink again.
  if (getComputedStyle(el).maxWidth !== 'none') {
    el.style.maxWidth = 'none'
    el.style.fontSize = ''
    shrink()
  }
}

/** Fit every heading found under `root` (a slide `<section>` or a preview box). */
export function fitHeadings(root: HTMLElement): void {
  for (const t of TARGETS) {
    root.querySelectorAll<HTMLElement>(t.sel).forEach((el) => fitOne(el, t.maxLines, t.minScale))
  }
}

/**
 * Fit an entire slide so nothing is clipped: shrink oversized headings, then—if
 * the content block still overflows the canvas—uniformly scale it down.
 * `root` is a slide `<section>` (player) or a preview container holding one.
 */
export function fitSlide(root: HTMLElement): void {
  fitHeadings(root)

  const s = root.querySelector<HTMLElement>('.s')
  if (!s) return

  // Reset any previous fit so we measure the natural layout.
  s.style.transform = ''
  s.style.transformOrigin = ''

  const availH = s.clientHeight
  const availW = s.clientWidth
  if (!availH || !availW) return

  // `.s` vertically centers its content, which makes scrollHeight underreport
  // overflow (content spilling above the top edge isn't counted). Flow from the
  // top while measuring so the full content extent is captured, then restore.
  const prevJustify = s.style.justifyContent
  s.style.justifyContent = 'flex-start'
  const contentH = s.scrollHeight
  const contentW = s.scrollWidth
  s.style.justifyContent = prevJustify

  const scale = Math.min(availH / contentH, availW / contentW, 1)
  if (scale < 0.995) {
    s.style.transformOrigin = 'center center'
    s.style.transform = `scale(${Math.max(scale, 0.4)})`
  }
}
