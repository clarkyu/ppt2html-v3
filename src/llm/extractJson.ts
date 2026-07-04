// Models are asked for pure JSON, but sometimes wrap it in prose or code fences.
// This pulls the JSON object out and repairs the most common breakages.

export function extractJson(text: string): unknown {
  let t = text.trim()

  // Prefer a fenced ```json ... ``` block if present.
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) t = fenced[1].trim()

  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('模型没有返回有效的 JSON')
  }

  const candidate = t.slice(start, end + 1)

  try {
    return JSON.parse(candidate)
  } catch {
    // Repair: strip trailing commas before } or ].
    const repaired = candidate.replace(/,(\s*[}\]])/g, '$1')
    return JSON.parse(repaired)
  }
}
