// Mechanical per-slide quality checks — the in-product half of the refine
// pass. Finding defects is free and deterministic (no LLM): capacity
// overruns, missing concrete anchors, label-like bullets, missing notes.
// Only flagged pages then go to regenerateSlide with a targeted critique.
//
// The checks themselves live in qualityContract.js, shared verbatim with the
// eval scorer (scripts/eval/score.mjs); llm/prompt.ts §8 states the same
// limits to the model. This module only adds the two renderings: findings for
// the user (UI language) and the critique for the model (deck language — the
// page gets rewritten in that language, and a Chinese critique on an English
// deck used to pull the rewrite towards Chinese).

import type { Deck } from '../types'
import { deckIsCjk } from './lang'
import { getLang, t } from '../i18n'
import { slideIssues as checkSlide, formatIssue, strip, type QualityIssue } from './qualityContract.js'

export type { QualityIssue } from './qualityContract.js'

export interface SlideIssues {
  index: number
  /** Display title of the page (localized "Page N" when it has no text). */
  title: string
  issues: QualityIssue[]
}

/** Check one slide; returns structured findings (empty = clean). */
export function slideIssues(s: Deck['slides'][number]): QualityIssue[] {
  return checkSlide(s)
}

/** Scan the whole deck; only pages with issues are returned. */
export function deckIssues(deck: Deck): SlideIssues[] {
  const out: SlideIssues[] = []
  deck.slides.forEach((s, i) => {
    const issues = checkSlide(s)
    if (issues.length) {
      const title = strip(s.title || s.value || s.text) || t('refine.pageN').replace('{n}', String(i + 1))
      out.push({ index: i, title, issues })
    }
  })
  return out
}

/** A finding as shown in the refine panel, in the UI language. */
export function issueText(issue: QualityIssue): string {
  return formatIssue(issue, getLang())
}

/** The rewrite instruction for one flagged page, in the DECK's language. */
export function refineInstruction(deck: Deck, issues: QualityIssue[]): string {
  const lang = deckIsCjk(deck) ? 'zh' : 'en'
  const head =
    lang === 'zh'
      ? '按以下质量问题清单修复本页，其余内容保持原意与信息量，不要顺手改动没有问题的部分：'
      : 'Fix this page against the quality issues below. Keep everything else as it is in meaning and detail, and do not touch what is not flagged:'
  return head + '\n' + issues.map((x) => `- ${formatIssue(x, lang)}`).join('\n')
}
