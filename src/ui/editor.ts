import { getDeck, saveDeck } from '../store/db'
import { getSampleDeck } from '../sample'
import { mountSlidePreview } from '../render/preview'
import { regenerateSlide } from '../llm/edit'
import { searchImageCandidates, confirmCandidate, queryForSlide, type ImageCandidate } from '../images/search'
import { abstractBg, resolveAbstractStyle } from '../images/abstract'
import { loadSettings, isConfigured } from '../llm/settings'
import { navigate } from '../router'
import { toast } from '../lib/toast'
import { icons } from '../lib/icons'
import { escapeHtml } from '../lib/markdown'
import { t } from '../i18n'
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

const LAYOUT_KEYS: Record<SlideLayout, string> = {
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

  view.innerHTML = `
    <div class="section-head">
      <h2>${t('ed.title')}</h2>
      <a href="#/library">${t('ed.backToLibrary')}</a>
    </div>
    <div data-root><div class="empty"><p>${t('common.loading')}</p></div></div>`
  const root = view.querySelector<HTMLElement>('[data-root]')!

  const isSample = id === 'sample'
  const load = isSample ? Promise.resolve(getSampleDeck()) : getDeck(id)
  load
    .then((loaded) => {
      if (!loaded) {
        root.innerHTML = `<div class="empty"><h3>${t('viewer.notFound')}</h3><p>${t('viewer.notFoundHint')}</p></div>`
        return
      }
      // Editing the built-in sample creates a fresh copy in the library.
      const deck: Deck = isSample
        ? { ...structuredClone(loaded), id: crypto.randomUUID(), createdAt: Date.now(), updatedAt: Date.now() }
        : structuredClone(loaded)
      mountEditor(root, deck, cleanups)
    })
    .catch(() => {
      root.innerHTML = `<div class="empty"><h3>${t('viewer.loadError')}</h3></div>`
    })

  return () => cleanups.forEach((fn) => fn())
}

/* ------------------------------ mount ------------------------------ */

function mountEditor(root: HTMLElement, deck: Deck, cleanups: Array<() => void>): void {
  const previewCleanups = new Map<HTMLElement, () => void>()
  cleanups.push(() => previewCleanups.forEach((fn) => fn()))

  const render = () => {
    // Tear down old preview observers before replacing the DOM.
    previewCleanups.forEach((fn) => fn())
    previewCleanups.clear()

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
            <label class="btn btn--ghost btn--sm" style="flex:none">${t('settings.upload')}<input type="file" accept="image/*" data-brand-logo-file hidden></label>
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

    root.querySelectorAll<HTMLElement>('[data-card]').forEach((card) => mountPreview(card))
  }

  const mountPreview = (card: HTMLElement) => {
    const i = Number(card.dataset.i)
    const box = card.querySelector<HTMLElement>('[data-preview]')
    if (!box || !deck.slides[i]) return
    previewCleanups.get(box)?.()
    const cleanup = mountSlidePreview(box, deck.theme, deck.slides[i])
    previewCleanups.set(box, cleanup)
  }

  const refreshPreview = (card: HTMLElement) => mountPreview(card)

  // Candidate picker: the six thumbnails for "change background" — pick one
  // instead of blind-swapping to whatever came first.
  const showBgPicker = (card: HTMLElement, i: number, candidates: ImageCandidate[]) => {
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
      deck.slides[i].bg = confirmCandidate(chosen, loadSettings())
      deck.slides[i].bgOff = undefined
      card.outerHTML = renderCard(deck.slides[i], i, deck.slides.length)
      mountPreview(root.querySelector<HTMLElement>(`[data-card][data-i="${i}"]`)!)
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

  // Unsaved edits shouldn't be droppable by an accidental close/back.
  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (dirty) {
      e.preventDefault()
      e.returnValue = ''
    }
  }
  window.addEventListener('beforeunload', onBeforeUnload)
  cleanups.push(() => window.removeEventListener('beforeunload', onBeforeUnload))
  const backLink = root.parentElement?.querySelector<HTMLAnchorElement>('a[href="#/library"]')
  backLink?.addEventListener('click', (e) => {
    if (dirty && !confirm(t('ed.leaveConfirm'))) e.preventDefault()
  })

  // One-level undo for the last AI rewrite.
  let lastRewrite: { i: number; slide: Slide } | null = null

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
    if (card && target.closest('[data-field]')) {
      const i = Number(card.dataset.i)
      deck.slides[i] = collectSlide(card, deck.slides[i].layout, deck.slides[i])
      refreshPreview(card)
      setStatus(t('ed.unsaved'))
    }
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
      deck.theme = (target as HTMLSelectElement).value as ThemeName
      render() // re-render all previews with the new theme
      setStatus(t('ed.unsaved'))
      return
    }
    if (target.matches('[data-layout]')) {
      const card = target.closest<HTMLElement>('[data-card]')!
      const i = Number(card.dataset.i)
      const layout = (target as HTMLSelectElement).value as SlideLayout
      deck.slides[i] = { ...collectSlide(card, deck.slides[i].layout, deck.slides[i]), layout }
      // Re-render just this card so its fields match the new layout.
      card.outerHTML = renderCard(deck.slides[i], i, deck.slides.length)
      mountPreview(root.querySelector<HTMLElement>(`[data-card][data-i="${i}"]`)!)
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
      saveDeck(deck).then(() => {
        setStatus(t('ed.saved'))
        toast(t('ed.saved'))
      })
      return
    }
    if (btn.dataset.play !== undefined) {
      deck.updatedAt = Date.now()
      saveDeck(deck).then(() => navigate(`#/play/${deck.id}`))
      return
    }
    if (btn.dataset.addSlide !== undefined) {
      deck.slides.push({ layout: 'bullets', title: t('ed.newSlide'), bullets: [t('ed.newBullet')] })
      render()
      setStatus(t('ed.unsaved'))
      return
    }
    if (!card) return
    const i = Number(card.dataset.i)

    if (btn.dataset.regenSlide !== undefined) {
      const settings = loadSettings()
      if (!isConfigured(settings)) {
        toast(t('err.noKey'))
        navigate('#/settings')
        return
      }
      const instruction = card.querySelector<HTMLInputElement>('[data-instruct]')?.value.trim() ?? ''
      if (!instruction) {
        toast(t('ed.writeInstruction'))
        return
      }
      // Persist current edits on this card before regenerating.
      deck.slides[i] = collectSlide(card, deck.slides[i].layout, deck.slides[i])
      const before = structuredClone(deck.slides[i])
      btn.setAttribute('disabled', '')
      btn.textContent = t('ed.rewriting')
      regenerateSlide(deck, i, instruction, settings)
        .then((slide) => {
          deck.slides[i] = slide
          lastRewrite = { i, slide: before }
          card.outerHTML = renderCard(slide, i, deck.slides.length)
          const fresh = root.querySelector<HTMLElement>(`[data-card][data-i="${i}"]`)!
          mountPreview(fresh)
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
          toast(t('ed.rewriteFailed') + (err instanceof Error ? err.message : String(err)))
          btn.removeAttribute('disabled')
          btn.textContent = t('ed.aiRewrite')
        })
      return
    }

    if (btn.dataset.undoRewrite !== undefined) {
      if (lastRewrite && lastRewrite.i === i) {
        deck.slides[i] = lastRewrite.slide
        lastRewrite = null
        card.outerHTML = renderCard(deck.slides[i], i, deck.slides.length)
        mountPreview(root.querySelector<HTMLElement>(`[data-card][data-i="${i}"]`)!)
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
      card.outerHTML = renderCard(slide, i, deck.slides.length)
      mountPreview(root.querySelector<HTMLElement>(`[data-card][data-i="${i}"]`)!)
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
        deck.slides[i].bg = abstractBg(seed, deck.theme, style)
        deck.slides[i].bgOff = undefined
        card.outerHTML = renderCard(deck.slides[i], i, deck.slides.length)
        mountPreview(root.querySelector<HTMLElement>(`[data-card][data-i="${i}"]`)!)
        setStatus(t('ed.unsaved'))
        toast(t('ed.bgChanged'))
        return
      }

      const used = new Set<string>()
      for (const s of deck.slides) if (s.bg?.url && s !== deck.slides[i]) used.add(s.bg.url)
      btn.setAttribute('disabled', '')
      searchImageCandidates(queryForSlide(deck.slides[i], deck), settings, { exclude: used })
        .then((candidates) => {
          btn.removeAttribute('disabled')
          if (!candidates.length) {
            toast(t('ed.noImage'))
            return
          }
          showBgPicker(card, i, candidates.slice(0, 6))
        })
        .catch(() => {
          toast(t('ed.bgFailed'))
          btn.removeAttribute('disabled')
        })
      return
    }

    if (btn.dataset.up !== undefined && i > 0) {
      ;[deck.slides[i - 1], deck.slides[i]] = [deck.slides[i], deck.slides[i - 1]]
      render()
      setStatus(t('ed.unsaved'))
    } else if (btn.dataset.down !== undefined && i < deck.slides.length - 1) {
      ;[deck.slides[i + 1], deck.slides[i]] = [deck.slides[i], deck.slides[i + 1]]
      render()
      setStatus(t('ed.unsaved'))
    } else if (btn.dataset.del !== undefined) {
      if (deck.slides.length <= 1) {
        toast(t('outline.keepOnePage'))
        return
      }
      deck.slides.splice(i, 1)
      render()
      setStatus(t('ed.unsaved'))
    } else if (btn.dataset.addItem !== undefined) {
      const slide = collectSlide(card, deck.slides[i].layout, deck.slides[i])
      ;(slide.items ??= []).push({ heading: t('ed.newCard'), points: [''] })
      deck.slides[i] = slide
      card.outerHTML = renderCard(slide, i, deck.slides.length)
      mountPreview(root.querySelector<HTMLElement>(`[data-card][data-i="${i}"]`)!)
      setStatus(t('ed.unsaved'))
    } else if (btn.dataset.addStep !== undefined) {
      const slide = collectSlide(card, deck.slides[i].layout, deck.slides[i])
      ;(slide.steps ??= []).push({ label: t('ed.newStep'), text: '' })
      deck.slides[i] = slide
      card.outerHTML = renderCard(slide, i, deck.slides.length)
      mountPreview(root.querySelector<HTMLElement>(`[data-card][data-i="${i}"]`)!)
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
          <button class="icon-btn" data-up title="${escapeHtml(t('common.moveUp'))}"${i === 0 ? ' disabled' : ''}>${icons.up}</button>
          <button class="icon-btn" data-down title="${escapeHtml(t('common.moveDown'))}"${i === total - 1 ? ' disabled' : ''}>${icons.down}</button>
          <button class="icon-btn" data-del title="${escapeHtml(t('lib.action.delete'))}">${icons.trash}</button>
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
      return text('title', t('ed.f.pageTitle'), s.title) + area('body', t('ed.f.body'), s.body, 5)
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
        <button class="icon-btn" data-del-sub title="${escapeHtml(t('lib.action.delete'))}">${icons.trash}</button>
      </div>
      <textarea class="form-input" data-f="points" rows="3" placeholder="${escapeHtml(t('ed.f.pointsPerLine'))}">${escapeHtml((item.points ?? []).join('\n'))}</textarea>
    </div>`
}

function renderStep(step: { label: string; text?: string }): string {
  return `
    <div class="f-sub" data-step>
      <div class="f-sub__head">
        <input class="form-input" data-f="label" value="${escapeHtml(step.label ?? '')}" placeholder="${escapeHtml(t('ed.f.stepLabel'))}">
        <button class="icon-btn" data-del-sub title="${escapeHtml(t('lib.action.delete'))}">${icons.trash}</button>
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
  // Carry over fields that have no form input, so edits don't drop them.
  const s: Slide = { layout, bg: prev?.bg, bgOff: prev?.bgOff, imageQuery: prev?.imageQuery }

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
      break
    case 'code':
      s.title = und('title')
      s.language = und('language')
      s.code = raw('code') // preserve whitespace / newlines
      break
    case 'two-col':
      s.title = und('title')
      s.left = { heading: und('left.heading'), bullets: list('left.bullets') }
      s.right = { heading: und('right.heading'), bullets: list('right.bullets') }
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
