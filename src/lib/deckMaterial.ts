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

/** Serialize a deck into numbered-outline material (capped at the prompt limit). */
export function deckToMaterial(deck: Deck): string {
  const parts: string[] = []
  let sec = 0
  for (const s of deck.slides) {
    if (s.layout === 'cover' || s.layout === 'end') continue
    const title = (s.title ?? '').replace(/\*\*/g, '').trim()
    if (s.layout === 'section') {
      sec++
      parts.push(`${CN_NUM[sec - 1] ?? sec}、${title}`)
      continue
    }
    const lines = slideLines(s)
    parts.push([title ? `${title}` : '', ...lines].filter(Boolean).join('\n'))
  }
  return parts.join('\n\n').slice(0, MATERIAL_MAX_CHARS)
}
