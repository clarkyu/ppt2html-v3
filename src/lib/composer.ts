// The Home composer (topic, up to 8000 chars of material, theme / duration /
// tone) survives a trip to Settings or a language toggle — both remount Home
// and used to wipe it. Per-tab sessionStorage, cleared once a deck is made.

const KEY = 'ppt2html.composer.v1'

export interface ComposerState {
  topic: string
  material: string
  theme: string
  duration: string
  tone: string
  materialOpen: boolean
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export function saveComposer(s: ComposerState): void {
  try {
    if (!s.topic && !s.material) sessionStorage.removeItem(KEY)
    else sessionStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage unavailable — the composer just won't survive a remount */
  }
}

export function loadComposer(): ComposerState | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as Record<string, unknown>
    if (!d || typeof d !== 'object') return null
    return {
      topic: str(d.topic),
      material: str(d.material),
      theme: str(d.theme),
      duration: str(d.duration),
      tone: str(d.tone),
      materialOpen: d.materialOpen === true,
    }
  } catch {
    return null
  }
}

export function clearComposer(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
