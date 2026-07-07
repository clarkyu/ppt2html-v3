// Semantic bullet icons: a small, curated set the LLM picks from (by key) so
// every bullet can carry a meaningful glyph instead of the same diamond dot.
// Stroke-based 24×24, currentColor — same visual language as lib/icons.ts.

const wrap = (inner: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`

const ICONS: Record<string, string> = {
  idea: wrap('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 1 4 10.5c-.8.7-1 1.6-1 2.5h-6c0-.9-.2-1.8-1-2.5A6 6 0 0 1 12 3z"/>'),
  check: wrap('<circle cx="12" cy="12" r="9"/><polyline points="8 12.5 11 15.5 16 9.5"/>'),
  cross: wrap('<circle cx="12" cy="12" r="9"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>'),
  warning: wrap('<path d="M12 3 22 20H2L12 3z"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="12" y1="17" x2="12" y2="17"/>'),
  target: wrap('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.8" fill="currentColor"/>'),
  up: wrap('<polyline points="3 16 9 10 13 14 21 6"/><polyline points="15 6 21 6 21 12"/>'),
  down: wrap('<polyline points="3 8 9 14 13 10 21 18"/><polyline points="15 18 21 18 21 12"/>'),
  time: wrap('<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>'),
  money: wrap('<circle cx="12" cy="12" r="9"/><path d="M9 8.5l3 3.5 3-3.5M12 12v5M9.5 13.5h5M9.5 15.5h5"/>'),
  team: wrap('<circle cx="8.5" cy="9" r="3"/><path d="M2.5 20c0-3 2.7-5 6-5s6 2 6 5"/><circle cx="16.5" cy="9.5" r="2.4"/><path d="M16 15.2c2.9.2 5.5 2 5.5 4.8"/>'),
  user: wrap('<circle cx="12" cy="8" r="4"/><path d="M4.5 21c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6"/>'),
  heart: wrap('<path d="M12 20.5C7 16.5 3.5 13.4 3.5 9.6 3.5 7 5.5 5 8 5c1.6 0 3 .8 4 2.1C13 5.8 14.4 5 16 5c2.5 0 4.5 2 4.5 4.6 0 3.8-3.5 6.9-8.5 10.9z"/>'),
  star: wrap('<path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9L12 3.5z"/>'),
  shield: wrap('<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8-7.5 9.5-4.3-1.5-7.5-4.9-7.5-9.5V6L12 3z"/><polyline points="8.8 12 11 14.2 15.2 10"/>'),
  lock: wrap('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><line x1="12" y1="14.5" x2="12" y2="16.5"/>'),
  key: wrap('<circle cx="8" cy="15" r="4.5"/><path d="M11.5 11.5 20 3M15.5 7.5l3 3M13 10l2 2"/>'),
  rocket: wrap('<path d="M12 17c-1-4 0-9 5.5-13 .8 6-1 11-5.5 13z"/><path d="M12.5 8.5C9 8 6 9.7 4.5 13c2 0 3.4.4 4.5 1.3M15.6 11.5c.6 3.5-1 6.6-4.3 8.2 0-2-.4-3.4-1.3-4.5"/><path d="M6.5 17.5c-1.4 1-2 2.6-2 4 1.4 0 3-.6 4-2"/>'),
  book: wrap('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20"/>'),
  tool: wrap('<path d="M14.5 6.5a4 4 0 0 1 5-5l-3 3 .8 2.2 2.2.8 3-3a4 4 0 0 1-5 5L8 19a2.1 2.1 0 1 1-3-3l9.5-9.5z"/>'),
  gear: wrap('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>'),
  globe: wrap('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>'),
  pin: wrap('<path d="M12 21s-6.5-5.7-6.5-10.2A6.5 6.5 0 0 1 12 4.3a6.5 6.5 0 0 1 6.5 6.5C18.5 15.3 12 21 12 21z"/><circle cx="12" cy="10.8" r="2.3"/>'),
  mail: wrap('<rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3.5 7 12 13 20.5 7"/>'),
  chat: wrap('<path d="M20 14a2 2 0 0 1-2 2H8l-4.5 4V6a2 2 0 0 1 2-2H18a2 2 0 0 1 2 2v8z"/>'),
  search: wrap('<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),
  flag: wrap('<line x1="5" y1="21" x2="5" y2="3.5"/><path d="M5 4.5c4-2 7 2 12 0v9c-5 2-8-2-12 0"/>'),
  link: wrap('<path d="M10 14a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.1"/><path d="M14 10a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.1"/>'),
  layers: wrap('<path d="M12 3 21 8l-9 5-9-5 9-5z"/><polyline points="3.5 12.5 12 17 20.5 12.5"/><polyline points="3.5 16.5 12 21 20.5 16.5"/>'),
  data: wrap('<ellipse cx="12" cy="5.5" rx="8" ry="2.8"/><path d="M4 5.5V18.5c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8V5.5"/><path d="M4 12c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8"/>'),
  code: wrap('<polyline points="8.5 7 3.5 12 8.5 17"/><polyline points="15.5 7 20.5 12 15.5 17"/><line x1="13.5" y1="4.5" x2="10.5" y2="19.5"/>'),
  leaf: wrap('<path d="M5 20C5 9 12 4 20 4c0 9-4 15-13 15"/><path d="M5 20c2-5 6-9 11-11"/>'),
  fire: wrap('<path d="M12 21c-3.9 0-6.5-2.5-6.5-6 0-3 2-5 3.5-7 .4 1.4 1 2.3 2 3 0-2.5.8-5.6 3.5-8 .3 3 1.5 4.6 2.7 6.2 1 1.4 1.8 2.9 1.8 4.8 0 3.5-2.6 7-7 7z"/>'),
  balance: wrap('<line x1="12" y1="4" x2="12" y2="20"/><path d="M9 20h6M4 7h16"/><path d="M6.5 7 4 13a2.6 2.6 0 0 0 5 0L6.5 7zM17.5 7 15 13a2.6 2.6 0 0 0 5 0L17.5 7z"/>'),
  question: wrap('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2A2.6 2.6 0 0 1 12 7.5c1.4 0 2.5 1 2.5 2.3 0 1.7-2.5 2-2.5 3.7"/><line x1="12" y1="16.5" x2="12" y2="16.5"/>'),
}

export const SEM_ICON_KEYS = Object.keys(ICONS)
const KEY_SET = new Set(SEM_ICON_KEYS)

/** Validated icon key (or undefined for unknown/absent values). */
export function semIconKey(v: unknown): string | undefined {
  return typeof v === 'string' && KEY_SET.has(v.trim()) ? v.trim() : undefined
}

/** SVG markup for a semantic icon key (empty string when unknown). */
export function semIcon(key: string | undefined): string {
  return (key && ICONS[key]) || ''
}
