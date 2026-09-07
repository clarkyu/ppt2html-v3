// Local backup / restore of the whole deck library. Decks live only in the
// browser's IndexedDB (no backend), so clearing site data or switching devices
// loses them — this lets the user save a portable .json and bring it back.

import { listDecks, importDecks } from '../store/db'
import { sanitizeDeck } from '../render/normalize'
import type { Deck } from '../types'

const MAGIC = 'ppt2html-v3'

interface BackupFile {
  app: string
  version: number
  exportedAt: string
  decks: Deck[]
}

/** Serialize the whole library into a backup object. `now` = Date.now(). */
export async function buildBackup(now: number): Promise<BackupFile> {
  const decks = await listDecks()
  return { app: MAGIC, version: 1, exportedAt: new Date(now).toISOString(), decks }
}

/** A dated filename like `ppt2html-backup-2026-07-05.json`. `now` = Date.now(). */
export function backupFilename(now: number): string {
  const iso = new Date(now).toISOString().slice(0, 10)
  return `ppt2html-backup-${iso}.json`
}

/** Trigger a browser download of `text` as `filename`. */
export function downloadText(filename: string, text: string, type = 'application/json'): void {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Read + validate an uploaded backup file, returning its decks. Accepts either
 * our wrapper `{app, decks}` or a bare array of decks. Throws with a
 * user-facing (already-localized by the caller) key on bad input.
 */
export async function parseBackupFile(file: File): Promise<Deck[]> {
  const text = await file.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('bad-json')
  }
  const decks = Array.isArray(data) ? data : (data as Partial<BackupFile> | null)?.decks
  if (!Array.isArray(decks)) throw new Error('not-a-backup')
  // A backup is user-controllable JSON (hand-edited, older version, another
  // tool): re-validate every deck field-by-field. A deck with no renderable
  // slide is dropped — one such record used to blank the whole library.
  const now = Date.now()
  const valid = decks
    .map((d) => sanitizeDeck(d, { allowMaterial: true, now }))
    .filter((d): d is Deck => d !== null)
  if (!valid.length) throw new Error('empty-backup')
  return valid
}

/** Write imported decks into the library. Returns how many were saved. */
export function restoreDecks(decks: Deck[]): Promise<number> {
  return importDecks(decks)
}
