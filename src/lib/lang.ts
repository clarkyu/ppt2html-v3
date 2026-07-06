// Deck-content language detection. Strings baked into rendered slides (the
// section label, fallback titles) must follow the DECK's language, not the UI
// language — a user with an English UI can generate Chinese decks and vice
// versa, so t() is the wrong tool here.

// Hiragana/Katakana, CJK Unified (incl. ext-A), compat ideographs, Hangul.
const CJK = /[぀-ヿ㐀-鿿豈-﫿가-힯]/

/** True when the text contains CJK (Chinese/Japanese/Korean) characters. */
export function hasCjk(s: string | undefined): boolean {
  return CJK.test(s ?? '')
}

/** True when a deck's visible text reads as CJK (title, else early slide titles). */
export function deckIsCjk(deck: { title?: string; slides?: Array<{ title?: string }> }): boolean {
  if (hasCjk(deck.title)) return true
  return (deck.slides ?? []).slice(0, 6).some((s) => hasCjk(s.title))
}
