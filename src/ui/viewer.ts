import { getDeck, saveDeck } from '../store/db'
import { getSampleDeck } from '../sample'
import { mountPlayer, type PlayerHandle } from '../player/player'
import { populateDeckImages } from '../images/search'
import { loadSettings } from '../llm/settings'
import { navigate } from '../router'
import { icons } from '../lib/icons'
import { t } from '../i18n'
import { toast } from '../lib/toast'
import { downloadStandalone } from '../export/standalone'
import { openPresenter, type PresenterHandle } from '../player/presenter'
import { fitSlide } from '../render/fit'
import type { Deck } from '../types'

export function renderViewer(view: HTMLElement, id: string): () => void {
  let player: PlayerHandle | null = null
  let loadedDeck: Deck | null = null
  let presenter: PresenterHandle | null = null
  let hideTimer = 0
  let timerInt = 0
  const imgAbort = new AbortController()

  view.innerHTML = `
    <div class="viewer">
      <div class="viewer__bar show">
        <button class="btn btn--sm" data-back>${icons.back} ${t('common.back')}</button>
        <div class="viewer__title" data-title></div>
        <span class="viewer__timer" data-timer title="${t('viewer.timerTitle')}">${icons.clock}<b>00:00</b></span>
        <button class="btn btn--sm viewer__more" data-more title="${t('viewer.more')}">⋯</button>
        <div class="viewer__tools" data-tools>
          <button class="btn btn--sm" data-step title="${t('viewer.stepMode')}">${icons.steps}</button>
          <button class="btn btn--sm" data-notes title="${t('viewer.notes')}">${icons.note}</button>
          <button class="btn btn--sm" data-notes-gen title="${t('viewer.genNotes')}">${icons.mic}</button>
          <button class="btn btn--sm" data-presenter title="${t('viewer.presenter')}">${icons.presenter}</button>
          <button class="btn btn--sm" data-overview title="${t('viewer.overview')}">${icons.grid}</button>
          <button class="btn btn--sm" data-edit title="${t('viewer.editDeck')}" hidden>${icons.edit} ${t('lib.action.edit')}</button>
          <button class="btn btn--sm" data-print title="${t('viewer.print')}">${icons.print}</button>
          <button class="btn btn--sm" data-export title="${t('viewer.exportHtml')}">${icons.download}</button>
          <button class="btn btn--sm" data-pptx title="${t('viewer.exportPptx')}">${icons.pptx}</button>
          <button class="btn btn--sm" data-full title="${t('viewer.fullscreen')}">${icons.expand}</button>
          <button class="btn btn--sm" data-help title="${t('viewer.shortcuts')}">${icons.keyboard}</button>
        </div>
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

  // Narrow screens tuck the secondary tools behind a "⋯" menu; any tool click
  // closes it again.
  const toolsEl = view.querySelector<HTMLElement>('[data-tools]')!
  view.querySelector('[data-more]')!.addEventListener('click', (e) => {
    e.stopPropagation()
    toolsEl.classList.toggle('open')
  })
  toolsEl.addEventListener('click', () => toolsEl.classList.remove('open'))

  // Portrait phones show a "rotate to landscape" nudge (a 16:9 deck is tiny in
  // portrait). It's playable either way; dismissing hides it for the session.
  view.querySelector('[data-rotate-dismiss]')!.addEventListener('click', () =>
    viewerEl.classList.add('rotate-dismissed'),
  )

  view.querySelector('[data-back]')!.addEventListener('click', goBack)
  view.querySelector('[data-overview]')!.addEventListener('click', () => player?.toggleOverview())
  view.querySelector('[data-print]')!.addEventListener('click', () => window.print())

  // Print prep: the player only overflow-fits a slide when it's shown, so pages
  // never visited would print "raw" — long titles clipped by the per-page
  // overflow:hidden. Fit every slide right before printing (covers both the
  // toolbar button and Ctrl+P — beforeprint fires for window.print() too).
  const fitAllForPrint = () => {
    mount.querySelectorAll<HTMLElement>('.reveal .slides > section').forEach((sec) => {
      const prev = { display: sec.style.display, visibility: sec.style.visibility }
      sec.style.display = 'block'
      sec.style.visibility = 'hidden'
      fitSlide(sec)
      sec.style.display = prev.display
      sec.style.visibility = prev.visibility
    })
  }
  window.addEventListener('beforeprint', fitAllForPrint)

  // Export the deck as a single, offline-playable .html file.
  view.querySelector('[data-export]')!.addEventListener('click', () => {
    if (!loadedDeck) return
    downloadStandalone(loadedDeck, Date.now())
    toast(t('viewer.exportHtmlDone'))
  })

  // Export an editable PowerPoint (pptxgenjs is loaded on demand).
  const pptxBtn = view.querySelector<HTMLButtonElement>('[data-pptx]')!
  pptxBtn.addEventListener('click', () => {
    if (!loadedDeck) return
    pptxBtn.disabled = true
    toast(t('viewer.exportPptxStart'))
    import('../export/pptx')
      .then(({ exportPptx }) => exportPptx(loadedDeck!))
      .then(() => toast(t('viewer.exportPptxDone')))
      .catch(() => toast(t('viewer.exportPptxFailed')))
      .finally(() => {
        pptxBtn.disabled = false
      })
  })

  // Presenter view: a second window with notes, timer and a next-slide preview.
  const togglePresenter = () => {
    if (presenter && !presenter.closed()) {
      presenter.focus()
      return
    }
    // A previously-opened window the user closed leaves a stale ticker — clear it.
    presenter?.close()
    if (!loadedDeck || !player) return
    presenter = openPresenter(loadedDeck, player)
    if (!presenter) toast(t('viewer.presenterBlocked'))
  }
  view.querySelector('[data-presenter]')!.addEventListener('click', togglePresenter)

  // `S` opens the presenter view (unless the user is typing in a field).
  const onKey = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null
    if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
    if ((e.key === 's' || e.key === 'S') && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault()
      togglePresenter()
    }
  }
  window.addEventListener('keydown', onKey)
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
      loadedDeck = deck
      titleEl.textContent = deck.title
      const editBtn = view.querySelector<HTMLButtonElement>('[data-edit]')!
      if (id !== 'sample') {
        editBtn.hidden = false
        editBtn.addEventListener('click', () => navigate(`#/edit/${id}`))
      }
      player = mountPlayer(mount, deck)
      const stepBtn = view.querySelector<HTMLButtonElement>('[data-step]')!
      stepBtn.classList.toggle('active', player.stepMode())
      stepBtn.addEventListener('click', () => {
        const on = !player!.stepMode()
        player!.setStepMode(on)
        stepBtn.classList.toggle('active', on)
        toast(on ? t('viewer.stepOn') : t('viewer.stepOff'))
      })
      // Remember the playback position per deck (session-scoped): a refresh or
      // an accidental back no longer dumps the presenter to slide 1.
      const posKey = `ppt2html.pos.${id}`
      let posRestored = false
      let curNum = 1
      player.onSlideChange((num) => {
        curNum = num
        if (!posRestored) {
          posRestored = true
          const saved = Number(sessionStorage.getItem(posKey))
          if (Number.isFinite(saved) && saved > 1 && saved <= deck.slides.length && num === 1) {
            player?.reveal.slide(saved - 1)
            return
          }
        }
        try {
          sessionStorage.setItem(posKey, String(num))
        } catch {
          /* best-effort */
        }
        setNote(deck.slides[num - 1]?.note)
        presenter?.update(num)
      })

      // Full speaker script (逐字稿): a post-pass over the finished deck, batch
      // by batch — each batch is saved as it lands, so failures keep progress.
      const genBtn = view.querySelector<HTMLButtonElement>('[data-notes-gen]')!
      genBtn.addEventListener('click', () => {
        if (!loadedDeck || genBtn.disabled) return
        const hasLong = loadedDeck.slides.some((s) => (s.note ?? '').trim().length > 80)
        if (hasLong && !window.confirm(t('viewer.genNotesConfirm'))) return
        genBtn.disabled = true
        toast(t('viewer.genNotesStart'))
        const total = loadedDeck.slides.length
        genBtn.innerHTML = `${icons.mic} <b>0/${total}</b>`
        import('../llm/notes')
          .then(({ generateSpeakerNotes }) =>
            generateSpeakerNotes(loadedDeck!, loadSettings(), {
              signal: imgAbort.signal,
              onProgress: (done) => {
                genBtn.innerHTML = `${icons.mic} <b>${done}/${total}</b>`
                if (id !== 'sample') void saveDeck(loadedDeck!)
                setNote(loadedDeck!.slides[curNum - 1]?.note)
                presenter?.update(curNum)
              },
            }),
          )
          .then(() => {
            toast(t('viewer.genNotesDone'))
            // Surface the result right away.
            if (!notesOn) notesBtn.click()
            setNote(loadedDeck!.slides[curNum - 1]?.note)
          })
          .catch((e) => {
            if ((e as DOMException)?.name === 'AbortError') return
            toast((e as Error)?.message || t('viewer.genNotesFailed'))
          })
          .finally(() => {
            genBtn.disabled = false
            genBtn.innerHTML = icons.mic
          })
      })

      // Background images are fetched lazily, AFTER the deck is on screen, so a
      // slow / rate-limited image search never blocks the deck from opening.
      // Each image patches its slide live and the deck is re-saved so replays
      // (and the editor) get them for free. Sample deck is ephemeral — skip.
      const settings = loadSettings()
      if (id !== 'sample' && settings.images.enabled && deck.slides.some((s) => !s.bg && !s.bgOff)) {
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
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('beforeprint', fitAllForPrint)
    imgAbort.abort()
    presenter?.close()
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    player?.destroy()
  }
}
