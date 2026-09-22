import { getDeck } from '../store/db'
import { persistDeck } from '../lib/persist'
import { getSampleDeck } from '../sample'
import { mountPlayer, type PlayerHandle } from '../player/player'
import { populateDeckImages } from '../images/search'
import { isConfigured, loadSettings } from '../llm/settings'
import { navigate } from '../router'
import { icons } from '../lib/icons'
import { t } from '../i18n'
import { toast } from '../lib/toast'
import { downloadStandalone } from '../export/standalone'
import { openPresenter, type PresenterHandle } from '../player/presenter'
import { startNarration, type NarratorHandle } from '../player/narrate'
import { deckBudget, fmtClock, formatElapsed } from '../player/rehearse'
import { dialogize } from '../lib/overlay'
import { decodeDeckFromHash } from '../lib/share'
import { deckIsChinese } from '../lib/lang'
import { openStylePicker } from './stylePicker'
import { openSharePanel } from './sharePanel'
import { openRewritePanel } from './rewritePanel'
import { openRefinePanel } from './refinePanel'
import { openGlobalEditPanel } from './globalEditPanel'
import { abstractBg, abstractBgWith } from '../images/abstract'
import { applyCustomTheme, customAbstractPalette, isLightCustom } from '../render/customTheme'
import { fitSlide } from '../render/fit'
import { escapeHtml } from '../lib/markdown'
import { renderSlideInner } from '../render/layouts'
import type { Deck, Slide, ThemeName } from '../types'

/**
 * Deck playback screen. `shareData` (route `#/s/<blob>`) plays a deck decoded
 * from the URL itself — nothing is persisted unless the viewer saves a copy.
 */
export function renderViewer(view: HTMLElement, id: string, shareData?: string): () => void {
  let player: PlayerHandle | null = null
  let loadedDeck: Deck | null = null
  let presenter: PresenterHandle | null = null
  let narrator: NarratorHandle | null = null
  let hideTimer = 0
  let timerInt = 0
  let rehInterval = 0
  const imgAbort = new AbortController()
  // Set by the cleanup: anything async that lands afterwards (deck load, wake
  // lock grant, a panel's LLM result) must not touch the torn-down view.
  let disposed = false
  // The speaker-script pass gets its own controller so a structural edit can
  // stop it (it indexes into the slide array by page number).
  let notesAbort: AbortController | null = null
  // Close handles of the overlay panels (rewrite / refine / whole-deck edit /
  // share): torn down with the view so their in-flight work is aborted.
  const panels = new Set<() => void>()
  let presTimer = 0
  // Ephemeral decks (built-in sample, URL-shared) must never write to the library.
  const persistable = id !== 'sample' && !shareData

  // Keep the screen awake while presenting — phones otherwise dim mid-slide.
  // Best-effort (API missing / permission denied → silently skipped). The lock
  // is auto-released whenever the tab is hidden, so re-acquire on return.
  let wakeLock: WakeLockSentinel | null = null
  const acquireWakeLock = (): void => {
    navigator.wakeLock
      ?.request('screen')
      .then((s) => {
        if (disposed) {
          s.release().catch(() => {}) // granted after we left — don't keep the screen awake on Home
          return
        }
        wakeLock = s
      })
      .catch(() => {})
  }
  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') acquireWakeLock()
  }
  acquireWakeLock()
  document.addEventListener('visibilitychange', onVisibility)

  view.innerHTML = `
    <div class="viewer">
      <div class="viewer__bar show">
        <button class="btn btn--sm" data-back>${icons.back} ${t('common.back')}</button>
        <div class="viewer__title" data-title></div>
        <button type="button" class="viewer__timer" data-timer title="${t('viewer.timerTitle')}"><span aria-hidden="true">${icons.clock}</span><b>00:00</b></button>
        <button class="btn btn--sm viewer__more" data-more title="${t('viewer.more')}" aria-label="${t('viewer.more')}">⋯</button>
        <div class="viewer__tools" data-tools>
          <button class="btn btn--primary btn--sm" data-save-shared hidden>${icons.save} ${t('share.saveCopy')}</button>
          <button class="btn btn--primary btn--sm" data-make-own hidden>${icons.sparkles} ${t('share.makeOwn')}</button>
          <button class="btn btn--sm" data-step title="${t('viewer.stepMode')}" aria-label="${t('viewer.stepMode')}">${icons.steps}</button>
          <button class="btn btn--sm" data-narrate title="${t('viewer.narrate')}" aria-label="${t('viewer.narrate')}">${icons.speaker}</button>
          <button class="btn btn--sm" data-rehearse title="${t('reh.button')}" aria-label="${t('reh.button')}">${icons.stopwatch}</button>
          <button class="btn btn--sm" data-notes title="${t('viewer.notes')}" aria-label="${t('viewer.notes')}">${icons.note}</button>
          <button class="btn btn--sm" data-notes-gen title="${t('viewer.genNotes')}" aria-label="${t('viewer.genNotes')}">${icons.mic}</button>
          <button class="btn btn--sm" data-presenter title="${t('viewer.presenter')}" aria-label="${t('viewer.presenter')}">${icons.presenter}</button>
          <button class="btn btn--sm" data-overview title="${t('viewer.overview')}" aria-label="${t('viewer.overview')}">${icons.grid}</button>
          <button class="btn btn--sm" data-rewrite title="${t('rw.button')}" aria-label="${t('rw.button')}" hidden>${icons.sparkles}</button>
          <button class="btn btn--sm" data-refine title="${t('refine.button')}" aria-label="${t('refine.button')}" hidden>${icons.wand}</button>
          <button class="btn btn--sm" data-gedit title="${t('ge.button')}" aria-label="${t('ge.button')}" hidden>${icons.deckMagic}</button>
          <button class="btn btn--sm" data-edit title="${t('viewer.editDeck')}" aria-label="${t('viewer.editDeck')}" hidden>${icons.edit} ${t('lib.action.edit')}</button>
          <button class="btn btn--sm" data-print title="${t('viewer.print')}" aria-label="${t('viewer.print')}">${icons.print}</button>
          <button class="btn btn--sm" data-export title="${t('viewer.exportHtml')}" aria-label="${t('viewer.exportHtml')}">${icons.download}</button>
          <button class="btn btn--sm" data-pptx title="${t('viewer.exportPptx')}" aria-label="${t('viewer.exportPptx')}">${icons.pptx}</button>
          <button class="btn btn--sm" data-style title="${t('style.button')}" aria-label="${t('style.button')}">${icons.palette}</button>
          <button class="btn btn--sm" data-share title="${t('share.button')}" aria-label="${t('share.button')}">${icons.share}</button>
          <button class="btn btn--sm" data-full title="${t('viewer.fullscreen')}" aria-label="${t('viewer.fullscreen')}">${icons.expand}</button>
          <button class="btn btn--sm" data-help title="${t('viewer.shortcuts')}" aria-label="${t('viewer.shortcuts')}">${icons.keyboard}</button>
        </div>
      </div>
      <div class="viewer__notes" data-notes-panel hidden></div>
      <div class="rehearse-hud" data-rehearse-hud hidden>
        <span class="rehearse-hud__page"><b data-reh-cur>0:00</b> / <span data-reh-budget>0:00</span></span>
        <span class="rehearse-hud__total" data-reh-total></span>
      </div>
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
  // Toggle buttons expose their state, not just a CSS class.
  const pressed = (btn: HTMLElement, on: boolean): void => {
    btn.classList.toggle('active', on)
    btn.setAttribute('aria-pressed', String(on))
  }
  const nudgeBar = () => {
    bar.classList.add('show')
    window.clearTimeout(hideTimer)
    hideTimer = window.setTimeout(() => bar.classList.remove('show'), 2600)
  }
  viewerEl.addEventListener('mousemove', nudgeBar)
  viewerEl.addEventListener('pointerdown', nudgeBar)
  // Tab landing on a bar button shows the bar (it used to stay invisible and
  // pointer-events:none with focus inside it).
  bar.addEventListener('focusin', nudgeBar)
  nudgeBar()

  // Narrow screens tuck the secondary tools behind a "⋯" menu; any tool click
  // closes it again.
  const toolsEl = view.querySelector<HTMLElement>('[data-tools]')!
  view.querySelector('[data-more]')!.addEventListener('click', (e) => {
    e.stopPropagation()
    toolsEl.classList.toggle('open')
  })
  toolsEl.addEventListener('click', () => toolsEl.classList.remove('open'))
  // Compact ("⋯") mode is decided by measuring, not by a width query: how many
  // tools a deck shows varies (owner vs recipient, AI buttons), so a fixed
  // breakpoint clipped share / export / help on landscape phones and 1024px
  // desktops. Measure with the tools inline, then tuck them away if the bar
  // overflows. Re-run on resize and whenever a tool is shown or hidden.
  const relayoutBar = (): void => {
    viewerEl.classList.remove('viewer--compact')
    const overflow = bar.scrollWidth > bar.clientWidth + 1
    viewerEl.classList.toggle('viewer--compact', overflow)
    if (!overflow) toolsEl.classList.remove('open')
  }
  relayoutBar()
  window.addEventListener('resize', relayoutBar)
  const toolsObserver = new MutationObserver(relayoutBar)
  toolsObserver.observe(toolsEl, { attributes: true, attributeFilter: ['hidden'], subtree: true })

  // Portrait phones show a "rotate to landscape" nudge (a 16:9 deck is tiny in
  // portrait). It's playable either way; dismissing hides it for the session
  // (sessionStorage — it used to come back on every deck opened).
  const ROTATE_KEY = 'ppt2html.rotateHintDismissed'
  try {
    if (sessionStorage.getItem(ROTATE_KEY) === '1') viewerEl.classList.add('rotate-dismissed')
  } catch {
    /* storage unavailable — the hint simply shows */
  }
  view.querySelector('[data-rotate-dismiss]')!.addEventListener('click', () => {
    viewerEl.classList.add('rotate-dismissed')
    try {
      sessionStorage.setItem(ROTATE_KEY, '1')
    } catch {
      /* best-effort */
    }
  })

  view.querySelector('[data-back]')!.addEventListener('click', goBack)
  view.querySelector('[data-overview]')!.addEventListener('click', () => player?.toggleOverview())
  view.querySelector('[data-print]')!.addEventListener('click', () => window.print())

  // Print prep: the player only overflow-fits a slide when it's shown, so pages
  // never visited would print "raw" — long titles clipped by the per-page
  // overflow:hidden. Fit every slide right before printing (covers both the
  // toolbar button and Ctrl+P — beforeprint fires for window.print() too).
  const fitAllForPrint = () => {
    // reveal.css ships "paper" print rules under `html:not(.print-pdf)` (auto
    // heights, 60px/20px padding, 24pt headings, every div forced to block) with
    // !important and a higher specificity than player.css — they used to shrink
    // and reflow every printed page. Flagging print-pdf switches that whole block
    // off so the player's own 1280×720 page layout applies; cleared afterprint.
    document.documentElement.classList.add('print-pdf')
    mount.querySelectorAll<HTMLElement>('.reveal .slides > section').forEach((sec) => {
      // reveal marks unvisited pages with the `hidden` ATTRIBUTE, and the
      // app's global [hidden]{display:none!important} beats the inline
      // display below — those pages measured 0×0 and fitSlide was a no-op.
      const prev = { display: sec.style.display, visibility: sec.style.visibility, hidden: sec.hasAttribute('hidden') }
      sec.removeAttribute('hidden')
      sec.style.display = 'block'
      sec.style.visibility = 'hidden'
      fitSlide(sec)
      sec.style.display = prev.display
      sec.style.visibility = prev.visibility
      if (prev.hidden) sec.setAttribute('hidden', '')
    })
  }
  const afterPrint = () => document.documentElement.classList.remove('print-pdf')
  window.addEventListener('beforeprint', fitAllForPrint)
  window.addEventListener('afterprint', afterPrint)

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
    else viewerEl.requestFullscreen?.()?.catch(() => {})
  })

  // Elapsed-time clock in the bar. Click to reset — handy when rehearsing.
  const timerEl = view.querySelector<HTMLElement>('[data-timer]')!
  const timerOut = timerEl.querySelector('b')!
  let startedAt = Date.now()
  const fmt = formatElapsed
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
    pressed(notesBtn, notesOn)
  })

  // Keyboard-shortcuts help overlay.
  const helpPanel = view.querySelector<HTMLElement>('[data-help-panel]')!
  let releaseHelp: (() => void) | null = null
  const toggleHelp = (show: boolean): void => {
    if (show === !helpPanel.hidden) return
    helpPanel.hidden = !show
    if (show) releaseHelp = dialogize(helpPanel, () => toggleHelp(false))
    else {
      releaseHelp?.()
      releaseHelp = null
    }
  }
  view.querySelector('[data-help]')!.addEventListener('click', () => toggleHelp(!!helpPanel.hidden))
  view.querySelector('[data-help-close]')!.addEventListener('click', () => toggleHelp(false))
  helpPanel.addEventListener('click', (e) => {
    if (e.target === helpPanel) toggleHelp(false)
  })

  const load = shareData
    ? decodeDeckFromHash(shareData)
    : id === 'sample'
      ? Promise.resolve(getSampleDeck())
      : getDeck(id)
  load
    .then((deck) => {
      // Left before the deck arrived: mounting now would create a Reveal on a
      // detached node that nothing destroys (its document keydown handler
      // then eats Arrow/Space app-wide).
      if (disposed) return
      if (!deck) {
        mount.innerHTML = `<div class="empty" style="color:#fff"><h3>${t('viewer.notFound')}</h3><p>${t('viewer.notFoundHint')}</p></div>`
        return
      }
      loadedDeck = deck
      titleEl.textContent = deck.title
      const editBtn = view.querySelector<HTMLButtonElement>('[data-edit]')!
      if (persistable) {
        editBtn.hidden = false
        editBtn.addEventListener('click', () => navigate(`#/edit/${id}`))
      }
      // A shared deck lives only in the URL — offer to keep a copy, and invite
      // the receiver to make their own (they're the likeliest next creator).
      if (shareData) {
        const keepBtn = view.querySelector<HTMLButtonElement>('[data-save-shared]')!
        keepBtn.hidden = false
        keepBtn.addEventListener('click', () => {
          const copy: Deck = { ...deck, id: crypto.randomUUID(), createdAt: Date.now(), updatedAt: Date.now() }
          void persistDeck(copy).then((ok) => {
            if (!ok) return
            toast(t('share.savedCopy'))
            navigate(`#/play/${copy.id}`)
          })
        })
        const makeBtn = view.querySelector<HTMLButtonElement>('[data-make-own]')!
        makeBtn.hidden = false
        makeBtn.addEventListener('click', () => navigate('#/'))
      }
      player = mountPlayer(mount, deck)
      // Slide-change callbacks go through this registry so a REMOUNT (needed
      // by structural whole-deck edits: dropped/reordered pages invalidate the
      // baked page numbers and reveal's section list) can re-register them on
      // the fresh player instead of silently losing position memory, the
      // rehearse HUD and the notes panel.
      const slideChangeCbs: Array<(num: number, total: number) => void> = []
      const onSlide = (cb: (num: number, total: number) => void): void => {
        slideChangeCbs.push(cb)
        player!.onSlideChange(cb)
      }
      const remountPlayer = (posOverride?: number): void => {
        // Never rebuild into a torn-down view (a ghost Reveal would keep
        // eating keys app-wide).
        if (disposed || !mount.isConnected) return
        const pos = Math.min(posOverride ?? curNum, deck.slides.length)
        // The narrator holds the OLD handle (and may be mid-utterance on a
        // page that no longer exists): stop it. The presenter is rebound below.
        if (narrator?.active()) {
          narrator.stop()
          narrateStopped(t('viewer.narrateOff'))
        }
        player?.destroy()
        player = mountPlayer(mount, deck)
        for (const cb of slideChangeCbs) player.onSlideChange(cb)
        if (pos > 1) {
          try {
            player.reveal.slide(pos - 1)
          } catch {
            /* best-effort */
          }
        }
        setNote(deck.slides[Math.min(pos, deck.slides.length) - 1]?.note)
        presenter?.refresh(player)
      }
      const stepBtn = view.querySelector<HTMLButtonElement>('[data-step]')!
      pressed(stepBtn, player.stepMode())
      stepBtn.addEventListener('click', () => {
        const on = !player!.stepMode()
        player!.setStepMode(on)
        pressed(stepBtn, on)
        toast(on ? t('viewer.stepOn') : t('viewer.stepOff'))
      })

      // Narrated auto-play: speech synthesis reads each page's script, then
      // advances — the deck plays itself. Click again to stop.
      const narrateBtn = view.querySelector<HTMLButtonElement>('[data-narrate]')!
      const narrateStopped = (msg: string): void => {
        narrator = null
        pressed(narrateBtn, false)
        toast(msg)
      }
      narrateBtn.addEventListener('click', () => {
        if (narrator?.active()) {
          narrator.stop()
          narrateStopped(t('viewer.narrateOff'))
          return
        }
        narrator = startNarration(deck, player!, {
          onEnd: () => narrateStopped(t('viewer.narrateEnd')),
        })
        if (!narrator) {
          toast(t('viewer.narrateNoTts'))
          return
        }
        pressed(narrateBtn, true)
        toast(t('viewer.narrateOn'))
      })

      // Rehearsal mode: per-page speaking budgets estimated from the script
      // (~4 CJK chars/sec, ~2.5 EN words/sec). The HUD turns amber at 80% of
      // the page budget and red past it; toggling off shows a per-page recap.
      const rehBtn = view.querySelector<HTMLButtonElement>('[data-rehearse]')!
      const rehHud = view.querySelector<HTMLElement>('[data-rehearse-hud]')!
      const rehCur = rehHud.querySelector<HTMLElement>('[data-reh-cur]')!
      const rehBudgetEl = rehHud.querySelector<HTMLElement>('[data-reh-budget]')!
      const rehTotalEl = rehHud.querySelector<HTMLElement>('[data-reh-total]')!
      let rehearsing = false
      let rehPages: number[] = []
      let rehTotal = 0
      let rehActual: number[] = []
      let rehPage = 1
      let rehStart = 0

      const rehSpentHere = () => (rehActual[rehPage - 1] ?? 0) + (Date.now() - rehStart) / 1000
      const rehPaint = () => {
        const spent = rehSpentHere()
        const budget = rehPages[rehPage - 1] ?? 8
        rehCur.textContent = fmtClock(spent)
        rehBudgetEl.textContent = fmtClock(budget)
        rehHud.classList.toggle('warn', spent >= budget * 0.8 && spent < budget)
        rehHud.classList.toggle('over', spent >= budget)
        const totalSpent = rehActual.reduce((a, b) => a + (b ?? 0), 0) + (Date.now() - rehStart) / 1000
        rehTotalEl.textContent = `${t('reh.total')} ${fmtClock(totalSpent)} / ${fmtClock(rehTotal)}`
      }
      const rehCommit = () => {
        rehActual[rehPage - 1] = rehSpentHere()
        rehStart = Date.now()
      }
      onSlide((num) => {
        if (!rehearsing || num === rehPage) return
        rehCommit()
        rehPage = num
        rehPaint()
      })

      const rehSummary = () => {
        const rows = rehActual
          .map((sec, i) => ({ i, sec: sec ?? 0, budget: rehPages[i] }))
          .filter((r) => r.sec >= 1)
        const totalSpent = rows.reduce((a, r) => a + r.sec, 0)
        const wrap = document.createElement('div')
        wrap.className = 'rehearse-summary'
        wrap.innerHTML = `
          <div class="rehearse-summary__card">
            <h3>${t('reh.summaryTitle')}</h3>
            <p class="rehearse-summary__total">${t('reh.summaryTotal', { a: fmtClock(totalSpent), b: fmtClock(rehTotal) })}</p>
            <div class="rehearse-summary__rows">
              ${rows
                .map((r) => {
                  const pct = Math.min(100, (r.sec / Math.max(1, r.budget)) * 100)
                  const over = r.sec > r.budget
                  const label = loadedDeck!.slides[r.i]?.title || `${r.i + 1}`
                  return `<div class="rehearse-summary__row${over ? ' over' : ''}">
                    <span class="rehearse-summary__name">${r.i + 1}. ${escapeHtml(label.replace(/\*\*/g, '').slice(0, 18))}</span>
                    <span class="rehearse-summary__time">${fmtClock(r.sec)} / ${fmtClock(r.budget)}${over ? ` · ${t('reh.over')}` : ''}</span>
                    <i style="width:${pct.toFixed(0)}%"></i>
                  </div>`
                })
                .join('')}
            </div>
            <button class="btn btn--sm" data-reh-close>${t('common.gotIt')}</button>
          </div>`
        viewerEl.appendChild(wrap)
        const dismiss = (): void => {
          wrap.remove()
          release()
        }
        const release = dialogize(wrap, dismiss)
        wrap.addEventListener('click', (e) => {
          if (e.target === wrap || (e.target as HTMLElement).closest('[data-reh-close]')) dismiss()
        })
      }

      rehBtn.addEventListener('click', () => {
        if (rehearsing) {
          rehCommit()
          rehearsing = false
          window.clearInterval(rehInterval)
          rehHud.hidden = true
          pressed(rehBtn, false)
          rehSummary()
          return
        }
        const budget = deckBudget(deck)
        rehPages = budget.pages
        rehTotal = budget.total
        rehActual = []
        rehPage = curNum
        rehStart = Date.now()
        rehearsing = true
        rehHud.hidden = false
        pressed(rehBtn, true)
        // Rehearsing means reading the script — surface it.
        if (!notesOn) notesBtn.click()
        rehPaint()
        rehInterval = window.setInterval(rehPaint, 500)
        toast(t('reh.on', { t: fmtClock(rehTotal) }))
      })

      // One-click restyle: swap the theme (built-in class OR a custom inline
      // palette) live and re-roll any abstract backgrounds to follow the new
      // colors. No regeneration.
      const setBaseTheme = (base: ThemeName): void => {
        player!.root.classList.remove(`theme-${deck.theme}`)
        player!.root.classList.add(`theme-${base}`)
        deck.theme = base
      }
      view.querySelector('[data-style]')!.addEventListener('click', () => {
        openStylePicker(viewerEl, { theme: deck.theme, custom: deck.customTheme }, (sel) => {
          const style = loadSettings().images.abstractStyle
          let label: string
          if (sel.kind === 'builtin') {
            deck.customTheme = undefined
            applyCustomTheme(player!.root, undefined)
            setBaseTheme(sel.theme)
            deck.slides.forEach((s, i) => {
              if (s.bg?.source !== 'abstract') return
              s.bg = abstractBg(`${deck.title}#${i}#${sel.theme}`, sel.theme, style)
              player!.setSlideBackground(i, s.bg)
            })
            label = t(`theme.${sel.theme}`)
          } else {
            const ct = sel.theme
            deck.customTheme = ct
            // Keep a neutral base class matching lightness so no named-theme
            // signature (noir caps, rose skew) bleeds through; inline vars win.
            setBaseTheme(isLightCustom(ct) ? 'ink' : 'aurora')
            applyCustomTheme(player!.root, ct)
            const pal = customAbstractPalette(ct)
            deck.slides.forEach((s, i) => {
              if (s.bg?.source !== 'abstract') return
              s.bg = abstractBgWith(`${deck.title}#${i}#${ct.bg}${ct.accent}`, pal, style)
              player!.setSlideBackground(i, s.bg)
            })
            label = t('style.mine')
          }
          if (persistable) void persistDeck(deck)
          presenter?.refresh()
          toast(t('style.applied', { name: label }))
        })
      })

      // Share: the deck packed into a copyable URL (+ QR when it fits one).
      view.querySelector('[data-share]')!.addEventListener('click', () => {
        panels.add(openSharePanel(viewerEl, deck))
      })
      // Remember the playback position per deck (session-scoped): a refresh or
      // an accidental back no longer dumps the presenter to slide 1. Only for
      // decks with an identity of their own: every share link used to share
      // the id 'shared', so opening a second link resumed the first one's page.
      const posKey = `ppt2html.pos.${id}`
      let posRestored = !persistable
      let curNum = 1
      onSlide((num) => {
        curNum = num
        if (!posRestored) {
          posRestored = true
          const saved = Number(sessionStorage.getItem(posKey))
          if (Number.isFinite(saved) && saved > 1 && saved <= deck.slides.length && num === 1) {
            player?.reveal.slide(saved - 1)
            return
          }
        }
        if (persistable) {
          try {
            sessionStorage.setItem(posKey, String(num))
          } catch {
            /* best-effort */
          }
        }
        setNote(deck.slides[num - 1]?.note)
        presenter?.update(num)
      })

      // In-player AI rewrite of the CURRENT page — the phone-sized editor.
      // The swap is in place (only the `.s` content block + notes aside), so
      // reveal keeps its section element and every registered callback,
      // background and decoration stays live.
      const applyRewrite = (i: number, next: Slide): void => {
        deck.slides[i] = next
        const sec = mount.querySelectorAll<HTMLElement>('.reveal .slides > section')[i]
        const sEl = sec?.querySelector('.s')
        if (sec && sEl) {
          sEl.outerHTML = renderSlideInner(next, { zh: deckIsChinese(deck) })
          sec.querySelector('aside.notes')?.remove()
          if (next.note) {
            const aside = document.createElement('aside')
            aside.className = 'notes'
            aside.textContent = next.note
            sec.appendChild(aside)
          }
          try {
            player?.reveal.sync() // re-register fragments for step mode
          } catch {
            /* reveal may be mid-teardown */
          }
          fitSlide(sec)
        }
        setNote(deck.slides[curNum - 1]?.note)
        presenter?.refresh() // the presenter's previews/notes are a snapshot otherwise
        if (persistable) void persistDeck(deck)
      }
      const rewriteBtn = view.querySelector<HTMLButtonElement>('[data-rewrite]')!
      const refineBtn = view.querySelector<HTMLButtonElement>('[data-refine]')!
      if (persistable) {
        rewriteBtn.hidden = false
        rewriteBtn.addEventListener('click', () => {
          panels.add(openRewritePanel(viewerEl, deck, curNum - 1, { apply: applyRewrite }))
        })
        // Whole-deck refine pass: mechanical checks pick the pages, the model
        // fixes only those — same in-place apply as the single-page rewrite.
        refineBtn.hidden = false
        refineBtn.addEventListener('click', () => {
          panels.add(openRefinePanel(viewerEl, deck, { apply: applyRewrite }))
        })
        // Whole-deck conversational edit: one instruction → visible per-page
        // plan → confirmed batch rewrite. In-place apply for rewrites; drops
        // and reorders replace the slide array and remount the player (baked
        // page numbers and reveal's section list must be rebuilt). Position is
        // restored by slide IDENTITY when the viewed slide survives the
        // recompose — inserts/drops shift page numbers, and coming back "on
        // page 8" showing a different slide reads as a jump. (Undo passes
        // clones, so identity misses there and the number fallback applies.)
        const applyStructure = (slides: Slide[]): void => {
          if (disposed) return
          // A running speaker-script pass indexes into the OLD array — stop it
          // rather than let a batch land on shifted (or vanished) pages.
          notesAbort?.abort()
          const idx = slides.indexOf(deck.slides[curNum - 1])
          deck.slides = slides
          if (persistable) void persistDeck(deck)
          remountPlayer(idx >= 0 ? idx + 1 : undefined)
        }
        const geditBtn = view.querySelector<HTMLButtonElement>('[data-gedit]')!
        geditBtn.hidden = false
        geditBtn.addEventListener('click', () => {
          panels.add(openGlobalEditPanel(viewerEl, deck, { apply: applyRewrite, applyStructure }))
        })
      }

      // Full speaker script (逐字稿): a post-pass over the finished deck, batch
      // by batch — each batch is saved as it lands, so failures keep progress.
      const genBtn = view.querySelector<HTMLButtonElement>('[data-notes-gen]')!
      // The script pass writes notes by page number, so the AI edit tools that
      // could reshape the deck stay disabled while it runs (and applyStructure
      // aborts it if a panel opened earlier still fires).
      const aiBtns = [rewriteBtn, refineBtn, view.querySelector<HTMLButtonElement>('[data-gedit]')!]
      genBtn.addEventListener('click', () => {
        if (!loadedDeck || genBtn.disabled) return
        // Same gate as every other AI entry point: an unconfigured user gets
        // "add a key in Settings", not a 401 dressed up as "invalid key".
        if (!isConfigured(loadSettings())) {
          toast(t('err.noKey'))
          navigate('#/settings')
          return
        }
        const hasLong = loadedDeck.slides.some((s) => (s.note ?? '').trim().length > 80)
        if (hasLong && !window.confirm(t('viewer.genNotesConfirm'))) return
        genBtn.disabled = true
        aiBtns.forEach((b) => (b.disabled = true))
        notesAbort?.abort()
        const run = new AbortController()
        notesAbort = run
        toast(t('viewer.genNotesStart'))
        const total = loadedDeck.slides.length
        genBtn.innerHTML = `${icons.mic} <b>0/${total}</b>`
        import('../llm/notes')
          .then(({ generateSpeakerNotes }) =>
            generateSpeakerNotes(loadedDeck!, loadSettings(), {
              signal: run.signal,
              onProgress: (done, n) => {
                genBtn.innerHTML = `${icons.mic} <b>${done}/${n}</b>`
                if (persistable) void persistDeck(loadedDeck!)
                setNote(loadedDeck!.slides[curNum - 1]?.note)
                presenter?.refresh()
              },
            }),
          )
          .then(({ missing }) => {
            // A reply that skipped pages is re-requested inside; whatever is
            // still missing is said out loud instead of a blanket "done".
            toast(missing.length ? t('viewer.genNotesPartial', { n: String(missing.length) }) : t('viewer.genNotesDone'))
            // Surface the result right away.
            if (!notesOn) notesBtn.click()
            setNote(loadedDeck!.slides[curNum - 1]?.note)
          })
          .catch((e) => {
            if ((e as DOMException)?.name === 'AbortError') return
            toast((e as Error)?.message || t('viewer.genNotesFailed'))
          })
          .finally(() => {
            if (notesAbort === run) notesAbort = null
            genBtn.disabled = false
            genBtn.innerHTML = icons.mic
            aiBtns.forEach((b) => (b.disabled = false))
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
          if (!persistable) return
          window.clearTimeout(saveTimer)
          saveTimer = window.setTimeout(() => void persistDeck(deck), 800)
        }
        const presenterRefreshSoon = (): void => {
          window.clearTimeout(presTimer)
          presTimer = window.setTimeout(() => presenter?.refresh(), 300)
        }
        void populateDeckImages(deck, settings, {
          signal: imgAbort.signal,
          onImage: (_index, bg, slide) => {
            // Resolve the LIVE index by identity: a structural edit or undo may
            // have moved, replaced or dropped this page since the search began.
            const j = deck.slides.indexOf(slide)
            if (j < 0) return
            player?.setSlideBackground(j, bg)
            scheduleSave()
            presenterRefreshSoon()
          },
          onTransient: (n) => {
            if (!disposed) toast(t('viewer.photosUnavailable', { n: String(n) }))
          },
        })
          .then(() => {
            if (!imgAbort.signal.aborted && persistable) void persistDeck(deck)
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
    disposed = true
    panels.forEach((fn) => fn()) // aborts in-flight rewrite/refine/global-edit/share work
    panels.clear()
    notesAbort?.abort()
    window.clearTimeout(presTimer)
    window.clearTimeout(hideTimer)
    window.clearInterval(timerInt)
    window.clearInterval(rehInterval)
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('resize', relayoutBar)
    toolsObserver.disconnect()
    window.removeEventListener('beforeprint', fitAllForPrint)
    window.removeEventListener('afterprint', afterPrint)
    afterPrint()
    document.removeEventListener('visibilitychange', onVisibility)
    wakeLock?.release().catch(() => {})
    imgAbort.abort()
    narrator?.stop()
    presenter?.close()
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    player?.destroy()
  }
}
