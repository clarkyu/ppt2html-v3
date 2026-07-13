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
import { startNarration, type NarratorHandle } from '../player/narrate'
import { deckBudget, fmtClock } from '../player/rehearse'
import { openStylePicker } from './stylePicker'
import { openSharePanel } from './sharePanel'
import { openRewritePanel } from './rewritePanel'
import { openRefinePanel } from './refinePanel'
import { openGlobalEditPanel } from './globalEditPanel'
import { abstractBg, abstractBgWith } from '../images/abstract'
import { applyCustomTheme, customAbstractPalette, isLightCustom } from '../render/customTheme'
import { fitSlide } from '../render/fit'
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
        <span class="viewer__timer" data-timer title="${t('viewer.timerTitle')}">${icons.clock}<b>00:00</b></span>
        <button class="btn btn--sm viewer__more" data-more title="${t('viewer.more')}">⋯</button>
        <div class="viewer__tools" data-tools>
          <button class="btn btn--sm" data-step title="${t('viewer.stepMode')}">${icons.steps}</button>
          <button class="btn btn--sm" data-narrate title="${t('viewer.narrate')}">${icons.speaker}</button>
          <button class="btn btn--sm" data-rehearse title="${t('reh.button')}">${icons.stopwatch}</button>
          <button class="btn btn--sm" data-notes title="${t('viewer.notes')}">${icons.note}</button>
          <button class="btn btn--sm" data-notes-gen title="${t('viewer.genNotes')}">${icons.mic}</button>
          <button class="btn btn--sm" data-presenter title="${t('viewer.presenter')}">${icons.presenter}</button>
          <button class="btn btn--sm" data-overview title="${t('viewer.overview')}">${icons.grid}</button>
          <button class="btn btn--sm" data-rewrite title="${t('rw.button')}" hidden>${icons.sparkles}</button>
          <button class="btn btn--sm" data-refine title="${t('refine.button')}" hidden>${icons.wand}</button>
          <button class="btn btn--sm" data-gedit title="${t('ge.button')}" hidden>${icons.deckMagic}</button>
          <button class="btn btn--sm" data-edit title="${t('viewer.editDeck')}" hidden>${icons.edit} ${t('lib.action.edit')}</button>
          <button class="btn btn--sm" data-print title="${t('viewer.print')}">${icons.print}</button>
          <button class="btn btn--sm" data-export title="${t('viewer.exportHtml')}">${icons.download}</button>
          <button class="btn btn--sm" data-pptx title="${t('viewer.exportPptx')}">${icons.pptx}</button>
          <button class="btn btn--sm" data-style title="${t('style.button')}">${icons.palette}</button>
          <button class="btn btn--sm" data-share title="${t('share.button')}">${icons.share}</button>
          <button class="btn btn--sm" data-full title="${t('viewer.fullscreen')}">${icons.expand}</button>
          <button class="btn btn--sm" data-help title="${t('viewer.shortcuts')}">${icons.keyboard}</button>
          <button class="btn btn--primary btn--sm" data-save-shared hidden>${icons.save} ${t('share.saveCopy')}</button>
          <button class="btn btn--primary btn--sm" data-make-own hidden>${icons.sparkles} ${t('share.makeOwn')}</button>
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

  const load = shareData
    ? import('../lib/share').then(({ decodeDeckFromHash }) => decodeDeckFromHash(shareData))
    : id === 'sample'
      ? Promise.resolve(getSampleDeck())
      : getDeck(id)
  load
    .then((deck) => {
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
          void saveDeck(copy).then(() => {
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
      const remountPlayer = (): void => {
        const pos = Math.min(curNum, deck.slides.length)
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
      }
      const stepBtn = view.querySelector<HTMLButtonElement>('[data-step]')!
      stepBtn.classList.toggle('active', player.stepMode())
      stepBtn.addEventListener('click', () => {
        const on = !player!.stepMode()
        player!.setStepMode(on)
        stepBtn.classList.toggle('active', on)
        toast(on ? t('viewer.stepOn') : t('viewer.stepOff'))
      })

      // Narrated auto-play: speech synthesis reads each page's script, then
      // advances — the deck plays itself. Click again to stop.
      const narrateBtn = view.querySelector<HTMLButtonElement>('[data-narrate]')!
      const narrateStopped = (msg: string): void => {
        narrator = null
        narrateBtn.classList.remove('active')
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
        narrateBtn.classList.add('active')
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
            <p class="rehearse-summary__total">${t('reh.summaryTotal')
              .replace('{a}', fmtClock(totalSpent))
              .replace('{b}', fmtClock(rehTotal))}</p>
            <div class="rehearse-summary__rows">
              ${rows
                .map((r) => {
                  const pct = Math.min(100, (r.sec / Math.max(1, r.budget)) * 100)
                  const over = r.sec > r.budget
                  const label = loadedDeck!.slides[r.i]?.title || `${r.i + 1}`
                  return `<div class="rehearse-summary__row${over ? ' over' : ''}">
                    <span class="rehearse-summary__name">${r.i + 1}. ${label.replace(/\*\*/g, '').slice(0, 18)}</span>
                    <span class="rehearse-summary__time">${fmtClock(r.sec)} / ${fmtClock(r.budget)}${over ? ` · ${t('reh.over')}` : ''}</span>
                    <i style="width:${pct.toFixed(0)}%"></i>
                  </div>`
                })
                .join('')}
            </div>
            <button class="btn btn--sm" data-reh-close>${t('common.gotIt')}</button>
          </div>`
        viewerEl.appendChild(wrap)
        wrap.addEventListener('click', (e) => {
          if (e.target === wrap || (e.target as HTMLElement).closest('[data-reh-close]')) wrap.remove()
        })
      }

      rehBtn.addEventListener('click', () => {
        if (rehearsing) {
          rehCommit()
          rehearsing = false
          window.clearInterval(rehInterval)
          rehHud.hidden = true
          rehBtn.classList.remove('active')
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
        rehBtn.classList.add('active')
        // Rehearsing means reading the script — surface it.
        if (!notesOn) notesBtn.click()
        rehPaint()
        rehInterval = window.setInterval(rehPaint, 500)
        toast(t('reh.on').replace('{t}', fmtClock(rehTotal)))
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
          if (persistable) void saveDeck(deck)
          toast(t('style.applied').replace('{name}', label))
        })
      })

      // Share: the deck packed into a copyable URL (+ QR when it fits one).
      view.querySelector('[data-share]')!.addEventListener('click', () => {
        openSharePanel(viewerEl, deck)
      })
      // Remember the playback position per deck (session-scoped): a refresh or
      // an accidental back no longer dumps the presenter to slide 1.
      const posKey = `ppt2html.pos.${id}`
      let posRestored = false
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
        try {
          sessionStorage.setItem(posKey, String(num))
        } catch {
          /* best-effort */
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
          sEl.outerHTML = renderSlideInner(next)
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
        presenter?.update(curNum)
        if (persistable) void saveDeck(deck)
      }
      const rewriteBtn = view.querySelector<HTMLButtonElement>('[data-rewrite]')!
      const refineBtn = view.querySelector<HTMLButtonElement>('[data-refine]')!
      if (persistable) {
        rewriteBtn.hidden = false
        rewriteBtn.addEventListener('click', () => {
          openRewritePanel(viewerEl, deck, curNum - 1, { apply: applyRewrite })
        })
        // Whole-deck refine pass: mechanical checks pick the pages, the model
        // fixes only those — same in-place apply as the single-page rewrite.
        refineBtn.hidden = false
        refineBtn.addEventListener('click', () => {
          openRefinePanel(viewerEl, deck, { apply: applyRewrite })
        })
        // Whole-deck conversational edit: one instruction → visible per-page
        // plan → confirmed batch rewrite. In-place apply for rewrites; drops
        // and reorders replace the slide array and remount the player (baked
        // page numbers and reveal's section list must be rebuilt).
        const applyStructure = (slides: Slide[]): void => {
          deck.slides = slides
          if (persistable) void saveDeck(deck)
          remountPlayer()
        }
        const geditBtn = view.querySelector<HTMLButtonElement>('[data-gedit]')!
        geditBtn.hidden = false
        geditBtn.addEventListener('click', () => {
          openGlobalEditPanel(viewerEl, deck, { apply: applyRewrite, applyStructure })
        })
      }

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
                if (persistable) void saveDeck(loadedDeck!)
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
          if (!persistable) return
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
            if (!imgAbort.signal.aborted && persistable) void saveDeck(deck)
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
    window.clearInterval(rehInterval)
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('beforeprint', fitAllForPrint)
    document.removeEventListener('visibilitychange', onVisibility)
    wakeLock?.release().catch(() => {})
    imgAbort.abort()
    narrator?.stop()
    presenter?.close()
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    player?.destroy()
  }
}
