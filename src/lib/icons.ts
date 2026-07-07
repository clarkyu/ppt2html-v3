// Inline SVG icons (24×24, currentColor). Stroke-based, 2px.
const wrap = (inner: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`

export const icons = {
  play: wrap('<polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none"/>'),
  sparkles: wrap('<path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z"/><path d="M19 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z"/>'),
  plus: wrap('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
  library: wrap('<rect x="3" y="4" width="6" height="16" rx="1"/><rect x="10.5" y="4" width="6" height="16" rx="1"/><path d="M18.5 6l3 .8-3 12-2.9-.8"/>'),
  settings: wrap('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  trash: wrap('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/>'),
  download: wrap('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
  upload: wrap('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'),
  back: wrap('<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>'),
  grid: wrap('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>'),
  expand: wrap('<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>'),
  empty: wrap('<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 9h18"/><path d="M9 18l-1 3M15 18l1 3"/>'),
  print: wrap('<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>'),
  up: wrap('<polyline points="18 15 12 9 6 15"/>'),
  down: wrap('<polyline points="6 9 12 15 18 9"/>'),
  refresh: wrap('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>'),
  copy: wrap('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  // "rename" — a serif-T (text/label) glyph, distinct from the pencil `edit` icon.
  rename: wrap('<path d="M5 6V4h14v2"/><path d="M12 4v16"/><path d="M9 20h6"/>'),
  edit: wrap('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>'),
  // "rotate device" — a phone with a curved arrow, hinting landscape playback.
  rotate: wrap('<rect x="7" y="2.5" width="10" height="19" rx="2"/><line x1="10.5" y1="18.5" x2="13.5" y2="18.5"/><path d="M2.5 9.5a9 9 0 0 1 9-6" fill="none"/><polyline points="11.5 1 12 3.5 9.5 4.2"/>'),
  save: wrap('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>'),
  search: wrap('<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),
  clock: wrap('<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>'),
  note: wrap('<path d="M4 4h16v11l-5 5H4z"/><path d="M15 20v-5h5"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="12" y2="13"/>'),
  keyboard: wrap('<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="6" y1="9" x2="6" y2="9"/><line x1="10" y1="9" x2="10" y2="9"/><line x1="14" y1="9" x2="14" y2="9"/><line x1="18" y1="9" x2="18" y2="9"/><line x1="7" y1="14" x2="17" y2="14"/>'),
  // "step reveal" — list lines appearing one by one.
  steps: wrap('<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="9" y2="18"/><polyline points="16 15 18 17 21 13.5"/>'),
  // "pptx" — a slide box carrying a P.
  pptx: wrap('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 16v-8h3.2a2.4 2.4 0 1 1 0 4.8H9"/>'),
  // "presenter view" — a screen split into current + next panes, on a stand.
  presenter: wrap('<rect x="2" y="4" width="20" height="13" rx="2"/><line x1="14" y1="4" x2="14" y2="17"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/>'),
  // "speaker script" — a microphone.
  mic: wrap('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="9" y1="22" x2="15" y2="22"/>'),
}

export type IconName = keyof typeof icons
