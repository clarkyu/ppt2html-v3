import { getDeck, saveDeck } from '../store/db'
import { getSampleDeck } from '../sample'
import { mountPlayer, type PlayerHandle } from '../player/player'
import { populateDeckImages } from '../images/search'
import { loadSettings } from '../llm/settings'
import { navigate } from '../router'
import { icons } from '../lib/icons'
import { t } from '../i18n'

export function renderViewer(view: HTMLElement, id: string): () => void {
  let player: PlayerHandle | null = null
  let hideTimer = 0
  let timerInt = 0
  const imgAbort = new AbortController()

  view.innerHTML = `
    <div class="viewer">
      <div class="viewer__bar show">
        <button class="btn btn--sm" data-back>${icons.back} ${t('common.back')}</button>
        <div class="viewer__title" data-title></div>
        <span class="viewer__timer" data-timer title="${t('viewer.timerTitle')}">${icons.clock}<b>00:00</b></span>
        <button class="btn btn--sm" data-notes title="${t('viewer.notes')}">${icons.note}</button>
        <button class="btn btn--sm" data-overview title="${t('viewer.overview')}">${icons.grid}</button>
        <button class="btn btn--sm" data-edit title="${t('viewer.editDeck')}" hidden>${icons.edit} ${t('lib.action.edit')}</button>
        <button class="btn btn--sm" data-print title="${t('viewer.print')}">${icons.print}</button>
        <button class="btn btn--sm" data-full title="${t('viewer.fullscreen')}">${icons.expand}</button>
        <button class="btn btn--sm" data-help title="${t('viewer.shortcuts')}">${icons.keyboard}</button>
      </div>
      <div class="viewer__notes" data-notes-panel hidden></div>
      <div class="viewer__help" data-help-panel hidden>
        <div class="viewer__help-card">
          <h3>${t('viewer.help.title')}</h3>
          <ul>
            <li><kbd>←</kbd> <kbd>→</kbd> ${t('viewer.help.nav')}</li>
            <li><kbd>F</kbd> ${t('viewer.fullscreenShort')} · <kbd>O</kbd> ${t('viewer.overviewShort')}</li>
            <li><kbd>S</kbd> ${t('viewer.help.speaker')}</li>
            <li><kbd>Esc</kbd> ${t('viewer.help.esc')}</li>
            <li>${t('viewer.help.mobile')}</li>
          </ul>
          <button class="btn btn--sm" data-help-close>${t('common.gotIt')}</button>
        </div>
      </div>
      <div class="viewer__mount" data-mount></div>
      <div class="rotate-hint" data-rotate-hint>
        <div class="rotate-hint__icon">${icons.rotate}</div>
        <p class="rotate-hint__title">${t('viewer.rotate.title')}</p>
        <p class="rotate-hint__sub">${t('viewer.rotate.sub')}</p>
        <button class="btn btn--sm" data-rotate-dismiss>${t('viewer.rotate.dismiss')}</button>
      </div>
    </div>`

  const viewerEl = view.querySelector<HTMLElement>('.viewer')!
  const bar = view.querySelector<HTMLElement>('.viewer__bar')!
  const titleEl = view.querySelector<HTMLElement>('[data-title]')!
  const mount = view.querySelector<HTMLElement>('[data-mount]')!

  const goBack = () => {
    if (window.history.length > 1) window.history.back()
    else navigate('#/library')
  }

  // Auto-hide the top bar; reveal handles cursor hiding for the deck itself.
  // Also nudge on tap (pointerdown) so touch users — who fire no mousemove —
  // can bring the bar back to reach 返回 / 总览 after it hides.
  const nudgeBar = () => {
    bar.classList.add('show')
    window.clearTimeout(hideTimer)
    hideTimer = window.setTimeout(() => bar.classList.remove('show'), 2600)
  }
  viewerEl.addEventListener('mousemove', nudgeBar)
  viewerEl.addEventListener('pointerdown', nudgeBar)
  nudgeBar()

  // Portrait phones show a "rotate to landscape" nudge (a 16:9 deck is tiny in
  // portrait). It's playable either way; dismissing hides it for the session.
  view.querySelector('[data-rotate-dismiss]')!.addEventListener('click', () =>
    viewerEl.classList.add('rotate-dismissed'),
  )

  view.querySelector('[data-back]')!.addEventListener('click', goBack)
  view.querySelector('[data-overview]')!.addEventListener('click', () => player?.toggleOverview())
  view.querySelector('[data-print]')!.addEventListener('click', () => window.print())
  view.querySelector('[data-full]')!.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else viewerEl.requestFullscreen?.()
  })

  // Elapsed-time clock in the bar. Click to reset — handy when rehearsing.
  const timerEl = view.querySelector<HTMLElement>('[data-timer]')!
  const timerOut = timerEl.querySelector('b')!
  let startedAt = Date.now()
  const fmt = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000))
    const hh = Math.floor(s / 3600)
    const mm = Math.floor((s % 3600) / 60)
    const ss = s % 60
    const pad = (n: number) => String(n).padStart(2, '0')
    return hh ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`
  }
  const tick = () => (timerOut.textContent = fmt(Date.now() - startedAt))
  timerInt = window.setInterval(tick, 1000)
  timerEl.addEventListener('click', () => {
    startedAt = Date.now()
    tick()
  })

  // Speaker-notes panel: an inline strip at the bottom (no popup window, so it
  // works on phones too). Content is refreshed on every slide change below.
  const notesPanel = view.querySelector<HTMLElement>('[data-notes-panel]')!
  const notesBtn = view.querySelector<HTMLButtonElement>('[data-notes]')!
  let notesOn = false
  const setNote = (text?: string) => {
    notesPanel.textContent = ''
    if (text && text.trim()) {
      notesPanel.textContent = text
    } else {
      const em = document.createElement('em')
      em.textContent = t('viewer.noNote')
      notesPanel.appendChild(em)
    }
  }
  notesBtn.addEventListener('click', () => {
    notesOn = !notesOn
    notesPanel.hidden = !notesOn
    notesBtn.classList.toggle('active', notesOn)
  })

  // Keyboard-shortcuts help overlay.
  const helpPanel = view.querySelector<HTMLElement>('[data-help-panel]')!
  const toggleHelp = (show: boolean) => (helpPanel.hidden = !show)
  view.querySelector('[data-help]')!.addEventListener('click', () => toggleHelp(!!helpPanel.hidden))
  view.querySelector('[data-help-close]')!.addEventListener('click', () => toggleHelp(false))
  helpPanel.addEventListener('click', (e) => {
    if (e.target === helpPanel) toggleHelp(false)
  })

  const load = id === 'sample' ? Promise.resolve(getSampleDeck()) : getDeck(id)
  load
    .then((deck) => {
      if (!deck) {
        mount.innerHTML = `<div class="empty" style="color:#fff"><h3>${t('viewer.notFound')}</h3><p>${t('viewer.notFoundHint')}</p></div>`
        return
      }
      titleEl.textContent = deck.title
      const editBtn = view.querySelector<HTMLButtonElement>('[data-edit]')!
      if (id !== 'sample') {
        editBtn.hidden = false
        editBtn.addEventListener('click', () => navigate(`#/edit/${id}`))
      }
      player = mountPlayer(mount, deck)
      player.onSlideChange((num) => setNote(deck.slides[num - 1]?.note))

      // Background images are fetched lazily, AFTER the deck is on screen, so a
      // slow / rate-limited image search never blocks the deck from opening.
      // Each image patches its slide live and the deck is re-saved so replays
      // (and the editor) get them for free. Sample deck is ephemeral — skip.
      const settings = loadSettings()
      if (id !== 'sample' && settings.images.enabled && deck.slides.some((s) => !s.bg)) {
        let saveTimer = 0
        const scheduleSave = () => {
          window.clearTimeout(saveTimer)
          saveTimer = window.setTimeout(() => void saveDeck(deck), 800)
        }
        void populateDeckImages(deck, settings, {
          signal: imgAbort.signal,
          onImage: (index, bg) => {
            player?.setSlideBackground(index, bg)
            scheduleSave()
          },
        })
          .then(() => {
            if (!imgAbort.signal.aborted) void saveDeck(deck)
          })
          .catch(() => {
            /* best-effort: a missing background just leaves the theme gradient */
          })
      }
    })
    .catch(() => {
      mount.innerHTML = `<div class="empty" style="color:#fff"><h3>${t('viewer.loadError')}</h3></div>`
    })

  return () => {
    window.clearTimeout(hideTimer)
    window.clearInterval(timerInt)
    imgAbort.abort()
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    player?.destroy()
  }
}
