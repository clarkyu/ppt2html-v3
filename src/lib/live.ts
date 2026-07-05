// Shared "live feedback" helper: extract page titles from a partial JSON
// stream and render them as a growing list, so generation shows real progress
// instead of just a spinner.
import { escapeHtml } from './markdown'

/** Pull every "title": "…" value out of partial (possibly-unclosed) JSON text. */
export function liveTitles(text: string): string[] {
  const re = /"title"\s*:\s*"((?:[^"\\]|\\.)*)"/g
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) out.push(m[1].replace(/\\(.)/g, '$1'))
  return out
}

/** Render titles into an `<ol data-live>` element as numbered rows. */
export function renderLive(el: HTMLElement, titles: string[]): void {
  if (!titles.length) return
  el.innerHTML = titles
    .map((t, i) => `<li><span class="gen-live__n">${i + 1}</span>${escapeHtml(t)}</li>`)
    .join('')
}
