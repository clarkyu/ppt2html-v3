// Mechanical deck scorers — the measurable half of DECK_SCHEMA_GUIDE.
// Pure functions over a normalized Deck: no DOM, no network, importable from
// the runner and from tests. Every metric is a proxy and labeled as such;
// what matters is the DELTA between runs on the same golden set, not the
// absolute number.
//
// Capacity limits mirror prompt.ts §8 (单页容量·务必防溢出) — keep in sync.

const LIMITS = {
  title: 20,
  subtitle: 30,
  bullets: { count: 5, len: 28, min: 3 },
  twoCol: { count: 4, len: 18, min: 2 },
  comparison: { cards: 3, points: 4, len: 16 },
  timeline: { steps: 5, len: 24 },
  imageText: 110, // prompt says ~90; allow slack before calling it a violation
  code: { lines: 14, cols: 60 },
  bigNumberCaption: 20,
  statsLabel: 12,
}

const CONTENT_LAYOUTS = new Set([
  'bullets', 'two-col', 'big-number', 'stats', 'quote', 'comparison', 'timeline', 'code', 'image-text',
])

const strip = (s) => String(s ?? '').replace(/\*\*/g, '').trim()
const len = (s) => strip(s).length
const hasCjk = (s) => /[぀-ヿ㐀-鿿豈-﫿가-힯]/.test(String(s ?? ''))

/** A "concrete anchor" per rule §5: a number/percent/multiple/year/money. */
function hasNumberAnchor(text) {
  return /\d|[０-９]|[一二两三四五六七八九十百千万亿]+(?:%|倍|万|亿|年|天|小时|分钟|步|个月)/.test(text)
}

function slideText(s) {
  const parts = [s.title, s.subtitle, s.eyebrow, s.value, s.caption, s.text, s.author, s.body, s.code]
  for (const b of s.bullets ?? []) parts.push(typeof b === 'string' ? b : b?.text)
  for (const col of [s.left, s.right]) {
    if (!col) continue
    parts.push(col.heading, col.body, ...(col.bullets ?? []))
  }
  for (const it of s.items ?? []) parts.push(it.heading, ...(it.points ?? []))
  for (const st of s.steps ?? []) parts.push(st.label, st.text)
  for (const st of s.stats ?? []) parts.push(st.value, st.label)
  return parts.filter(Boolean).map(String).join('\n')
}

/** Per-slide capacity violations against LIMITS; returns human-readable list. */
function capacityViolations(s, i) {
  const v = []
  const page = `p${i + 1}(${s.layout})`
  const over = (what, actual, max) => v.push(`${page} ${what} ${actual}>${max}`)
  if (s.title && len(s.title) > LIMITS.title) over('标题', len(s.title), LIMITS.title)
  if (s.subtitle && len(s.subtitle) > LIMITS.subtitle) over('副标题', len(s.subtitle), LIMITS.subtitle)
  const bullets = (s.bullets ?? []).map((b) => (typeof b === 'string' ? b : (b?.text ?? '')))
  if (s.layout === 'bullets') {
    if (bullets.length > LIMITS.bullets.count) over('bullets 条数', bullets.length, LIMITS.bullets.count)
    if (bullets.length && bullets.length < LIMITS.bullets.min) v.push(`${page} bullets 条数 ${bullets.length}<${LIMITS.bullets.min}`)
    for (const b of bullets) if (len(b) > LIMITS.bullets.len) over('bullet 长度', len(b), LIMITS.bullets.len)
  }
  if (s.layout === 'two-col') {
    for (const [name, col] of [['左栏', s.left], ['右栏', s.right]]) {
      const items = col?.bullets ?? []
      if (items.length > LIMITS.twoCol.count) over(`${name}条数`, items.length, LIMITS.twoCol.count)
      if (items.length && items.length < LIMITS.twoCol.min) v.push(`${page} ${name}条数 ${items.length}<${LIMITS.twoCol.min}`)
      for (const b of items) if (len(b) > LIMITS.twoCol.len) over(`${name}条目长度`, len(b), LIMITS.twoCol.len)
    }
  }
  if (s.layout === 'comparison') {
    const items = s.items ?? []
    if (items.length > LIMITS.comparison.cards) over('对比卡数', items.length, LIMITS.comparison.cards)
    for (const it of items) {
      const pts = it.points ?? []
      if (pts.length > LIMITS.comparison.points) over('卡内要点数', pts.length, LIMITS.comparison.points)
      for (const p of pts) if (len(p) > LIMITS.comparison.len) over('对比要点长度', len(p), LIMITS.comparison.len)
    }
  }
  if (s.layout === 'timeline') {
    const steps = s.steps ?? []
    if (steps.length > LIMITS.timeline.steps) over('步骤数', steps.length, LIMITS.timeline.steps)
    for (const st of steps) if (len(st.text) > LIMITS.timeline.len) over('步骤说明长度', len(st.text), LIMITS.timeline.len)
  }
  if (s.layout === 'image-text' && len(s.body) > LIMITS.imageText) over('body 长度', len(s.body), LIMITS.imageText)
  if (s.layout === 'code' && s.code) {
    const lines = String(s.code).split('\n')
    if (lines.length > LIMITS.code.lines) over('代码行数', lines.length, LIMITS.code.lines)
    const worst = Math.max(...lines.map((l) => l.length))
    if (worst > LIMITS.code.cols) over('代码行宽', worst, LIMITS.code.cols)
  }
  if (s.layout === 'big-number' && len(s.caption) > LIMITS.bigNumberCaption) over('caption 长度', len(s.caption), LIMITS.bigNumberCaption)
  if (s.layout === 'stats') {
    for (const st of s.stats ?? []) if (len(st.label) > LIMITS.statsLabel) over('stats label 长度', len(st.label), LIMITS.statsLabel)
  }
  return v
}

/** Score one normalized deck → flat metrics + violation details. */
export function scoreDeck(deck, { expectPages } = {}) {
  const slides = deck.slides ?? []
  const n = slides.length
  const content = slides.filter((s) => CONTENT_LAYOUTS.has(s.layout))
  const cjk = hasCjk(deck.title) || content.some((s) => hasCjk(s.title))

  // 1. Structure compliance
  const structureIssues = []
  if (slides[0]?.layout !== 'cover') structureIssues.push('首页不是 cover')
  if (slides[n - 1]?.layout !== 'end') structureIssues.push('末页不是 end')
  const inRange = expectPages ? Math.abs(n - expectPages) <= 2 : n >= 8 && n <= 14
  if (!inRange) structureIssues.push(`页数 ${n} 超出${expectPages ? `目标 ${expectPages}±2` : ' 8~14'}`)
  const sections = slides.filter((s) => s.layout === 'section').length
  if (n >= 8 && sections < 2) structureIssues.push(`章节数 ${sections}<2`)
  let maxBulletRun = 0
  let run = 0
  for (const s of slides) {
    run = s.layout === 'bullets' ? run + 1 : 0
    maxBulletRun = Math.max(maxBulletRun, run)
  }
  if (maxBulletRun > 2) structureIssues.push(`连续 bullets ${maxBulletRun} 页`)

  // 2. Capacity compliance (first line of overflow defense)
  const capViolations = slides.flatMap((s, i) => capacityViolations(s, i))

  // 3. Concreteness (proxy: number-ish anchor per content page)
  const anchored = content.filter((s) => hasNumberAnchor(slideText(s))).length

  // 4. Opinionated bullets (proxy: length — headline fragments are short)
  const allBullets = content.flatMap((s) => (s.bullets ?? []).map((b) => strip(typeof b === 'string' ? b : b?.text)))
  const sentenceLike = allBullets.filter((b) => b.length >= 12).length

  // 5. Layout diversity
  const distinctLayouts = new Set(content.map((s) => s.layout)).size
  const bulletsShare = content.length ? content.filter((s) => s.layout === 'bullets').length / content.length : 0

  // 6. imageQuery discipline: present, English-only, pairwise distinct
  const queries = slides.map((s) => (s.imageQuery ?? '').trim())
  const missingQuery = queries.filter((q) => !q).length
  const nonEnglish = queries.filter((q) => q && hasCjk(q)).length
  const distinctQueries = new Set(queries.filter(Boolean).map((q) => q.toLowerCase())).size
  const dupQueries = queries.filter(Boolean).length - distinctQueries

  // 7. Speaker-note coverage on content pages (rule §6)
  const noted = content.filter((s) => (s.note ?? '').trim().length >= 20).length

  // 8. Bold emphasis sanity: unbalanced ** breaks rendering (marked edge cases)
  const unbalancedBold = slides.filter((s) => ((slideText(s).match(/\*\*/g) ?? []).length % 2) !== 0).length

  // 9. Language follows topic (baked-in copy depends on this)
  const langMismatch = content.filter((s) => s.title && hasCjk(s.title) !== cjk).length

  return {
    pages: n,
    sections,
    structureIssues,
    capViolations,
    capViolationCount: capViolations.length,
    anchorRate: content.length ? +(anchored / content.length).toFixed(2) : 0,
    sentenceBulletRate: allBullets.length ? +(sentenceLike / allBullets.length).toFixed(2) : 1,
    distinctLayouts,
    bulletsShare: +bulletsShare.toFixed(2),
    missingQuery,
    nonEnglishQuery: nonEnglish,
    dupQueries,
    noteCoverage: content.length ? +(noted / content.length).toFixed(2) : 0,
    unbalancedBold,
    langMismatch,
  }
}

/** Aggregate per-deck scores into a run summary (means + total violations). */
export function summarize(scored) {
  const rows = Object.values(scored)
  const mean = (f) => (rows.length ? +(rows.reduce((a, r) => a + f(r), 0) / rows.length).toFixed(2) : 0)
  return {
    decks: rows.length,
    meanPages: mean((r) => r.pages),
    structureIssueTotal: rows.reduce((a, r) => a + r.structureIssues.length, 0),
    capViolationTotal: rows.reduce((a, r) => a + r.capViolationCount, 0),
    meanAnchorRate: mean((r) => r.anchorRate),
    meanSentenceBulletRate: mean((r) => r.sentenceBulletRate),
    meanDistinctLayouts: mean((r) => r.distinctLayouts),
    meanBulletsShare: mean((r) => r.bulletsShare),
    missingQueryTotal: rows.reduce((a, r) => a + r.missingQuery, 0),
    dupQueryTotal: rows.reduce((a, r) => a + r.dupQueries, 0),
    meanNoteCoverage: mean((r) => r.noteCoverage),
    unbalancedBoldTotal: rows.reduce((a, r) => a + r.unbalancedBold, 0),
    langMismatchTotal: rows.reduce((a, r) => a + r.langMismatch, 0),
  }
}
