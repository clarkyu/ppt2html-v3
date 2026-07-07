// Saved custom themes ("我的风格"), persisted in localStorage so a user's own
// palettes are reusable across decks. Kept separate from a deck's own
// `customTheme` (which is a snapshot copied in when applied).

import type { CustomTheme } from '../types'

const KEY = 'ppt2html.styles.v1'

export interface SavedStyle {
  id: string
  name: string
  theme: CustomTheme
}

export function loadStyles(): SavedStyle[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (s): s is SavedStyle =>
        s && typeof s.id === 'string' && typeof s.name === 'string' && s.theme && typeof s.theme.bg === 'string',
    )
  } catch {
    return []
  }
}

function persist(list: SavedStyle[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* quota / private mode — best-effort */
  }
}

export function addStyle(name: string, theme: CustomTheme): SavedStyle {
  const style: SavedStyle = { id: crypto.randomUUID(), name: name.trim() || '我的风格', theme }
  persist([...loadStyles(), style])
  return style
}

export function removeStyle(id: string): void {
  persist(loadStyles().filter((s) => s.id !== id))
}
