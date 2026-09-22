// Shared "live feedback" helper: extract page titles from a partial JSON
// stream and render them as a growing list, so generation shows real progress
// instead of just a spinner.
import { t } from '../i18n'

/** Pull every "title": "…" value out of partial (possibly-unclosed) JSON text. */
export function liveTitles(text: string): string[] {
  // The structure step's JSON opens with the DECK title before "sections":
  // that one is not a row.
  const from = text.indexOf('"sections"')
  const scan = from >= 0 ? text.slice(from) : text
  const re = /"title"\s*:\s*"((?:[^"\\]|\\.)*)"/g
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(scan))) out.push(decodeJsonString(m[1]))
  return out
}

/** "中\n" → the characters they mean (a raw backslash-strip mangled them). */
function decodeJsonString(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string
  } catch {
    return raw.replace(/\\(.)/g, '$1')
  }
}

/**
 * Render titles into an `<ol data-live>` element as numbered rows — by DIFF:
 * rows already on screen keep their nodes (rebuilding every <li> per streamed
 * token restarted the entrance animation each time, so rows sat near zero
 * opacity), new titles are appended, and only a changed last row is updated.
 */
export function renderLive(el: HTMLElement, titles: string[]): void {
  if (!titles.length) return
  el.querySelector('.gen-live__wait')?.remove()
  // A fresh attempt (retry) can shrink the list: start over then.
  if (titles.length < el.childElementCount) el.innerHTML = ''
  titles.forEach((title, i) => {
    const row = el.children[i] as HTMLElement | undefined
    if (row) {
      const text = row.querySelector<HTMLElement>('.gen-live__text') ?? row
      if (text.textContent !== title) text.textContent = title
      return
    }
    const li = document.createElement('li')
    const n = document.createElement('span')
    n.className = 'gen-live__n'
    n.textContent = String(i + 1)
    const tx = document.createElement('span')
    tx.className = 'gen-live__text'
    tx.textContent = title
    li.append(n, tx)
    el.appendChild(li)
  })
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
