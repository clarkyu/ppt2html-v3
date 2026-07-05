// Models are asked for pure JSON, but sometimes wrap it in prose or code fences.
// This pulls the JSON object out and repairs the most common breakages.

import { t } from '../i18n'

export function extractJson(text: string): unknown {
  let s = text.trim()

  // Prefer a fenced ```json ... ``` block if present.
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) s = fenced[1].trim()

  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(t('err.noJson'))
  }

  const candidate = s.slice(start, end + 1)

  try {
    return JSON.parse(candidate)
  } catch {
    // Repair: strip trailing commas before } or ].
    const repaired = candidate.replace(/,(\s*[}\]])/g, '$1')
    return JSON.parse(repaired)
  }
}
