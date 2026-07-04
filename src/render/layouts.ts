import type { Slide, Column, CompareItem, TimelineStep } from '../types'
import { mdInline, mdProse, escapeHtml } from '../lib/markdown'

// Each renderer returns the inner HTML for a slide's <section>.
// Styling lives in slides.css; themes.css supplies the palette via CSS variables.

function eyebrow(text?: string): string {
  return text ? `<div class="s-eyebrow">${mdInline(text)}</div>` : ''
}

function title(text?: string, cls = 's-title'): string {
  return text ? `<h2 class="${cls}">${mdInline(text)}</h2>` : ''
}

function bulletList(items: string[] | undefined, fragment = true): string {
  if (!items?.length) return ''
  const li = items
    .map(
      (b) =>
        `<li class="s-list__item${fragment ? ' fragment fade-up' : ''}">` +
        `<span class="s-list__mark" aria-hidden="true"></span>` +
        `<span class="s-list__text">${mdInline(b)}</span></li>`,
    )
    .join('')
  return `<ul class="s-list">${li}</ul>`
}

function column(col: Column | undefined): string {
  if (!col) return '<div class="s-col"></div>'
  const heading = col.heading ? `<h3 class="s-col__heading">${mdInline(col.heading)}</h3>` : ''
  const body = col.body ? `<div class="s-prose">${mdProse(col.body)}</div>` : ''
  const bullets = bulletList(col.bullets, false)
  return `<div class="s-col">${heading}${bullets}${body}</div>`
}

function cover(s: Slide): string {
  return `<div class="s s-cover">
    <div class="s-cover__glow" aria-hidden="true"></div>
    ${eyebrow(s.eyebrow)}
    <h1 class="s-cover__title">${mdInline(s.title)}</h1>
    ${s.subtitle ? `<p class="s-cover__subtitle">${mdInline(s.subtitle)}</p>` : ''}
    <div class="s-cover__rule" aria-hidden="true"></div>
  </div>`
}

function section(s: Slide): string {
  return `<div class="s s-section">
    ${eyebrow(s.eyebrow ?? '章节')}
    <h2 class="s-section__title">${mdInline(s.title)}</h2>
    ${s.subtitle ? `<p class="s-section__subtitle">${mdInline(s.subtitle)}</p>` : ''}
  </div>`
}

function bullets(s: Slide): string {
  return `<div class="s s-bullets">
    ${eyebrow(s.eyebrow)}
    ${title(s.title)}
    ${bulletList(s.bullets)}
  </div>`
}

function twoCol(s: Slide): string {
  return `<div class="s s-two">
    ${eyebrow(s.eyebrow)}
    ${title(s.title)}
    <div class="s-two__cols">
      ${column(s.left)}
      <div class="s-two__divider" aria-hidden="true"></div>
      ${column(s.right)}
    </div>
  </div>`
}

function bigNumber(s: Slide): string {
  return `<div class="s s-big">
    ${eyebrow(s.eyebrow)}
    <div class="s-big__value">${mdInline(s.value ?? s.title)}</div>
    ${s.caption ? `<div class="s-big__caption">${mdInline(s.caption)}</div>` : ''}
  </div>`
}

function quote(s: Slide): string {
  return `<div class="s s-quote">
    <div class="s-quote__mark" aria-hidden="true">&ldquo;</div>
    <blockquote class="s-quote__text">${mdInline(s.text ?? s.title)}</blockquote>
    ${s.author ? `<div class="s-quote__author">${mdInline(s.author)}</div>` : ''}
  </div>`
}

function compareCard(item: CompareItem): string {
  const points = (item.points ?? [])
    .map((p) => `<li>${mdInline(p)}</li>`)
    .join('')
  return `<div class="s-cmp fragment fade-up s-cmp--${item.tone ?? 'neutral'}">
    <h3 class="s-cmp__heading">${mdInline(item.heading)}</h3>
    ${points ? `<ul class="s-cmp__points">${points}</ul>` : ''}
  </div>`
}

function comparison(s: Slide): string {
  const cards = (s.items ?? []).map(compareCard).join('')
  return `<div class="s s-compare">
    ${eyebrow(s.eyebrow)}
    ${title(s.title)}
    <div class="s-compare__grid" style="--cmp-count:${Math.max(1, s.items?.length ?? 1)}">${cards}</div>
  </div>`
}

function timelineStep(step: TimelineStep, i: number): string {
  return `<li class="s-tl__item fragment fade-up">
    <span class="s-tl__node" aria-hidden="true">${i + 1}</span>
    <div class="s-tl__body">
      <div class="s-tl__label">${mdInline(step.label)}</div>
      ${step.text ? `<div class="s-tl__text">${mdInline(step.text)}</div>` : ''}
    </div>
  </li>`
}

function timeline(s: Slide): string {
  const steps = (s.steps ?? []).map(timelineStep).join('')
  return `<div class="s s-timeline">
    ${eyebrow(s.eyebrow)}
    ${title(s.title)}
    <ol class="s-tl">${steps}</ol>
  </div>`
}

function code(s: Slide): string {
  const lang = s.language ? `<span class="s-code__lang">${escapeHtml(s.language)}</span>` : ''
  return `<div class="s s-code">
    ${title(s.title)}
    <div class="s-code__frame">
      <div class="s-code__bar" aria-hidden="true"><i></i><i></i><i></i>${lang}</div>
      <pre class="s-code__block"><code>${escapeHtml(s.code)}</code></pre>
    </div>
  </div>`
}

function imageText(s: Slide): string {
  return `<div class="s s-imgtext">
    <div class="s-imgtext__visual" aria-hidden="true">
      <span class="blob blob-a"></span><span class="blob blob-b"></span><span class="blob blob-c"></span>
    </div>
    <div class="s-imgtext__body">
      ${eyebrow(s.eyebrow)}
      ${title(s.title)}
      ${s.body ? `<div class="s-prose">${mdProse(s.body)}</div>` : bulletList(s.bullets)}
    </div>
  </div>`
}

function end(s: Slide): string {
  return `<div class="s s-end">
    <div class="s-end__mark" aria-hidden="true"></div>
    <h2 class="s-end__title">${mdInline(s.title ?? '谢谢观看')}</h2>
    ${s.subtitle ? `<p class="s-end__subtitle">${mdInline(s.subtitle)}</p>` : ''}
  </div>`
}

const RENDERERS: Record<Slide['layout'], (s: Slide) => string> = {
  cover,
  section,
  bullets,
  'two-col': twoCol,
  'big-number': bigNumber,
  quote,
  comparison,
  timeline,
  code,
  'image-text': imageText,
  end,
}

/** Render one slide's inner HTML based on its layout. */
export function renderSlideInner(slide: Slide): string {
  const renderer = RENDERERS[slide.layout] ?? bullets
  return renderer(slide)
}
