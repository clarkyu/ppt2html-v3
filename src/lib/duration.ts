// Estimate a slide count from an intended talk length. Teaching decks run at
// roughly one slide per ~1.3 minutes; clamp to a sane range.
export function slidesForMinutes(minutes: number): number {
  const n = Math.round(minutes / 1.3)
  return Math.max(5, Math.min(40, n))
}

export interface DurationOption {
  value: string // minutes as string; '' = auto
  label: string
}

import { getLang, t } from '../i18n'

/** Duration choices with labels in the current UI language. */
export function durationOptions(): DurationOption[] {
  const en = getLang() === 'en'
  return [
    { value: '', label: t('tone.auto') },
    ...[5, 10, 15, 20, 30, 45].map((m) => ({
      value: String(m),
      label: en
        ? `~${m} min (≈${slidesForMinutes(m)} slides)`
        : `约 ${m} 分钟（≈${slidesForMinutes(m)} 页）`,
    })),
  ]
}
