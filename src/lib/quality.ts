// Mechanical per-slide quality checks — the in-product half of the refine
// pass. Finding defects is free and deterministic (no LLM): capacity
// overruns, missing concrete anchors, label-like bullets, missing notes.
// Only flagged pages then go to regenerateSlide with a targeted critique.
//
// Keep the limits in sync with llm/prompt.ts §8 (单页容量·务必防溢出) and
// scripts/eval/score.mjs — three views of the same contract.

import type { Deck, Slide, SlideLayout } from '../types'

const LIMITS = {
  title: 20,
  subtitle: 30,
  bullets: { count: 5, len: 28, min: 3 },
  twoCol: { count: 4, len: 18, min: 2 },
  comparison: { cards: 3, points: 4, len: 16 },
  timeline: { steps: 5, len: 24 },
  imageText: 110,
  code: { lines: 14, cols: 60 },
  bigNumberCaption: 20,
  statsLabel: 12,
}

const CONTENT_LAYOUTS: ReadonlySet<SlideLayout> = new Set([
  'bullets', 'two-col', 'big-number', 'stats', 'comparison', 'timeline', 'code', 'image-text',
] as SlideLayout[])

const strip = (s: unknown): string => String(s ?? '').replace(/\*\*/g, '').trim()
const len = (s: unknown): number => strip(s).length

/** A concrete anchor per DECK_SCHEMA_GUIDE §5: number / percent / year / money. */
const hasNumberAnchor = (text: string): boolean =>
  /\d|[０-９]|[一二两三四五六七八九十百千万亿]+(?:%|倍|万|亿|年|天|小时|分钟|步|个月)/.test(text)

function bulletTexts(s: Slide): string[] {
  return (s.bullets ?? []).map((b) => strip(b))
}

function slideText(s: Slide): string {
  const parts: Array<string | undefined> = [s.title, s.subtitle, s.value, s.caption, s.text, s.body, s.code]
  parts.push(...bulletTexts(s))
  for (const col of [s.left, s.right]) {
    if (col) parts.push(col.heading, col.body, ...(col.bullets ?? []))
  }
  for (const it of s.items ?? []) parts.push(it.heading, ...(it.points ?? []))
  for (const st of s.steps ?? []) parts.push(st.label, st.text)
  for (const st of s.stats ?? []) parts.push(st.value, st.label)
  return parts.filter(Boolean).map(String).join('\n')
}

export interface SlideIssues {
  index: number
  title: string
  /** Model-facing critiques (Chinese, actionable); shown to the user too. */
  issues: string[]
}

/** Check one slide; returns actionable critiques (empty = clean). */
export function slideIssues(s: Slide): string[] {
  const out: string[] = []
  if (s.title && len(s.title) > LIMITS.title) out.push(`标题 ${len(s.title)} 字，超过 ${LIMITS.title} 字上限，请压缩且不丢关键信息`)
  if (s.subtitle && len(s.subtitle) > LIMITS.subtitle) out.push(`副标题 ${len(s.subtitle)} 字，超过 ${LIMITS.subtitle} 字上限`)

  const bullets = bulletTexts(s)
  if (s.layout === 'bullets') {
    if (bullets.length > LIMITS.bullets.count) out.push(`要点 ${bullets.length} 条，超过 ${LIMITS.bullets.count} 条上限，请合并或精选`)
    if (bullets.length > 0 && bullets.length < LIMITS.bullets.min) out.push(`要点只有 ${bullets.length} 条，至少 ${LIMITS.bullets.min} 条，请补充有信息量的观点`)
    bullets.forEach((b, i) => {
      if (b.length > LIMITS.bullets.len) out.push(`第 ${i + 1} 条要点 ${b.length} 字，超过 ${LIMITS.bullets.len} 字上限`)
      else if (b.length > 0 && b.length < 10) out.push(`第 ${i + 1} 条要点「${b}」更像标签而非观点——改写成有主语、有论断的完整判断句`)
    })
  }
  if (s.layout === 'two-col') {
    for (const [name, col] of [['左栏', s.left], ['右栏', s.right]] as const) {
      const items = (col?.bullets ?? []).map(strip)
      if (items.length > LIMITS.twoCol.count) out.push(`${name} ${items.length} 条，超过 ${LIMITS.twoCol.count} 条上限`)
      if (items.length > 0 && items.length < LIMITS.twoCol.min) out.push(`${name}只有 ${items.length} 条，至少 ${LIMITS.twoCol.min} 条`)
      items.forEach((b, i) => {
        if (b.length > LIMITS.twoCol.len) out.push(`${name}第 ${i + 1} 条 ${b.length} 字，超过 ${LIMITS.twoCol.len} 字上限`)
      })
    }
  }
  if (s.layout === 'comparison') {
    const items = s.items ?? []
    if (items.length > LIMITS.comparison.cards) out.push(`对比卡 ${items.length} 张，超过 ${LIMITS.comparison.cards} 张上限`)
    items.forEach((it, c) => {
      const pts = (it.points ?? []).map(strip)
      if (pts.length > LIMITS.comparison.points) out.push(`第 ${c + 1} 张卡要点 ${pts.length} 条，超过 ${LIMITS.comparison.points} 条上限`)
      pts.forEach((p, i) => {
        if (p.length > LIMITS.comparison.len) out.push(`第 ${c + 1} 张卡第 ${i + 1} 条 ${p.length} 字，超过 ${LIMITS.comparison.len} 字上限`)
      })
    })
  }
  if (s.layout === 'timeline') {
    const steps = s.steps ?? []
    if (steps.length > LIMITS.timeline.steps) out.push(`步骤 ${steps.length} 步，超过 ${LIMITS.timeline.steps} 步上限`)
    steps.forEach((st, i) => {
      if (len(st.text) > LIMITS.timeline.len) out.push(`第 ${i + 1} 步说明 ${len(st.text)} 字，超过 ${LIMITS.timeline.len} 字上限`)
    })
  }
  if (s.layout === 'image-text' && len(s.body) > LIMITS.imageText) out.push(`正文 ${len(s.body)} 字，超过约 ${LIMITS.imageText} 字容量，请精炼或拆分`)
  if (s.layout === 'code' && s.code) {
    const lines = String(s.code).split('\n')
    if (lines.length > LIMITS.code.lines) out.push(`代码 ${lines.length} 行，超过 ${LIMITS.code.lines} 行上限`)
    const worst = Math.max(...lines.map((l) => l.length))
    if (worst > LIMITS.code.cols) out.push(`最长代码行 ${worst} 字符，超过 ${LIMITS.code.cols} 字符会折行`)
  }
  if (s.layout === 'big-number' && len(s.caption) > LIMITS.bigNumberCaption) out.push(`caption ${len(s.caption)} 字，超过 ${LIMITS.bigNumberCaption} 字上限`)
  if (s.layout === 'stats') {
    for (const st of s.stats ?? []) {
      if (len(st.label) > LIMITS.statsLabel) out.push(`指标说明「${strip(st.label).slice(0, 12)}…」超过 ${LIMITS.statsLabel} 字上限`)
    }
  }

  // Concreteness (§5) — quote pages are exempt (the attributed line IS the anchor).
  if (CONTENT_LAYOUTS.has(s.layout) && !hasNumberAnchor(slideText(s))) {
    out.push('本页没有任何具体锚点（数字/年份/百分比/可指名案例）——请补一个真实的；不确定的数据用生动类比替代，绝不编造')
  }
  // Speaker note (§6) on content pages.
  if (CONTENT_LAYOUTS.has(s.layout) && strip(s.note).length < 20) {
    out.push('讲者备注缺失或过短——补 2~3 句可直接念出来的口语句子，展开本页核心观点')
  }
  return out
}

/** Scan the whole deck; only pages with issues are returned. */
export function deckIssues(deck: Deck): SlideIssues[] {
  const out: SlideIssues[] = []
  deck.slides.forEach((s, i) => {
    const issues = slideIssues(s)
    if (issues.length) out.push({ index: i, title: strip(s.title || s.value || s.text || `第 ${i + 1} 页`), issues })
  })
  return out
}

/** The rewrite instruction for one flagged page. */
export function refineInstruction(issues: string[]): string {
  return (
    '按以下质量问题清单修复本页，其余内容保持原意与信息量，不要顺手改动没有问题的部分：\n' +
    issues.map((x) => `- ${x}`).join('\n')
  )
}
