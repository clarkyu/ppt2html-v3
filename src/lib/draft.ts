// Wizard draft persistence. The outline wizard is the most expensive stretch of
// the flow (structure + several confirmed parts of LLM output) and used to
// evaporate on refresh / accidental close. A single draft slot in localStorage
// (freshest wins, 24h expiry) lets Home offer "resume where you left off".

import type { GenerateOptions, OutlineSlide, Structure } from '../types'

const KEY = 'ppt2html.draft.v1'
const TTL_MS = 24 * 3600 * 1000

export interface WizardDraft {
  savedAt: number
  topic: string
  opts: GenerateOptions
  structure: Structure
  /** Per-step confirmed outline groups (sparse holes serialize as null). */
  results: Array<OutlineSlide[] | null>
  /** Step index the user was on. */
  step: number
}

export function saveDraft(d: Omit<WizardDraft, 'savedAt'>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...d, savedAt: Date.now() }))
  } catch {
    /* quota/private mode — drafts are best-effort */
  }
}

export function loadDraft(): WizardDraft | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as WizardDraft
    if (!d || typeof d !== 'object' || !d.topic || !d.structure?.sections) return null
    if (Date.now() - (d.savedAt || 0) > TTL_MS) {
      localStorage.removeItem(KEY)
      return null
    }
    return d
  } catch {
    return null
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
