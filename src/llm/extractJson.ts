// Models are asked for pure JSON, but sometimes wrap it in prose or code fences.
// This pulls the JSON object out and repairs the most common breakages. Every
// failure is a localized, retryable LlmError — never the browser's raw
// SyntaxError text.

import { t } from '../i18n'
import { LlmError } from './errors'

export function extractJson(text: string): unknown {
  const s = text.trim()

  // 1. The common case: the reply IS the JSON. Parse it whole first, so a
  //    ``` inside a string (a code slide showing a Markdown fence) can never
  //    be mistaken for a wrapper — that used to fail such decks every time.
  const whole = tryParse(s)
  if (whole !== null && typeof whole === 'object') return whole

  // 2. A fence around the WHOLE reply (```json … ```), anchored at both ends;
  //    an unanchored match would again pick up fences inside strings.
  const fenced = s.match(/^```[a-z]*\s*([\s\S]*?)\s*```$/i)
  const body = fenced ? fenced[1] : s

  // 3. Prose around the object: keep the outermost {…}.
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end <= start) throw new LlmError(t('err.noJson'), 'parse')
  const candidate = body.slice(start, end + 1)

  const parsed = tryParse(candidate) ?? tryParse(candidate.replace(/,(\s*[}\]])/g, '$1')) // trailing commas
  if (parsed === undefined || parsed === null) throw new LlmError(t('err.noJson'), 'parse')
  return parsed
}

function tryParse(s: string): unknown {
  try {
    return JSON.parse(s) as unknown
  } catch {
    return undefined
  }
}
