import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Deck } from '../types'

interface DeckDB extends DBSchema {
  decks: {
    key: string
    value: Deck
    indexes: { 'by-updated': number }
  }
}

let dbPromise: Promise<IDBPDatabase<DeckDB>> | null = null

function db(): Promise<IDBPDatabase<DeckDB>> {
  if (!dbPromise) {
    dbPromise = openDB<DeckDB>('ppt2html', 1, {
      upgrade(database) {
        const store = database.createObjectStore('decks', { keyPath: 'id' })
        store.createIndex('by-updated', 'updatedAt')
      },
    })
  }
  return dbPromise
}

export async function saveDeck(deck: Deck): Promise<void> {
  await (await db()).put('decks', deck)
}

export async function getDeck(id: string): Promise<Deck | undefined> {
  return (await db()).get('decks', id)
}

/** All decks, newest first. */
export async function listDecks(): Promise<Deck[]> {
  const all = await (await db()).getAllFromIndex('decks', 'by-updated')
  return all.reverse()
}

export async function deleteDeck(id: string): Promise<void> {
  await (await db()).delete('decks', id)
}

/** Save a copy of a deck under a new id/title. Returns the new deck. */
export async function duplicateDeck(id: string): Promise<Deck | undefined> {
  const src = await getDeck(id)
  if (!src) return undefined
  const now = Date.now()
  const copy: Deck = {
    ...structuredClone(src),
    id: crypto.randomUUID(),
    title: `${src.title}（副本）`,
    createdAt: now,
    updatedAt: now,
  }
  await saveDeck(copy)
  return copy
}
