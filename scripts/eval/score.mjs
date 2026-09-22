// Mechanical deck scorers — the measurable half of DECK_SCHEMA_GUIDE.
// Pure functions over a normalized Deck: no DOM, no network, importable from
// the runner and from tests. Every metric is a proxy and labeled as such;
// what matters is the DELTA between runs on the same golden set, not the
// absolute number.
//
// The limits, content-layout set, text measure and per-slide checker come
// from src/lib/qualityContract.js — the SAME code the in-product refine pass
// runs, so the two can no longer drift (they had: quote counted as content
// here only, label thresholds differed, image-text limits disagreed).

import {
  CAPACITY_CODES,
  CONTENT_LAYOUTS,
  ANCHOR_EXEMPT,
  bulletTexts,
  deckLanguage,
  formatIssue,
  hasAnchor,
  hasCjk,
  sentenceLike,
  slideIssues,
  slideText,
  slideTextRaw,
  strip,
} from '../../src/lib/qualityContract.js'

export { LIMITS } from '../../src/lib/qualityContract.js'

/** Per-slide capacity findings (codes + a Chinese one-liner for the report). */
function capacityFindings(s, i) {
  const page = `p${i + 1}(${s.layout})`
  return slideIssues(s)
    .filter((x) => CAPACITY_CODES.has(x.code))
    .map((x) => ({ code: x.code, text: `${page} ${formatIssue(x, 'zh')}` }))
}

/** Score one normalized deck → flat metrics + violation details. */
export function scoreDeck(deck, { expectPages } = {}) {
  const slides = deck.slides ?? []
  const n = slides.length
  const content = slides.filter((s) => CONTENT_LAYOUTS.has(s.layout))
  const lang = deckLanguage(deck)

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

  // 2. Capacity compliance (first line of overflow defense) — shared checker
  const findings = slides.flatMap((s, i) => capacityFindings(s, i))
  const capViolations = findings.map((f) => f.text)
  const capCodes = findings.map((f) => f.code)

  // 3. Concreteness (number-ish anchor, or a nameable case, per content page;
  //    quote pages are exempt — the attributed line is the anchor)
  const anchorPages = content.filter((s) => !ANCHOR_EXEMPT.has(s.layout))
  const anchored = anchorPages.filter((s) => hasAnchor(slideText(s))).length

  // 4. Opinionated bullets (proxy: script-aware length — fragments are short)
  const allBullets = content.flatMap((s) => bulletTexts(s))
  const sentenceCount = allBullets.filter((b) => sentenceLike(b)).length

  // 5. Layout diversity
  const distinctLayouts = new Set(content.map((s) => s.layout)).size
  const bulletsShare = content.length ? content.filter((s) => s.layout === 'bullets').length / content.length : 0

  // 6. imageQuery discipline: present, English-only, pairwise distinct
  const queries = slides.map((s) => (s.imageQuery ?? '').trim())
  const missingQuery = queries.filter((q) => !q).length
  const nonEnglish = queries.filter((q) => q && hasCjk(q)).length
  const distinctQueries = new Set(queries.filter(Boolean).map((q) => q.toLowerCase())).size
  const dupQueries = queries.filter(Boolean).length - distinctQueries

  // 7. Speaker-note coverage on content pages (rule §6), quote included
  const noted = content.filter((s) => strip(s.note).length >= 20).length

  // 8. Bold emphasis sanity: unbalanced ** breaks rendering (marked edge cases)
  const unbalancedBold = slides.filter((s) => ((slideTextRaw(s).match(/\*\*/g) ?? []).length % 2) !== 0).length

  // 9. Language follows topic: content titles that differ from the deck's
  //    language (deck title, else the majority — one stray CJK title in an
  //    English deck used to flip the reference and flag every other page)
  const langMismatch = content.filter((s) => strip(s.title) && (hasCjk(s.title) ? 'zh' : 'en') !== lang).length

  return {
    pages: n,
    sections,
    lang,
    structureIssues,
    capViolations,
    capCodes,
    capViolationCount: capViolations.length,
    anchorRate: anchorPages.length ? +(anchored / anchorPages.length).toFixed(2) : 0,
    sentenceBulletRate: allBullets.length ? +(sentenceCount / allBullets.length).toFixed(2) : 1,
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
