// Deck → outline-shaped material text. The bridge that makes "AI 重构这份课件"
// a zero-new-pipeline feature: an imported (or any) deck serialized this way
// rides the material channel, where the fidelity rule keeps its facts and the
// outline-following rule keeps its structure — while generation is free to
// pick better layouts and rewrite label-bullets into real statements.

import type { Deck, Slide } from '../types'
import { MATERIAL_MAX_CHARS } from '../llm/prompt'

const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

function slideLines(s: Slide): string[] {
  const out: string[] = []
  const bullets = (s.bullets ?? []).map((b) => (typeof b === 'string' ? b : '')).filter(Boolean)
  for (const b of bullets) out.push(`- ${b}`)
  for (const [name, col] of [['左', s.left], ['右', s.right]] as const) {
    if (!col) continue
    if (col.heading) out.push(`- ${name}：${col.heading}`)
    for (const b of col.bullets ?? []) out.push(`  - ${b}`)
    if (col.body) out.push(`  - ${col.body}`)
  }
  for (const it of s.items ?? []) {
    out.push(`- ${it.heading}${it.tone ? `（${it.tone === 'positive' ? '优' : it.tone === 'negative' ? '劣' : ''}）` : ''}`)
    for (const p of it.points ?? []) out.push(`  - ${p}`)
  }
  for (const st of s.steps ?? []) out.push(`- ${st.label}${st.text ? `：${st.text}` : ''}`)
  for (const st of s.stats ?? []) out.push(`- ${st.value} ${st.label}`)
  if (s.value) out.push(`- 关键数字：${s.value}${s.caption ? `（${s.caption}）` : ''}`)
  if (s.text) out.push(`- 引言：${s.text}${s.author ? ` ——${s.author}` : ''}`)
  if (s.body) out.push(s.body)
  if (s.code) out.push('```\n' + s.code + '\n```')
  if (s.note?.trim()) out.push(`（备注：${s.note.trim()}）`)
  return out
}

export interface DeckMaterial {
  text: string
  /** Some detail (notes, then bullets) had to be left out to fit the budget. */
  truncated: boolean
}

/** Notes are the first thing to give when the budget is tight. */
const NOTE_FULL = 120
const NOTE_SHORT = 60

/**
 * Serialize a deck into numbered-outline material within the prompt budget.
 * Budgeted by priority so a large deck keeps its SHAPE end to end: every
 * section header and page title first, then the bullets / fields of every
 * page, then notes (trimmed, then dropped) — instead of a hard cut at 8000
 * chars that silently lost the last third of a long imported deck.
 */
export function deckToMaterial(deck: Deck, budget = MATERIAL_MAX_CHARS): DeckMaterial {
  type Block = { head: string; body: string[]; note?: string }
  const blocks: Block[] = []
  let sec = 0
  for (const s of deck.slides) {
    if (s.layout === 'cover' || s.layout === 'end') continue
    const title = (s.title ?? '').replace(/\*\*/g, '').trim()
    if (s.layout === 'section') {
      sec++
      blocks.push({ head: `${CN_NUM[sec - 1] ?? sec}、${title}`, body: [] })
      continue
    }
    const note = s.note?.trim()
    blocks.push({ head: title, body: slideLines({ ...s, note: undefined }), note: note || undefined })
  }
  const render = (noteChars: number, withBody: boolean): string =>
    blocks
      .map((b) => {
        const lines = [b.head, ...(withBody ? b.body : [])]
        if (b.note && noteChars > 0) lines.push(`（备注：${b.note.length > noteChars ? `${b.note.slice(0, noteChars)}…` : b.note}）`)
        return lines.filter(Boolean).join('\n')
      })
      .filter(Boolean)
      .join('\n\n')
  // Tiers, most detailed first; the first that fits wins.
  const tiers: Array<[number, boolean]> = [[NOTE_FULL, true], [NOTE_SHORT, true], [0, true], [0, false]]
  for (let i = 0; i < tiers.length; i++) {
    const [noteChars, withBody] = tiers[i]
    const text = render(noteChars, withBody)
    if (text.length <= budget) return { text, truncated: i > 0 }
  }
  // Even bare headers overflow (hundreds of pages): cut at a block boundary.
  const heads = render(0, false)
  const cut = heads.lastIndexOf('\n\n', budget)
  return { text: heads.slice(0, cut > budget / 2 ? cut : budget), truncated: true }
}
