// Long-material slicing for segmented generation: when the pasted material
// exceeds what a single part/segment prompt should carry, pick only the blocks
// relevant to THAT part's outline — plain lexical overlap (CJK bigrams +
// latin words), no embeddings, deterministic, zero network. Structure
// planning still sees the full material (it must detect an embedded outline);
// only the per-part and per-segment prompts get sliced.

import { CJK_CLASS, hasCjk } from './lang'

/** `s.slice(0, n)` that never splits a surrogate pair (an emoji or a rare CJK
 * character on the cut would become a lone surrogate — invalid JSON for the
 * request body). Every MATERIAL_MAX_CHARS cut goes through here. */
export function clampChars(s: string, n: number): string {
  if (s.length <= n) return s
  const code = s.charCodeAt(n - 1)
  return s.slice(0, code >= 0xd800 && code <= 0xdbff ? n - 1 : n)
}

/** Materials longer than this get sliced per part/segment. */
export const SLICE_THRESHOLD = 3000
/** Character budget for one sliced prompt payload. */
export const SLICE_BUDGET = 3000

const MAX_BLOCK = 800

/** Split into paragraph-ish blocks; oversized ones are hard-split. */
function blocks(material: string): string[] {
  const rough = material
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
  const out: string[] = []
  for (const b of rough) {
    if (b.length <= MAX_BLOCK) {
      out.push(b)
      continue
    }
    // Hard-split long runs at line boundaries where possible.
    let rest = b
    while (rest.length > MAX_BLOCK) {
      const cut = rest.lastIndexOf('\n', MAX_BLOCK)
      const at = cut > MAX_BLOCK / 2 ? cut : MAX_BLOCK
      out.push(rest.slice(0, at).trim())
      rest = rest.slice(at).trim()
    }
    if (rest) out.push(rest)
  }
  return out
}

/** Query text → lexical grams: CJK bigrams + lowercased words of ANY script
 * (Cyrillic, Arabic, Devanagari… used to yield no grams at all, so such
 * material always degraded to its leading 3000 chars). */
function grams(text: string): Set<string> {
  const out = new Set<string>()
  const cjk = text.match(new RegExp(CJK_CLASS + '+', 'g')) ?? []
  for (const run of cjk) {
    for (let i = 0; i < run.length - 1; i++) out.add(run.slice(i, i + 2))
  }
  for (const w of text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]+/gu) ?? []) {
    if (!hasCjk(w)) out.add(w)
  }
  return out
}

/**
 * Pick the blocks of `material` most relevant to `query` (a part's outline
 * text), within `budget` chars, preserving original order. Falls back to the
 * leading slice when nothing matches (better some material than none).
 */
export function sliceMaterial(material: string, query: string, budget: number = SLICE_BUDGET): string {
  const mat = material.trim()
  if (mat.length <= budget) return mat
  const q = grams(query)
  const scored = blocks(mat).map((text, order) => {
    let score = 0
    const g = grams(text)
    for (const x of q) if (g.has(x)) score++
    return { text, order, score }
  })
  const picked: typeof scored = []
  let used = 0
  for (const b of [...scored].sort((a, z) => z.score - a.score || a.order - z.order)) {
    if (b.score <= 0) break
    if (used + b.text.length > budget) continue
    picked.push(b)
    used += b.text.length
  }
  if (!picked.length) return clampChars(mat, budget)
  return picked
    .sort((a, z) => a.order - z.order)
    .map((b) => b.text)
    .join('\n\n')
}
