import { getDeck } from '../store/db'
import { persistDeck } from '../lib/persist'
import { getSampleDeck } from '../sample'
import { mountSlidePreview } from '../render/preview'
import { regenerateSlide } from '../llm/edit'
import { searchImageCandidates, confirmCandidate, queryForSlide, type ImageCandidate } from '../images/search'
import { genImageConfigured, generateSlideImage } from '../images/genai'
import { abstractBgForDeck, resolveAbstractStyle } from '../images/abstract'
import { loadSettings, isConfigured } from '../llm/settings'
import { navigate, setLeaveGuard, setLangHandler } from '../router'
import { applyCustomTheme } from '../render/customTheme'
import { toast } from '../lib/toast'
import { icons } from '../lib/icons'
import { escapeHtml } from '../lib/markdown'
import { t } from '../i18n'
import { deckIsChinese, deckText } from '../lib/lang'
import {
  LAYOUTS,
  THEMES,
  type Branding,
  type CompareItem,
  type Deck,
  type Slide,
  type SlideLayout,
  type ThemeName,
} from '../types'

export const LAYOUT_KEYS: Record<SlideLayout, string> = {
  cover: 'layout.cover',
  section: 'layout.section',
  bullets: 'layout.bullets',
  'two-col': 'layout.twoCol',
  'big-number': 'layout.bigNumber',
  stats: 'layout.stats',
  quote: 'layout.quote',
  comparison: 'layout.comparison',
  timeline: 'layout.timeline',
  code: 'layout.code',
  'image-text': 'layout.imageText',
  end: 'layout.end',
}
const themeLabel = (name: ThemeName): string => t(`theme.${name}`)

/** Deck content editor: every page shown with a live preview and editable fields. */
export function renderDeckEditor(view: HTMLElement, id: string): () => void {
  const cleanups: Array<() => void> = []
  let disposed = false

  view.innerHTML = `<div class="section-head"></div><div data-root><div class="empty"><p>${t('common.loading')}</p></div></div>`
  const renderHead = (): void => {
    view.querySelector('.section-head')!.innerHTML = `<h2>${t('ed.title')}</h2><a href="#/library">${t('ed.backToLibrary')}</a>`
  }
  renderHead()
  const root = view.querySelector<HTMLElement>('[data-root]')!

  const isSample = id === 'sample'
  const load = isSample ? Promise.resolve(getSampleDeck()) : getDeck(id)
  load
    .then((loaded) => {
      // Navigated away before the deck arrived: mounting now would register
      // listeners/observers into a cleanup list nobody will run again.
      if (disposed) return
      if (!loaded) {
        root.innerHTML = `<div class="empty"><h3>${t('viewer.notFound')}</h3><p>${t('viewer.notFoundHint')}</p></div>`
        return
      }
      // Editing the built-in sample creates a fresh copy in the library.
      const deck: Deck = isSample
        ? { ...structuredClone(loaded), id: crypto.randomUUID(), createdAt: Date.now(), updatedAt: Date.now() }
        : structuredClone(loaded)
      mountEditor(root, deck, cleanups, renderHead)
    })
    .catch(() => {
      if (!disposed) root.innerHTML = `<div class="empty"><h3>${t('viewer.loadError')}</h3></div>`
    })

  return () => {
    disposed = true
    cleanups.forEach((fn) => fn())
  }
}

/* ------------------------------ mount ------------------------------ */

function mountEditor(root: HTMLElement, deck: Deck, cleanups: Array<() => void>, renderHead: () => void): void {
  const previewCleanups = new Map<HTMLElement, () => void>()
  cleanups.push(() => previewCleanups.forEach((fn) => fn()))
  // In-flight AI/image requests die with the screen — a result landing on a
  // deck the user already left used to mutate a detached copy.
  const aborter = new AbortController()
  cleanups.push(() => aborter.abort())
  const signal = aborter.signal
  const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError'

  // Previews mount lazily as their card scrolls near the viewport: a 40-page
  // deck with multi-MB data-URL backgrounds took seconds to serialize every
  // preview at once, on every structural edit.
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue
        io.unobserve(en.target)
        mountPreview(en.target as HTMLElement)
      }
    },
    { rootMargin: '600px 0px' },
  )
  cleanups.push(() => io.disconnect())
  const watch = (card: HTMLElement): void => io.observe(card)

  const render = () => {
    // Tear down old preview observers before replacing the DOM.
    previewCleanups.forEach((fn) => fn())
    previewCleanups.clear()
    io.disconnect()

    root.innerHTML = `
      <div class="ed-meta card">
        <label class="f"><span>${t('struct.deckTitle')}</span><input class="form-input" data-meta="title" value="${escapeHtml(deck.title)}"></label>
        <label class="f"><span>${t('ed.subtitle')}</span><input class="form-input" data-meta="subtitle" value="${escapeHtml(deck.subtitle ?? '')}"></label>
        <label class="f"><span>${t('ed.theme')}</span>
          <select class="form-input" data-meta="theme">
            ${THEMES.map((th) => `<option value="${th}"${th === deck.theme ? ' selected' : ''}>${themeLabel(th)}</option>`).join('')}
          </select>
        </label>
        <label class="f"><span>${t('settings.presenter')}</span><input class="form-input" data-meta="brand.presenter" value="${escapeHtml(deck.branding?.presenter ?? '')}" placeholder="${escapeHtml(t('ed.name'))}"></label>
        <label class="f"><span>${t('ed.org')}</span><input class="form-input" data-meta="brand.org" value="${escapeHtml(deck.branding?.org ?? '')}" placeholder="${escapeHtml(t('settings.org'))}"></label>
        <label class="f"><span>${t('ed.date')}</span><input class="form-input" data-meta="brand.date" value="${escapeHtml(deck.branding?.date ?? '')}" placeholder="${escapeHtml(t('ed.datePlaceholder'))}"></label>
        <label class="f"><span>Logo</span>
          <span style="display:flex; gap:8px">
            <input class="form-input" data-meta="brand.logo" value="${escapeHtml(deck.branding?.logo ?? '')}" placeholder="${escapeHtml(t('ed.logoPlaceholder'))}" style="flex:1; min-width:0">
            <button type="button" class="btn btn--ghost btn--sm" style="flex:none" data-brand-logo-btn>${t('settings.upload')}</button>
            <input type="file" accept="image/*" data-brand-logo-file hidden>
          </span>
        </label>
      </div>
      <div class="ed-list" data-list>
        ${deck.slides.map((s, i) => renderCard(s, i, deck.slides.length)).join('')}
      </div>
      <button class="btn btn--ghost btn--sm ed-add" data-add-slide>${icons.plus} ${t('ed.addSlide')}</button>
      <div class="ed-actions">
        <span class="ed-status" data-status></span>
        <button class="btn btn--ghost" data-play>${icons.play} ${t('ed.play')}</button>
        <button class="btn btn--primary" data-save>${icons.save} ${t('common.save')}</button>
      </div>`

    root.querySelectorAll<HTMLElement>('[data-card]').forEach(watch)
  }

  const mountPreview = (card: HTMLElement) => {
    const i = Number(card.dataset.i)
    const box = card.querySelector<HTMLElement>('[data-preview]')
    if (!box || !deck.slides[i]) return
    previewCleanups.get(box)?.()
    const cleanup = mountSlidePreview(box, deck.theme, deck.slides[i], deck.customTheme)
    previewCleanups.set(box, cleanup)
  }

  const refreshPreview = (card: HTMLElement) => mountPreview(card)

  const cardAt = (i: number): HTMLElement | null => root.querySelector<HTMLElement>(`[data-card][data-i="${i}"]`)
  /** Re-render ONE card in place (fields changed, layout changed, bg changed). */
  const replaceCard = (card: HTMLElement, i: number): HTMLElement => {
    const box = card.querySelector<HTMLElement>('[data-preview]')
    if (box) {
      previewCleanups.get(box)?.()
      previewCleanups.delete(box)
    }
    io.unobserve(card)
    card.outerHTML = renderCard(deck.slides[i], i, deck.slides.length)
    const fresh = cardAt(i)!
    mountPreview(fresh)
    return fresh
  }
  /** After a move/delete/add: page numbers, data-i and the arrow states follow
   * the DOM order — no card is rebuilt, so previews keep their observers. */
  const renumber = (): void => {
    const cards = root.querySelectorAll<HTMLElement>('[data-card]')
    cards.forEach((c, k) => {
      c.dataset.i = String(k)
      const n = c.querySelector<HTMLElement>('.slide-card__n')
      if (n) n.textContent = String(k + 1)
      const up = c.querySelector<HTMLButtonElement>('[data-up]')
      const down = c.querySelector<HTMLButtonElement>('[data-down]')
      if (up) up.disabled = k === 0
      if (down) down.disabled = k === cards.length - 1
    })
  }
  /** Where a slide captured before an await lives NOW (-1 if it was deleted). */
  const indexOf = (slide: Slide): number => deck.slides.indexOf(slide)

  // Candidate picker: the six thumbnails for "change background" — pick one
  // instead of blind-swapping to whatever came first. The slide is tracked by
  // identity: the user may have reordered/deleted pages while the search ran.
  const showBgPicker = (card: HTMLElement, target: Slide, candidates: ImageCandidate[]) => {
    card.querySelector('.ed-pick')?.remove()
    const pick = document.createElement('div')
    pick.className = 'ed-pick'
    pick.innerHTML =
      `<span class="ed-pick__label">${t('ed.pickBg')}</span>` +
      candidates
        .map((c, k) => `<button type="button" class="ed-pick__thumb" data-pick="${k}" title="${escapeHtml(c.credit ?? '')}"><img src="${escapeHtml(c.url)}" alt="" loading="lazy"></button>`)
        .join('') +
      `<button type="button" class="btn btn--ghost btn--sm" data-pick-cancel>${t('common.cancel')}</button>`
    card.querySelector('.ed-bg')?.after(pick)
    pick.addEventListener('click', (e) => {
      const cancel = (e.target as HTMLElement).closest('[data-pick-cancel]')
      if (cancel) {
        pick.remove()
        return
      }
      const th = (e.target as HTMLElement).closest<HTMLElement>('[data-pick]')
      if (!th) return
      const chosen = candidates[Number(th.dataset.pick)]
      if (!chosen) return
      const j = indexOf(target)
      if (j < 0) {
        pick.remove()
        toast(t('ed.pageGone'))
        return
      }
      target.bg = confirmCandidate(chosen, loadSettings())
      target.bgOff = undefined
      replaceCard(cardAt(j) ?? card, j)
      setStatus(t('ed.unsaved'))
      toast(t('ed.bgChanged'))
    })
  }

  let dirty = false
  const setStatus = (text: string) => {
    dirty = text === t('ed.unsaved')
    const el = root.querySelector<HTMLElement>('[data-status]')
    if (el) el.textContent = text
  }

  // Unsaved edits shouldn't be droppable by an accidental close/back: the
  // router asks the guard before any hash navigation (app-bar links, browser
  // back, navigate()), beforeunload covers closing the tab, and a language
  // switch re-renders from the in-memory deck instead of remounting.
  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (dirty) {
      e.preventDefault()
      e.returnValue = ''
    }
  }
  window.addEventListener('beforeunload', onBeforeUnload)
  cleanups.push(() => window.removeEventListener('beforeunload', onBeforeUnload))
  setLeaveGuard(() => !dirty || confirm(t('ed.leaveConfirm')))
  setLangHandler(() => {
    renderHead()
    render()
    if (dirty) setStatus(t('ed.unsaved'))
  })
  cleanups.push(() => {
    setLeaveGuard(null)
    setLangHandler(null)
  })

  // One-level undo for the last AI rewrite, keyed by slide identity (indices
  // shift under reorders/deletes).
  let lastRewrite: { slide: Slide; before: Slide } | null = null

  render()

  // ---- field edits (live) ----
  root.addEventListener('input', (e) => {
    const target = e.target as HTMLElement
    const meta = target.closest<HTMLElement>('[data-meta]')
    if (meta) {
      const key = meta.dataset.meta ?? ''
      const value = (meta as HTMLInputElement).value
      if (key === 'title') deck.title = value
      else if (key === 'subtitle') deck.subtitle = value.trim() || undefined
      else if (key.startsWith('brand.')) {
        deck.branding = { ...deck.branding, [key.slice(6) as keyof Branding]: value.trim() || undefined }
      } else return // theme is a <select>, handled in the change listener
      setStatus(t('ed.unsaved'))
      return
    }
    const card = target.closest<HTMLElement>('[data-card]')
    if (card && target.matches('[data-img-query]')) {
      const i = Number(card.dataset.i)
      deck.slides[i].imageQuery = (target as HTMLInputElement).value.trim() || undefined
      setStatus(t('ed.unsaved'))
      return
    }
    // [data-f] = the comparison-card / timeline-step sub-fields, which used to
    // be ignored here (edits silently lost on Save).
    if (card && target.closest('[data-field],[data-f]')) {
      const i = Number(card.dataset.i)
      deck.slides[i] = collectSlide(card, deck.slides[i].layout, deck.slides[i])
      refreshPreview(card)
      setStatus(t('ed.unsaved'))
    }
  })

  // A <label> wrapping a hidden file input is mouse-only; the button is
  // reachable by keyboard and opens the same picker.
  root.querySelector('[data-brand-logo-btn]')?.addEventListener('click', () => {
    root.querySelector<HTMLInputElement>('[data-brand-logo-file]')?.click()
  })

  // ---- selects (theme / layout) ----
  root.addEventListener('change', (e) => {
    const target = e.target as HTMLElement
    if (target.matches('[data-brand-logo-file]')) {
      const inp = target as HTMLInputElement
      const file = inp.files?.[0]
      if (!file) return
      if (file.size > 900_000) {
        toast(t('settings.logoTooBig'))
        inp.value = ''
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        deck.branding = { ...deck.branding, logo: String(reader.result) }
        const urlInput = root.querySelector<HTMLInputElement>('[data-meta="brand.logo"]')
        if (urlInput) urlInput.value = deck.branding.logo ?? ''
        setStatus(t('ed.unsaved'))
      }
      reader.readAsDataURL(file)
      inp.value = ''
      return
    }
    if (target.matches('[data-meta="theme"]')) {
      const prevTheme = deck.theme
      deck.theme = (target as HTMLSelectElement).value as ThemeName
      // Picking a built-in theme here drops any custom "我的风格" palette.
      deck.customTheme = undefined
      // Retheme the mounted previews in place (class swap + cleared custom
      // vars); unmounted ones pick up deck.theme when they scroll in.
      root.querySelectorAll<HTMLElement>('[data-preview] .player').forEach((p) => {
        p.classList.remove(`theme-${prevTheme}`)
        p.classList.add(`theme-${deck.theme}`)
        applyCustomTheme(p, undefined)
      })
      setStatus(t('ed.unsaved'))
      return
    }
    if (target.matches('[data-f="tone"]')) {
      const card = target.closest<HTMLElement>('[data-card]')!
      const i = Number(card.dataset.i)
      deck.slides[i] = collectSlide(card, deck.slides[i].layout, deck.slides[i])
      refreshPreview(card)
      setStatus(t('ed.unsaved'))
      return
    }
    if (target.matches('[data-layout]')) {
      const card = target.closest<HTMLElement>('[data-card]')!
      const i = Number(card.dataset.i)
      const layout = (target as HTMLSelectElement).value as SlideLayout
      deck.slides[i] = { ...collectSlide(card, deck.slides[i].layout, deck.slides[i]), layout }
      // Re-render just this card so its fields match the new layout.
      replaceCard(card, i)
      setStatus(t('ed.unsaved'))
    }
  })

  // ---- clicks (ops) ----
  root.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('button')
    if (!btn) return
    const card = btn.closest<HTMLElement>('[data-card]')

    if (btn.dataset.save !== undefined) {
      deck.updatedAt = Date.now()
      // On failure persistDeck has toasted and the status stays "unsaved".
      void persistDeck(deck).then((ok) => {
        if (!ok) return
        setStatus(t('ed.saved'))
        toast(t('ed.saved'))
      })
      return
    }
    if (btn.dataset.play !== undefined) {
      deck.updatedAt = Date.now()
      void persistDeck(deck).then((ok) => {
        if (!ok) return
        setStatus(t('ed.saved')) // clean → the leave guard lets the navigation through
        navigate(`#/play/${deck.id}`)
      })
      return
    }
    if (btn.dataset.addSlide !== undefined) {
      deck.slides.push({ layout: 'bullets', title: deckText(deckIsChinese(deck), 'newSlide'), bullets: [deckText(deckIsChinese(deck), 'newBullet')] })
      const list = root.querySelector<HTMLElement>('[data-list]')!
      const n = deck.slides.length - 1
      list.insertAdjacentHTML('beforeend', renderCard(deck.slides[n], n, deck.slides.length))
      const fresh = cardAt(n)!
      mountPreview(fresh)
      renumber()
      fresh.scrollIntoView({ block: 'nearest' })
      setStatus(t('ed.unsaved'))
      return
    }
    if (!card) return
    const i = Number(card.dataset.i)

    if (btn.dataset.regenSlide !== undefined) {
      const settings = loadSettings()
      if (!isConfigured(settings)) {
        toast(t('err.noKey')) // stay put — navigating away would discard the edits
        return
      }
      const instruction = card.querySelector<HTMLInputElement>('[data-instruct]')?.value.trim() ?? ''
      if (!instruction) {
        toast(t('ed.writeInstruction'))
        return
      }
      // Persist current edits on this card before regenerating, then track the
      // slide by IDENTITY: pages may be reordered or deleted while we wait, and
      // writing back by the captured index used to overwrite the wrong page.
      deck.slides[i] = collectSlide(card, deck.slides[i].layout, deck.slides[i])
      const target = deck.slides[i]
      const before = structuredClone(target)
      btn.setAttribute('disabled', '')
      btn.textContent = t('ed.rewriting')
      regenerateSlide(deck, i, instruction, settings, signal)
        .then((slide) => {
          const j = indexOf(target)
          if (j < 0) {
            toast(t('ed.pageGone'))
            return
          }
          deck.slides[j] = slide
          lastRewrite = { slide, before }
          const fresh = replaceCard(cardAt(j)!, j)
          fresh
            .querySelector('[data-regen-slide]')
            ?.insertAdjacentHTML(
              'afterend',
              `<button class="btn btn--ghost btn--sm" data-undo-rewrite>${t('ed.undoRewrite')}</button>`,
            )
          setStatus(t('ed.unsaved'))
          toast(t('ed.rewritten'))
        })
        .catch((err: unknown) => {
          if (isAbort(err)) return
          toast(t('ed.rewriteFailed') + (err instanceof Error ? err.message : String(err)))
          const j = indexOf(target)
          const live = j >= 0 ? cardAt(j)?.querySelector<HTMLButtonElement>('[data-regen-slide]') : null
          if (live) {
            live.removeAttribute('disabled')
            live.textContent = t('ed.aiRewrite')
          }
        })
      return
    }

    if (btn.dataset.undoRewrite !== undefined) {
      if (lastRewrite && deck.slides[i] === lastRewrite.slide) {
        deck.slides[i] = lastRewrite.before
        lastRewrite = null
        replaceCard(card, i)
        setStatus(t('ed.unsaved'))
        toast(t('ed.rewriteUndone'))
      }
      return
    }

    if (btn.dataset.bgRemove !== undefined) {
      const slide = collectSlide(card, deck.slides[i].layout, deck.slides[i])
      slide.bg = undefined
      // Mark the removal as deliberate, or the player's lazy image fill would
      // just search a new background for this "empty" slide on next playback.
      slide.bgOff = true
      deck.slides[i] = slide
      replaceCard(card, i)
      setStatus(t('ed.unsaved'))
      return
    }

    if (btn.dataset.bgRefresh !== undefined) {
      const settings = loadSettings()
      if (!settings.images.enabled) {
        toast(t('ed.bgDisabled'))
        return
      }
      deck.slides[i] = collectSlide(card, deck.slides[i].layout, deck.slides[i])
      const editedQuery = card.querySelector<HTMLInputElement>('[data-img-query]')?.value.trim()
      deck.slides[i].imageQuery = editedQuery || undefined

      // Abstract mode: re-roll a themed pattern locally (same family the player
      // uses) — a photo search here would clash with the user's chosen style.
      if (settings.images.mode === 'abstract') {
        const style = resolveAbstractStyle(settings.images.abstractStyle, deck.id || deck.title || deck.theme)
        const seed = `${queryForSlide(deck.slides[i], deck)}#${i}#${Date.now()}`
        deck.slides[i].bg = abstractBgForDeck(seed, deck, style)
        deck.slides[i].bgOff = undefined
        replaceCard(card, i)
        setStatus(t('ed.unsaved'))
        toast(t('ed.bgChanged'))
        return
      }

      const target = deck.slides[i]
      const used = new Set<string>()
      for (const s of deck.slides) if (s.bg?.url && s !== target) used.add(s.bg.url)
      btn.setAttribute('disabled', '')
      searchImageCandidates(queryForSlide(target, deck), settings, { exclude: used, signal })
        .then((candidates) => {
          btn.removeAttribute('disabled')
          if (!candidates.length) {
            toast(t('ed.noImage'))
            return
          }
          const j = indexOf(target)
          if (j < 0) {
            toast(t('ed.pageGone'))
            return
          }
          showBgPicker(cardAt(j) ?? card, target, candidates.slice(0, 6))
        })
        .catch((err: unknown) => {
          if (isAbort(err)) return
          toast(t('ed.bgFailed'))
          btn.removeAttribute('disabled')
        })
      return
    }

    // Generative illustration (BYOK): one image for this page, stored as a
    // data URL so replays and exports never re-bill the API.
    if (btn.dataset.bgGen !== undefined) {
      const settings = loadSettings()
      if (!genImageConfigured(settings)) {
        toast(t('ed.genImgNoKey'))
        return
      }
      deck.slides[i] = collectSlide(card, deck.slides[i].layout, deck.slides[i])
      const editedQuery = card.querySelector<HTMLInputElement>('[data-img-query]')?.value.trim()
      deck.slides[i].imageQuery = editedQuery || undefined
      const target = deck.slides[i]
      btn.setAttribute('disabled', '')
      toast(t('ed.genImgStart'))
      generateSlideImage(target, deck, settings, signal)
        .then((bg) => {
          const j = indexOf(target)
          if (j < 0) {
            toast(t('ed.pageGone'))
            return
          }
          target.bg = bg
          target.bgOff = undefined
          const cur = cardAt(j)
          if (cur) replaceCard(cur, j)
          setStatus(t('ed.unsaved'))
          toast(t('ed.genImgDone'))
        })
        .catch((e: unknown) => {
          if (isAbort(e)) return
          toast((e as Error)?.message || t('ed.genImgFailed'))
          const j = indexOf(target)
          if (j >= 0) cardAt(j)?.querySelector('[data-bg-gen]')?.removeAttribute('disabled')
        })
      return
    }

    // Structural edits move/remove DOM nodes and renumber — never rebuild every
    // card (and re-serialize every multi-MB background) for one click.
    if (btn.dataset.up !== undefined && i > 0) {
      ;[deck.slides[i - 1], deck.slides[i]] = [deck.slides[i], deck.slides[i - 1]]
      const prev = card.previousElementSibling
      if (prev) card.parentElement!.insertBefore(card, prev)
      renumber()
      setStatus(t('ed.unsaved'))
    } else if (btn.dataset.down !== undefined && i < deck.slides.length - 1) {
      ;[deck.slides[i + 1], deck.slides[i]] = [deck.slides[i], deck.slides[i + 1]]
      const next = card.nextElementSibling
      if (next) card.parentElement!.insertBefore(next, card)
      renumber()
      setStatus(t('ed.unsaved'))
    } else if (btn.dataset.del !== undefined) {
      if (deck.slides.length <= 1) {
        toast(t('outline.keepOnePage'))
        return
      }
      deck.slides.splice(i, 1)
      const box = card.querySelector<HTMLElement>('[data-preview]')
      if (box) {
        previewCleanups.get(box)?.()
        previewCleanups.delete(box)
      }
      io.unobserve(card)
      card.remove()
      renumber()
      setStatus(t('ed.unsaved'))
    } else if (btn.dataset.addItem !== undefined) {
      const slide = collectSlide(card, deck.slides[i].layout, deck.slides[i])
      ;(slide.items ??= []).push({ heading: deckText(deckIsChinese(deck), 'newCard'), points: [''] })
      deck.slides[i] = slide
      replaceCard(card, i)
      setStatus(t('ed.unsaved'))
    } else if (btn.dataset.addStep !== undefined) {
      const slide = collectSlide(card, deck.slides[i].layout, deck.slides[i])
      ;(slide.steps ??= []).push({ label: deckText(deckIsChinese(deck), 'newStep'), text: '' })
      deck.slides[i] = slide
      replaceCard(card, i)
      setStatus(t('ed.unsaved'))
    } else if (btn.dataset.delSub !== undefined) {
      const sub = btn.closest<HTMLElement>('[data-item],[data-step]')
      sub?.remove()
      deck.slides[i] = collectSlide(card, deck.slides[i].layout, deck.slides[i])
      refreshPreview(card)
      setStatus(t('ed.unsaved'))
    }
  })
}

/* ------------------------------ card + fields ------------------------------ */

function layoutOptions(selected: SlideLayout): string {
  return LAYOUTS.map(
    (l) => `<option value="${l}"${l === selected ? ' selected' : ''}>${t(LAYOUT_KEYS[l])}</option>`,
  ).join('')
}

function renderCard(s: Slide, i: number, total: number): string {
  return `
    <div class="slide-card card" data-card data-i="${i}">
      <div class="slide-card__bar">
        <span class="slide-card__n">${i + 1}</span>
        <select class="select slide-card__layout" data-layout>${layoutOptions(s.layout)}</select>
        <div class="slide-card__ops">
          <button class="icon-btn" data-up title="${escapeHtml(t('common.moveUp'))}" aria-label="${escapeHtml(t('common.moveUp'))}"${i === 0 ? ' disabled' : ''}>${icons.up}</button>
          <button class="icon-btn" data-down title="${escapeHtml(t('common.moveDown'))}" aria-label="${escapeHtml(t('common.moveDown'))}"${i === total - 1 ? ' disabled' : ''}>${icons.down}</button>
          <button class="icon-btn" data-del title="${escapeHtml(t('lib.action.delete'))}" aria-label="${escapeHtml(t('lib.action.delete'))}">${icons.trash}</button>
        </div>
      </div>
      <div class="slide-card__body">
        <div class="thumb slide-card__preview" data-preview></div>
        <div class="slide-card__fields">${renderFields(s)}</div>
      </div>
      <div class="ed-bg">
        <span class="ed-bg__label">${s.bg ? t('ed.bgOn') : t('ed.bgOff')}</span>
        <input class="input ed-bg__query" data-img-query value="${escapeHtml(s.imageQuery ?? '')}" placeholder="${escapeHtml(t('ed.imgQuery'))}">
        <button class="btn btn--ghost btn--sm" data-bg-refresh>${icons.refresh} ${t('ed.bgRefresh')}</button>
        <button class="btn btn--ghost btn--sm" data-bg-gen title="${escapeHtml(t('ed.genImgTitle'))}">${icons.sparkles} ${t('ed.genImg')}</button>
        ${s.bg ? `<button class="btn btn--ghost btn--sm" data-bg-remove>${t('ed.bgRemove')}</button>` : ''}
      </div>
      <div class="adjust">
        <input class="input adjust__input" data-instruct placeholder="${escapeHtml(t('ed.instructPlaceholder'))}">
        <button class="btn btn--ghost btn--sm" data-regen-slide>${icons.sparkles} ${t('ed.aiRewrite')}</button>
      </div>
    </div>`
}

function text(field: string, label: string, value?: string): string {
  return `<label class="f"><span>${label}</span><input class="form-input" data-field="${field}" value="${escapeHtml(value ?? '')}"></label>`
}
function area(field: string, label: string, value?: string, rows = 3, mono = false): string {
  return `<label class="f"><span>${label}</span><textarea class="form-input${mono ? ' mono' : ''}" data-field="${field}" rows="${rows}">${escapeHtml(value ?? '')}</textarea></label>`
}
function lines(field: string, label: string, arr?: string[]): string {
  return area(field, label, (arr ?? []).join('\n'), Math.min(6, Math.max(2, (arr?.length ?? 2) + 1)))
}

// Every layout gets the speaker-note textarea: full AI-written scripts land on
// all pages (cover/section/end included), and hand-tweaking them is expected.
function renderFields(s: Slide): string {
  return coreFields(s) + area('note', t('ed.f.note'), s.note, 2)
}

function coreFields(s: Slide): string {
  switch (s.layout) {
    case 'cover':
    case 'section':
      return text('eyebrow', t('ed.f.eyebrow'), s.eyebrow) + text('title', t('ed.f.title'), s.title) + text('subtitle', t('ed.subtitle'), s.subtitle)
    case 'end':
      return text('title', t('ed.f.closing'), s.title) + text('subtitle', t('ed.f.closingSub'), s.subtitle)
    case 'bullets':
      return text('title', t('ed.f.pageTitle'), s.title) + lines('bullets', t('ed.f.bullets'), s.bullets)
    case 'big-number':
      return text('value', t('ed.f.value'), s.value) + text('caption', t('ed.f.caption'), s.caption) + text('title', t('ed.f.pageTitleOpt'), s.title)
    case 'stats':
      return (
        text('title', t('ed.f.pageTitle'), s.title) +
        lines('stats', t('ed.f.stats'), (s.stats ?? []).map((x) => `${x.value}|${x.label}`))
      )
    case 'quote':
      return area('text', t('ed.f.quote'), s.text, 3) + text('author', t('ed.f.author'), s.author)
    case 'image-text':
      // The renderer shows `body` when present, else `bullets` (the outline
      // path pads pages that way) — expose both so neither is lost on Save.
      return text('title', t('ed.f.pageTitle'), s.title) + area('body', t('ed.f.body'), s.body, 5) + lines('bullets', t('ed.f.imgBullets'), s.bullets)
    case 'code':
      return text('title', t('ed.f.pageTitle'), s.title) + text('language', t('ed.f.language'), s.language) + area('code', t('ed.f.code'), s.code, 6, true)
    case 'two-col':
      return (
        text('title', t('ed.f.pageTitle'), s.title) +
        `<div class="f-cols">` +
        `<div class="f-col">${text('left.heading', t('ed.f.leftHeading'), s.left?.heading)}${lines('left.bullets', t('ed.f.leftBullets'), s.left?.bullets)}</div>` +
        `<div class="f-col">${text('right.heading', t('ed.f.rightHeading'), s.right?.heading)}${lines('right.bullets', t('ed.f.rightBullets'), s.right?.bullets)}</div>` +
        `</div>`
      )
    case 'comparison':
      return (
        text('title', t('ed.f.pageTitle'), s.title) +
        (s.items ?? []).map(renderCompareItem).join('') +
        `<button class="btn btn--ghost btn--sm" data-add-item>${icons.plus} ${t('ed.addCard')}</button>`
      )
    case 'timeline':
      return (
        text('title', t('ed.f.pageTitle'), s.title) +
        (s.steps ?? []).map(renderStep).join('') +
        `<button class="btn btn--ghost btn--sm" data-add-step>${icons.plus} ${t('ed.addStep')}</button>`
      )
    default:
      return text('title', t('ed.f.title'), s.title)
  }
}

function renderCompareItem(item: CompareItem): string {
  const tones: Array<[string, string]> = [
    ['neutral', t('ed.tone.neutral')],
    ['positive', t('ed.tone.positive')],
    ['negative', t('ed.tone.negative')],
  ]
  return `
    <div class="f-sub" data-item>
      <div class="f-sub__head">
        <input class="form-input" data-f="heading" value="${escapeHtml(item.heading ?? '')}" placeholder="${escapeHtml(t('ed.f.cardTitle'))}">
        <select class="select" data-f="tone">${tones
          .map(([v, l]) => `<option value="${v}"${(item.tone ?? 'neutral') === v ? ' selected' : ''}>${l}</option>`)
          .join('')}</select>
        <button class="icon-btn" data-del-sub title="${escapeHtml(t('lib.action.delete'))}" aria-label="${escapeHtml(t('lib.action.delete'))}">${icons.trash}</button>
      </div>
      <textarea class="form-input" data-f="points" rows="3" placeholder="${escapeHtml(t('ed.f.pointsPerLine'))}">${escapeHtml((item.points ?? []).join('\n'))}</textarea>
    </div>`
}

function renderStep(step: { label: string; text?: string }): string {
  return `
    <div class="f-sub" data-step>
      <div class="f-sub__head">
        <input class="form-input" data-f="label" value="${escapeHtml(step.label ?? '')}" placeholder="${escapeHtml(t('ed.f.stepLabel'))}">
        <button class="icon-btn" data-del-sub title="${escapeHtml(t('lib.action.delete'))}" aria-label="${escapeHtml(t('lib.action.delete'))}">${icons.trash}</button>
      </div>
      <input class="form-input" data-f="text" value="${escapeHtml(step.text ?? '')}" placeholder="${escapeHtml(t('ed.f.stepText'))}">
    </div>`
}

/* ------------------------------ collect ------------------------------ */

function collectSlide(card: HTMLElement, layout: SlideLayout, prev?: Slide): Slide {
  const raw = (f: string): string => card.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-field="${f}"]`)?.value ?? ''
  const v = (f: string): string => raw(f).trim()
  const und = (f: string): string | undefined => v(f) || undefined
  const list = (f: string): string[] => raw(f).split('\n').map((x) => x.trim()).filter(Boolean)
  // CARRY-OVER by default: start from everything the slide already has and let
  // the form controls of THIS layout overwrite their fields. Anything without a
  // control (eyebrow on content pages, two-col column body, per-layout extras)
  // survives a keystroke — listing carried fields by hand kept missing some.
  const s: Slide = { ...prev, layout }

  switch (layout) {
    case 'cover':
    case 'section':
      s.eyebrow = und('eyebrow')
      s.title = und('title')
      s.subtitle = und('subtitle')
      break
    case 'end':
      s.title = und('title')
      s.subtitle = und('subtitle')
      break
    case 'bullets':
      s.title = und('title')
      s.bullets = list('bullets')
      // Icons are model-assigned; keep them while the bullet count is unchanged.
      s.bulletIcons =
        prev?.bulletIcons && prev.bulletIcons.length === s.bullets.length ? prev.bulletIcons : undefined
      break
    case 'big-number':
      s.value = und('value')
      s.caption = und('caption')
      s.title = und('title')
      break
    case 'stats':
      s.title = und('title')
      s.stats = list('stats')
        .map((line) => {
          const [value, ...rest] = line.split('|')
          return { value: value.trim(), label: rest.join('|').trim() }
        })
        .filter((x) => x.value)
        .slice(0, 4)
      break
    case 'quote':
      s.text = und('text')
      s.author = und('author')
      break
    case 'image-text':
      s.title = und('title')
      s.body = und('body')
      s.bullets = list('bullets')
      s.bulletIcons =
        prev?.bulletIcons && prev.bulletIcons.length === s.bullets.length ? prev.bulletIcons : undefined
      break
    case 'code':
      s.title = und('title')
      s.language = und('language')
      s.code = raw('code') // preserve whitespace / newlines
      break
    case 'two-col':
      s.title = und('title')
      // Column.body has no control yet — keep it (layouts.ts renders it).
      s.left = { ...prev?.left, heading: und('left.heading'), bullets: list('left.bullets') }
      s.right = { ...prev?.right, heading: und('right.heading'), bullets: list('right.bullets') }
      break
    case 'comparison':
      s.title = und('title')
      s.items = Array.from(card.querySelectorAll<HTMLElement>('[data-item]')).map((it) => ({
        heading: (it.querySelector<HTMLInputElement>('[data-f="heading"]')?.value ?? '').trim(),
        tone: (it.querySelector<HTMLSelectElement>('[data-f="tone"]')?.value ?? 'neutral') as CompareItem['tone'],
        points: (it.querySelector<HTMLTextAreaElement>('[data-f="points"]')?.value ?? '')
          .split('\n')
          .map((x) => x.trim())
          .filter(Boolean),
      }))
      break
    case 'timeline':
      s.title = und('title')
      s.steps = Array.from(card.querySelectorAll<HTMLElement>('[data-step]')).map((st) => ({
        label: (st.querySelector<HTMLInputElement>('[data-f="label"]')?.value ?? '').trim(),
        text: (st.querySelector<HTMLInputElement>('[data-f="text"]')?.value ?? '').trim() || undefined,
      }))
      break
  }
  // The note textarea exists on every layout (see renderFields).
  s.note = und('note')
  return s
}
