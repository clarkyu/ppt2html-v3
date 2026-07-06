// Presenter (speaker) view: a second browser window that mirrors the deck with
// speaker notes, an elapsed timer + wall clock, and a live preview of the
// current and upcoming slide. It's driven entirely from the main window (no
// receiver iframes, so it works with our hash-routed SPA) — the main deck stays
// the audience display and this window is the presenter's private console.
//
// Nav requests flow one way: this window's buttons/keys call the player's
// next()/prev(); the resulting `slidechanged` re-enters `update()` from the
// viewer, refreshing everything here.

import type { Deck } from '../types'
import type { PlayerHandle } from './player'
import { renderDeckSlides } from '../render/renderDeck'
import { fitSlide } from '../render/fit'
import { escapeHtml } from '../lib/markdown'
import { t } from '../i18n'
import themesCss from '../render/themes.css?raw'
import slidesCss from '../render/slides.css?raw'

export interface PresenterHandle {
  /** Refresh to the given 1-based slide number. */
  update: (num: number) => void
  close: () => void
  closed: () => boolean
  focus: () => void
}

const PRES_CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
  background: var(--bg); color: var(--fg);
  font-family: var(--font-body); overflow: hidden;
  display: flex; flex-direction: column;
}
.pres-top {
  display: flex; align-items: center; gap: 18px;
  padding: 12px 18px; border-bottom: 1px solid var(--card-border);
  font-family: var(--font-mono);
}
.pres-top .clock { color: var(--muted); font-size: 15px; }
.pres-top .timer { font-size: 30px; font-weight: 700; letter-spacing: .5px; }
.pres-top .reset {
  margin-left: 6px; cursor: pointer; border: 1px solid var(--card-border);
  background: var(--card); color: var(--muted); border-radius: 8px; padding: 4px 8px; font-size: 13px;
}
.pres-top .count { margin-left: auto; font-size: 20px; color: var(--fg); }
.pres-main { flex: 1; display: flex; gap: 18px; padding: 18px; min-height: 0; }
.pres-left { display: flex; flex-direction: column; gap: 14px; flex: 1.4; min-width: 0; }
.pres-right { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.pv label {
  display: block; font-size: 12px; text-transform: uppercase; letter-spacing: .12em;
  color: var(--muted); margin-bottom: 6px;
}
.pv-box {
  position: relative; overflow: hidden; width: 100%; aspect-ratio: 16 / 9;
  background: var(--bg); border: 1px solid var(--card-border); border-radius: 12px;
}
.pv--next .pv-box { max-width: 420px; }
.pv-box .reveal.deck { position: absolute; inset: 0; }
.pv-box .slides { position: absolute; left: 0; top: 0; width: 1280px; height: 720px; transform-origin: top left; }
.pv-box .slides > section { position: absolute; inset: 0; }
.pv-box .fragment { opacity: 1 !important; visibility: visible !important; transform: none !important; }
.pv-box .notes { display: none !important; }
.pres-right h4 {
  margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .12em; color: var(--muted);
}
.pres-notes {
  flex: 1; overflow: auto; font-size: 22px; line-height: 1.5; color: var(--fg);
  background: var(--card); border: 1px solid var(--card-border); border-radius: 12px; padding: 16px 18px;
  white-space: pre-wrap;
}
.pres-notes.empty { color: var(--muted); font-style: italic; font-size: 18px; }
.pres-next-title { margin-top: 12px; font-size: 15px; color: var(--muted); }
.pres-next-title b { color: var(--fg); font-weight: 600; }
.pres-controls { display: flex; gap: 12px; padding: 12px 18px; border-top: 1px solid var(--card-border); }
.pres-controls button {
  flex: 1; cursor: pointer; padding: 12px; font-size: 16px; border-radius: 10px;
  border: 1px solid var(--card-border); background: var(--card); color: var(--fg);
}
.pres-controls button:hover { background: var(--card-border); }
`

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return hh ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`
}

export function openPresenter(deck: Deck, player: PlayerHandle): PresenterHandle | null {
  const win = window.open('', 'ppt2html-presenter', 'width=1180,height=760')
  if (!win) return null

  const title = escapeHtml(`${t('presenter.title')} · ${deck.title}`)
  win.document.open()
  win.document.write(
    `<!doctype html><html lang="zh" class="theme-${escapeHtml(deck.theme)}"><head>` +
      `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${title}</title><style>${themesCss}\n${slidesCss}\n${PRES_CSS}</style></head>` +
      `<body>` +
      `<div class="pres-top">` +
      `<div class="timer" data-timer>00:00</div><button class="reset" data-reset>${escapeHtml(t('presenter.reset'))}</button>` +
      `<div class="clock" data-clock></div>` +
      `<div class="count" data-count></div></div>` +
      `<div class="pres-main">` +
      `<div class="pres-left">` +
      `<div class="pv pv--cur"><label>${escapeHtml(t('presenter.current'))}</label><div class="pv-box" data-cur></div></div>` +
      `</div>` +
      `<div class="pres-right">` +
      `<div class="pv pv--next"><label>${escapeHtml(t('presenter.next'))}</label><div class="pv-box" data-next></div></div>` +
      `<h4 style="margin-top:14px">${escapeHtml(t('presenter.notes'))}</h4>` +
      `<div class="pres-notes" data-notes></div>` +
      `<div class="pres-next-title" data-next-title></div>` +
      `</div></div>` +
      `<div class="pres-controls">` +
      `<button data-prev>${escapeHtml(t('presenter.prev'))}</button>` +
      `<button data-next-btn>${escapeHtml(t('presenter.nextBtn'))}</button>` +
      `</div></body></html>`,
  )
  win.document.close()

  const doc = win.document
  const total = deck.slides.length

  // Hidden source of all rendered slides, to clone the current/next previews from.
  const src = doc.createElement('div')
  src.className = 'reveal deck'
  src.style.display = 'none'
  src.innerHTML = `<div class="slides">${renderDeckSlides(deck)}</div>`
  doc.body.appendChild(src)
  const sections = Array.prototype.slice.call(
    src.querySelectorAll('.slides > section'),
  ) as HTMLElement[]

  const curBox = doc.querySelector<HTMLElement>('[data-cur]')
  const nextBox = doc.querySelector<HTMLElement>('[data-next]')
  const notesEl = doc.querySelector<HTMLElement>('[data-notes]')
  const nextTitleEl = doc.querySelector<HTMLElement>('[data-next-title]')
  const countEl = doc.querySelector<HTMLElement>('[data-count]')
  const timerEl = doc.querySelector<HTMLElement>('[data-timer]')
  const clockEl = doc.querySelector<HTMLElement>('[data-clock]')

  const scalePreview = (box: HTMLElement | null) => {
    const sl = box?.querySelector<HTMLElement>('.slides')
    if (box && sl) sl.style.transform = `scale(${box.clientWidth / 1280})`
  }
  const mountPreview = (box: HTMLElement | null, section: HTMLElement | undefined) => {
    if (!box) return
    box.textContent = ''
    const wrap = doc.createElement('div')
    wrap.className = 'reveal deck'
    const sl = doc.createElement('div')
    sl.className = 'slides'
    if (section) {
      const clone = section.cloneNode(true) as HTMLElement
      sl.appendChild(clone)
      wrap.appendChild(sl)
      box.appendChild(wrap)
      scalePreview(box)
      try {
        fitSlide(clone)
      } catch {
        /* preview fit is best-effort */
      }
    } else {
      wrap.appendChild(sl)
      box.appendChild(wrap)
    }
  }

  let cur = 1
  const update = (num: number) => {
    if (win.closed) return
    cur = Math.max(1, Math.min(total, num))
    mountPreview(curBox, sections[cur - 1])
    mountPreview(nextBox, sections[cur])
    const note = deck.slides[cur - 1]?.note?.trim()
    if (notesEl) {
      notesEl.textContent = note || t('presenter.noNote')
      notesEl.classList.toggle('empty', !note)
    }
    const nextTitle = cur < total ? deck.slides[cur]?.title?.trim() : ''
    if (nextTitleEl) {
      nextTitleEl.innerHTML = nextTitle
        ? `${escapeHtml(t('presenter.upNext'))} <b>${escapeHtml(nextTitle)}</b>`
        : escapeHtml(t('presenter.atEnd'))
    }
    if (countEl) countEl.textContent = `${cur} / ${total}`
  }

  // Timer + clock, ticked from the main window (cleared when it closes / unmounts).
  let startedAt = Date.now()
  const tick = () => {
    if (win.closed) return
    if (timerEl) timerEl.textContent = fmt(Date.now() - startedAt)
    if (clockEl) clockEl.textContent = new Date().toLocaleTimeString()
  }
  const timerInt = window.setInterval(tick, 1000)

  doc.querySelector('[data-reset]')?.addEventListener('click', () => {
    startedAt = Date.now()
    tick()
  })
  doc.querySelector('[data-prev]')?.addEventListener('click', () => player.prev())
  doc.querySelector('[data-next-btn]')?.addEventListener('click', () => player.next())
  doc.addEventListener('keydown', (e: KeyboardEvent) => {
    const k = e.key
    if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === ' ') {
      player.next()
      e.preventDefault()
    } else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp') {
      player.prev()
      e.preventDefault()
    }
  })
  win.addEventListener('resize', () => {
    scalePreview(curBox)
    scalePreview(nextBox)
  })

  tick()
  // Start on the deck's current slide.
  let startNum = 1
  try {
    startNum = player.reveal.getSlidePastCount() + 1
  } catch {
    /* reveal may not report yet; default to the first slide */
  }
  update(startNum)

  return {
    update,
    close: () => {
      window.clearInterval(timerInt)
      if (!win.closed) win.close()
    },
    closed: () => win.closed,
    focus: () => {
      if (!win.closed) win.focus()
    },
  }
}
