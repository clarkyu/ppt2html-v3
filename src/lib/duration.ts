// Estimate a slide count from an intended talk length. Teaching decks run at
// roughly one slide per ~1.4 minutes; clamp to a sane range.
export function slidesForMinutes(minutes: number): number {
  const n = Math.round(minutes / 1.4)
  return Math.max(5, Math.min(32, n))
}

export interface DurationOption {
  value: string // minutes as string; '' = auto
  label: string
}

export const DURATION_OPTIONS: DurationOption[] = [
  { value: '', label: '自动' },
  ...[5, 10, 15, 20, 30, 45].map((m) => ({
    value: String(m),
    label: `约 ${m} 分钟（≈${slidesForMinutes(m)} 页）`,
  })),
]
