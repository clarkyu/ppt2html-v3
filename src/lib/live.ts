// Shared "live feedback" helper: extract page titles from a partial JSON
// stream and render them as a growing list, so generation shows real progress
// instead of just a spinner.
import { escapeHtml } from './markdown'
import { t } from '../i18n'

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

/**
 * While only reasoning bytes have arrived (thinking-mode models — the default
 * system-key config), swap the "connecting…" placeholder for a live
 * "thinking… (N chars)" line: the model is working, the connection isn't
 * stuck. No-op once titles are rendering.
 */
export function renderThinking(el: HTMLElement, chars: number): void {
  const wait = el.querySelector<HTMLElement>('.gen-live__wait')
  if (!wait) return
  wait.textContent = t('gen.thinking').replace('{n}', String(chars))
}
