// Deck-content language detection. Strings baked into rendered slides (the
// section label, fallback titles) must follow the DECK's language, not the UI
// language — a user with an English UI can generate Chinese decks and vice
// versa, so t() is the wrong tool here: use deckText().

// Hiragana/Katakana, CJK Unified (incl. ext-A), compat ideographs, Hangul.
// Exported as a class string so other modules (rehearsal word count, material
// slicing) build their own flagged regexes from the SAME range instead of
// hand-copying it — the copies used to drift (one lacked Hangul).
export const CJK_CLASS = '[぀-ヿ㐀-鿿豈-﫿가-힯]'
const CJK = new RegExp(CJK_CLASS)
const HAN = /\p{Script=Han}/u

/** A fresh global matcher over the CJK range (global regexes carry lastIndex
 * state, so callers get their own instance rather than sharing one). */
export const cjkMatcher = (): RegExp => new RegExp(CJK_CLASS, 'g')

/** True when the text contains CJK (Chinese/Japanese/Korean) characters —
 * script-agnostic measure for word counting and slicing. */
export function hasCjk(s: string | undefined): boolean {
  return CJK.test(s ?? '')
}

/** True when the text contains Han (Chinese) characters. Kana / Hangul do
 * NOT count: a Korean deck used to get 「章节」 and 「谢谢观看」 baked in. */
export function hasHan(s: string | undefined): boolean {
  return HAN.test(s ?? '')
}

/** Majority call for a stretch of text: Chinese when Han characters carry it
 * (one Han character ≈ a word, so it is weighed against Latin letters at
 * 1:4). A single Chinese title in an English deck no longer flips the deck. */
export function isChineseText(s: string | undefined): boolean {
  const text = s ?? ''
  const han = (text.match(/\p{Script=Han}/gu) ?? []).length
  if (!han) return false
  const latin = (text.match(/[A-Za-z]/g) ?? []).length
  return han * 4 >= latin
}

/** Whether a deck reads as Chinese: title plus every slide title, by majority. */
export function deckIsChinese(deck: { title?: string; slides?: Array<{ title?: string }> }): boolean {
  return isChineseText([deck.title, ...(deck.slides ?? []).map((s) => s.title)].filter(Boolean).join('\n'))
}

// Every fixed string that lands INSIDE deck content, in both languages, in
// one place — renderers, exports, the outline planner, the editor and the
// importer used to each keep their own copy (or reach for the UI language).
const DECK_STRINGS = {
  thanks: ['谢谢观看', 'Thank You'],
  chapter: ['章节', 'Chapter'],
  part: ['环节', 'Part'],
  newPart: ['新部分', 'New part'],
  untitledPage: ['未命名页', 'Untitled page'],
  untitledDeck: ['未命名课件', 'Untitled deck'],
  newSlide: ['新的一页', 'New slide'],
  newBullet: ['要点一', 'Point one'],
  newCard: ['新方案', 'New option'],
  newStep: ['新步骤', 'New step'],
} as const

export type DeckTextKey = keyof typeof DECK_STRINGS

/** A deck-content string in the deck's language (`zh` from deckIsChinese /
 * hasHan of the topic). */
export function deckText(zh: boolean, key: DeckTextKey): string {
  return DECK_STRINGS[key][zh ? 0 : 1]
}

/** Placeholder chapter titles when the structure planner returns none. */
export function fallbackSections(zh: boolean): string[] {
  return zh ? ['背景与概念', '核心内容', '应用与小结'] : ['Background & concepts', 'Core content', 'Application & wrap-up']
}
