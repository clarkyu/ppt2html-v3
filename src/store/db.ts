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
