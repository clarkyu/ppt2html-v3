import { saveDeck } from '../store/db'
import { toast } from './toast'
import { t } from '../i18n'
import type { Deck } from '../types'

/**
 * `saveDeck` that never fails silently: resolves true on success, false after
 * showing a localized toast. Every fire-and-forget save site used to swallow
 * the rejection, so a quota-exhausted IndexedDB (realistic — AI images and
 * logos are MB-scale data: URLs inside deck records) made the UI report
 * "saved" while the change evaporated on the next open.
 */
export async function persistDeck(deck: Deck): Promise<boolean> {
  try {
    await saveDeck(deck)
    return true
  } catch (err) {
    console.error('saveDeck failed', err)
    toast(t('db.saveFailed'), 4200)
    return false
  }
}
