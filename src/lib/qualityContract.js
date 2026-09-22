// The ONE source of the mechanical quality contract: capacity limits, which
// layouts count as content, the script-aware text measure, anchor heuristics
// and the per-slide checker. Two consumers run this same code:
//   - the in-product refine pass (lib/quality.ts → ui/refinePanel.ts), and
//   - the eval scorer (scripts/eval/score.mjs) under plain Node.
// Plain ESM JavaScript on purpose so Node needs no TS toolchain; the types
// live in qualityContract.d.ts. llm/prompt.ts §8 states the same numbers in
// prose for the model — change the three together.
//
// Text measure: limits are written in CJK characters (1em wide). Latin text is
// narrower and wordier — a proportional Latin glyph is ~½em, a space ~¼em —
// so an English bullet of ~10–11 words lands near the 28-unit line just like
// a 28-character Chinese one. Before this, English decks were measured in raw
// characters and the refine pass rewrote nearly every English page to fragments.

export const LIMITS = {
  title: 20,
  subtitle: 30,
  bullets: { count: 5, len: 28, min: 3 },
  twoCol: { count: 4, len: 18, min: 2 },
  comparison: { cards: 3, points: 4, len: 16 },
  timeline: { steps: 5, len: 24 },
  imageText: 110, // §8 asks for ~100 so the model keeps slack; 110 is the violation line
  code: { lines: 14, cols: 60 },
  bigNumberCaption: 20,
  statsLabel: 12,
}

/** Layouts that carry the talk's substance: note-checked, counted for
 * diversity / anchor rate. Quote pages ARE content (a speaker still needs a
 * script for them) but are exempt from the anchor rule — the attributed line
 * is the anchor. */
export const CONTENT_LAYOUTS = new Set([
  'bullets', 'two-col', 'big-number', 'stats', 'quote', 'comparison', 'timeline', 'code', 'image-text',
])
export const ANCHOR_EXEMPT = new Set(['quote'])

const CJK = /[぀-ヿ㐀-鿿豈-﫿가-힯]/
export const hasCjk = (s) => CJK.test(String(s ?? ''))
export const strip = (s) => String(s ?? '').replace(/\*\*/g, '').trim()

/** Length in CJK-character units (CJK ×1, other glyphs ×½, spaces ×¼). */
export function textLen(s) {
  let n = 0
  for (const ch of strip(s)) n += CJK.test(ch) ? 1 : /\s/.test(ch) ? 0.25 : 0.5
  return Math.round(n)
}

export function wordCount(s) {
  const t = strip(s)
  return t ? t.split(/\s+/).length : 0
}

/** "标签" vs "观点": a fragment too short to carry a judgement. */
export function labelLike(b) {
  const t = strip(b)
  if (!t) return false
  return hasCjk(t) ? t.length < 10 : wordCount(t) < 5
}

/** Proxy for an opinion sentence (eval metric). */
export function sentenceLike(b) {
  const t = strip(b)
  return hasCjk(t) ? t.length >= 12 : wordCount(t) >= 6
}

/** A number-ish anchor per §5: digit / percent / multiple / year / money. */
export function hasNumberAnchor(text) {
  return /\d|[０-９]|[一二两三四五六七八九十百千万亿]+(?:%|倍|万|亿|年|天|小时|分钟|步|个月)/.test(text)
}

/** A cheap "nameable case" heuristic: a quoted name / phrase, or a capitalised
 * Latin token that is not sentence-initial (in CJK text any capitalised Latin
 * token — Netflix, iPhone — reads as a name). */
export function hasCaseAnchor(text) {
  if (/[「『“][^」』”]{2,24}[」』”]/.test(text)) return true
  // Same-line only: a capitalised word at the start of the next bullet / line
  // is a sentence start, not a name.
  return hasCjk(text) ? /[A-Z][a-zA-Z]{2,}/.test(text) : /[a-z,;:][ \t]+[A-Z][a-zA-Z]{2,}/.test(text)
}

export const hasAnchor = (text) => hasNumberAnchor(text) || hasCaseAnchor(text)

export function bulletTexts(s) {
  return (s.bullets ?? []).map((b) => strip(typeof b === 'string' ? b : b?.text))
}

/** All visible text of a slide, `**` markers included (for bold-balance checks). */
export function slideTextRaw(s) {
  const parts = [s.title, s.subtitle, s.eyebrow, s.value, s.caption, s.text, s.author, s.body, s.code]
  for (const b of s.bullets ?? []) parts.push(typeof b === 'string' ? b : b?.text)
  for (const col of [s.left, s.right]) {
    if (col) parts.push(col.heading, col.body, ...(col.bullets ?? []))
  }
  for (const it of s.items ?? []) parts.push(it.heading, ...(it.points ?? []))
  for (const st of s.steps ?? []) parts.push(st.label, st.text)
  for (const st of s.stats ?? []) parts.push(st.value, st.label)
  return parts.filter(Boolean).map(String).join('\n')
}

/** Visible text with emphasis markers stripped (for anchor / content checks). */
export function slideText(s) {
  return strip(slideTextRaw(s).replace(/\*\*/g, ''))
}

/** Codes that are capacity (overflow-defence) findings, as opposed to content ones. */
export const CAPACITY_CODES = new Set([
  'title.tooLong', 'subtitle.tooLong', 'bullets.tooMany', 'bullets.tooFew', 'bullet.tooLong',
  'col.tooMany', 'col.tooFew', 'col.itemTooLong', 'cmp.tooManyCards', 'cmp.tooManyPoints', 'cmp.pointTooLong',
  'tl.tooManySteps', 'tl.stepTooLong', 'body.tooLong', 'code.tooManyLines', 'code.lineTooWide',
  'caption.tooLong', 'stats.labelTooLong',
])

/** Check one slide → structured findings (code + params); [] = clean. */
export function slideIssues(s) {
  const out = []
  const push = (code, params = {}) => out.push({ code, params })
  const L = LIMITS
  if (s.title && textLen(s.title) > L.title) push('title.tooLong', { n: textLen(s.title), max: L.title })
  if (s.subtitle && textLen(s.subtitle) > L.subtitle) push('subtitle.tooLong', { n: textLen(s.subtitle), max: L.subtitle })

  const bullets = bulletTexts(s)
  if (s.layout === 'bullets') {
    if (bullets.length > L.bullets.count) push('bullets.tooMany', { n: bullets.length, max: L.bullets.count })
    if (bullets.length > 0 && bullets.length < L.bullets.min) push('bullets.tooFew', { n: bullets.length, min: L.bullets.min })
    bullets.forEach((b, i) => {
      if (textLen(b) > L.bullets.len) push('bullet.tooLong', { i: i + 1, n: textLen(b), max: L.bullets.len })
      else if (labelLike(b)) push('bullet.labelLike', { i: i + 1, text: b })
    })
  }
  if (s.layout === 'two-col') {
    for (const [col, c] of [['left', s.left], ['right', s.right]]) {
      const items = (c?.bullets ?? []).map(strip)
      if (items.length > L.twoCol.count) push('col.tooMany', { col, n: items.length, max: L.twoCol.count })
      if (items.length > 0 && items.length < L.twoCol.min) push('col.tooFew', { col, n: items.length, min: L.twoCol.min })
      items.forEach((b, i) => {
        if (textLen(b) > L.twoCol.len) push('col.itemTooLong', { col, i: i + 1, n: textLen(b), max: L.twoCol.len })
      })
    }
  }
  if (s.layout === 'comparison') {
    const items = s.items ?? []
    if (items.length > L.comparison.cards) push('cmp.tooManyCards', { n: items.length, max: L.comparison.cards })
    items.forEach((it, c) => {
      const pts = (it.points ?? []).map(strip)
      if (pts.length > L.comparison.points) push('cmp.tooManyPoints', { c: c + 1, n: pts.length, max: L.comparison.points })
      pts.forEach((p, i) => {
        if (textLen(p) > L.comparison.len) push('cmp.pointTooLong', { c: c + 1, i: i + 1, n: textLen(p), max: L.comparison.len })
      })
    })
  }
  if (s.layout === 'timeline') {
    const steps = s.steps ?? []
    if (steps.length > L.timeline.steps) push('tl.tooManySteps', { n: steps.length, max: L.timeline.steps })
    steps.forEach((st, i) => {
      if (textLen(st.text) > L.timeline.len) push('tl.stepTooLong', { i: i + 1, n: textLen(st.text), max: L.timeline.len })
    })
  }
  if (s.layout === 'image-text' && textLen(s.body) > L.imageText) push('body.tooLong', { n: textLen(s.body), max: L.imageText })
  if (s.layout === 'code' && s.code) {
    const lines = String(s.code).split('\n')
    if (lines.length > L.code.lines) push('code.tooManyLines', { n: lines.length, max: L.code.lines })
    const worst = Math.max(...lines.map((l) => l.length))
    if (worst > L.code.cols) push('code.lineTooWide', { n: worst, max: L.code.cols })
  }
  if (s.layout === 'big-number' && textLen(s.caption) > L.bigNumberCaption) push('caption.tooLong', { n: textLen(s.caption), max: L.bigNumberCaption })
  if (s.layout === 'stats') {
    for (const st of s.stats ?? []) {
      if (textLen(st.label) > L.statsLabel) push('stats.labelTooLong', { text: strip(st.label).slice(0, 12), max: L.statsLabel })
    }
  }

  // Concreteness (§5): number-ish anchors are detected reliably, nameable
  // cases only heuristically — the critique says exactly that (it used to
  // claim cases had been checked and rewrote §5-compliant pages).
  if (CONTENT_LAYOUTS.has(s.layout) && !ANCHOR_EXEMPT.has(s.layout) && !hasAnchor(slideText(s))) push('anchor.missing')
  // Speaker note (§6) on every content page, quote included.
  if (CONTENT_LAYOUTS.has(s.layout) && strip(s.note).length < 20) push('note.missing')
  return out
}

/** The language a deck reads in: its title when it has one, else the majority
 * of content-page titles. (A single CJK title in an English deck used to flip
 * the reference and mark every other page as mismatched.) */
export function deckLanguage(deck) {
  const title = strip(deck?.title)
  if (title) return hasCjk(title) ? 'zh' : 'en'
  const titles = (deck?.slides ?? []).filter((s) => CONTENT_LAYOUTS.has(s.layout)).map((s) => strip(s.title)).filter(Boolean)
  if (!titles.length) return 'zh'
  return titles.filter(hasCjk).length * 2 >= titles.length ? 'zh' : 'en'
}

const COL = { zh: { left: '左栏', right: '右栏' }, en: { left: 'Left column', right: 'Right column' } }
const UNIT_NOTE_EN = ' (CJK-character units: a Latin letter counts ½)'
const TEXT = {
  zh: {
    'title.tooLong': '标题 {n} 字，超过 {max} 字上限，请压缩且不丢关键信息',
    'subtitle.tooLong': '副标题 {n} 字，超过 {max} 字上限',
    'bullets.tooMany': '要点 {n} 条，超过 {max} 条上限，请合并或精选',
    'bullets.tooFew': '要点只有 {n} 条，至少 {min} 条，请补充有信息量的观点',
    'bullet.tooLong': '第 {i} 条要点 {n} 字，超过 {max} 字上限',
    'bullet.labelLike': '第 {i} 条要点「{text}」更像标签而非观点——改写成有主语、有论断的完整判断句',
    'col.tooMany': '{col} {n} 条，超过 {max} 条上限',
    'col.tooFew': '{col}只有 {n} 条，至少 {min} 条',
    'col.itemTooLong': '{col}第 {i} 条 {n} 字，超过 {max} 字上限',
    'cmp.tooManyCards': '对比卡 {n} 张，超过 {max} 张上限',
    'cmp.tooManyPoints': '第 {c} 张卡要点 {n} 条，超过 {max} 条上限',
    'cmp.pointTooLong': '第 {c} 张卡第 {i} 条 {n} 字，超过 {max} 字上限',
    'tl.tooManySteps': '步骤 {n} 步，超过 {max} 步上限',
    'tl.stepTooLong': '第 {i} 步说明 {n} 字，超过 {max} 字上限',
    'body.tooLong': '正文 {n} 字，超过约 {max} 字容量，请精炼或拆分',
    'code.tooManyLines': '代码 {n} 行，超过 {max} 行上限',
    'code.lineTooWide': '最长代码行 {n} 字符，超过 {max} 字符会折行',
    'caption.tooLong': 'caption {n} 字，超过 {max} 字上限',
    'stats.labelTooLong': '指标说明「{text}…」超过 {max} 字上限',
    'anchor.missing': '本页没有数字 / 年份 / 百分比类锚点，也没识别到可指名的案例——若已有具体案例或类比可保留，否则补一个真实锚点，绝不编造',
    'note.missing': '讲者备注缺失或过短——补 2~3 句可直接念出来的口语句子，展开本页核心观点',
  },
  en: {
    'title.tooLong': 'Title measures {n}, over the {max} limit' + UNIT_NOTE_EN + ' — tighten it without losing the key point',
    'subtitle.tooLong': 'Subtitle measures {n}, over the {max} limit' + UNIT_NOTE_EN,
    'bullets.tooMany': '{n} bullets, over the limit of {max} — merge or pick the strongest',
    'bullets.tooFew': 'Only {n} bullet(s); at least {min} — add points that carry information',
    'bullet.tooLong': 'Bullet {i} measures {n}, over the {max} limit' + UNIT_NOTE_EN,
    'bullet.labelLike': 'Bullet {i} “{text}” reads as a label, not a point — rewrite it as a full sentence with a subject and a claim',
    'col.tooMany': '{col}: {n} items, over the limit of {max}',
    'col.tooFew': '{col}: only {n} item(s); at least {min}',
    'col.itemTooLong': '{col} item {i} measures {n}, over the {max} limit' + UNIT_NOTE_EN,
    'cmp.tooManyCards': '{n} comparison cards, over the limit of {max}',
    'cmp.tooManyPoints': 'Card {c} has {n} points, over the limit of {max}',
    'cmp.pointTooLong': 'Card {c} point {i} measures {n}, over the {max} limit' + UNIT_NOTE_EN,
    'tl.tooManySteps': '{n} steps, over the limit of {max}',
    'tl.stepTooLong': 'Step {i} text measures {n}, over the {max} limit' + UNIT_NOTE_EN,
    'body.tooLong': 'Body measures {n}, over the ~{max} capacity' + UNIT_NOTE_EN + ' — condense or split the page',
    'code.tooManyLines': '{n} lines of code, over the limit of {max}',
    'code.lineTooWide': 'Longest code line is {n} characters; past {max} it wraps',
    'caption.tooLong': 'Caption measures {n}, over the {max} limit' + UNIT_NOTE_EN,
    'stats.labelTooLong': 'Stat label “{text}…” is over the {max} limit' + UNIT_NOTE_EN,
    'anchor.missing': 'No number / year / percentage anchor on this page, and no nameable case was detected — keep a concrete case or analogy if there is one, otherwise add one real anchor; never invent figures',
    'note.missing': 'Speaker note missing or too short — add 2–3 spoken-style sentences that expand the page’s core point',
  },
}

/** Render a finding for people (UI language) or for the model (deck language). */
export function formatIssue(issue, lang) {
  const l = lang === 'en' ? 'en' : 'zh'
  const tpl = TEXT[l][issue.code] ?? issue.code
  return tpl.replace(/\{(\w+)\}/g, (_, k) => {
    const v = issue.params?.[k]
    if (k === 'col') return COL[l][v] ?? String(v ?? '')
    return v === undefined ? '' : String(v)
  })
}
