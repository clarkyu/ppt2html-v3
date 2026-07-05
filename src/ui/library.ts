import { icons } from '../lib/icons'
import { navigate } from '../router'
import { listDecks, deleteDeck, duplicateDeck, getDeck, saveDeck } from '../store/db'
import { mountThumb } from '../render/preview'
import { formatDate } from '../lib/dom'
import { escapeHtml } from '../lib/markdown'
import { toast } from '../lib/toast'
import { t } from '../i18n'
import { buildBackup, backupFilename, downloadText, parseBackupFile, restoreDecks } from '../lib/backup'
import type { Deck } from '../types'

type SortKey = 'updated' | 'created' | 'title'

const SORTS: Array<{ value: SortKey; key: string }> = [
  { value: 'updated', key: 'lib.sort.updated' },
  { value: 'created', key: 'lib.sort.created' },
  { value: 'title', key: 'lib.sort.title' },
]

function sortDecks(decks: Deck[], key: SortKey): Deck[] {
  const out = decks.slice()
  if (key === 'title') out.sort((a, b) => a.title.localeCompare(b.title, 'zh'))
  else if (key === 'created') out.sort((a, b) => b.createdAt - a.createdAt)
  else out.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
  return out
}

export function renderLibrary(view: HTMLElement): () => void {
  const thumbCleanups: Array<() => void> = []
  let all: Deck[] = []
  let query = ''
  let sort: SortKey = 'updated'

  view.innerHTML = `
    <div class="section-head library-head">
      <h2>${t('nav.library')}</h2>
      <div class="library-right">
        <div class="library-tools" data-tools hidden>
          <div class="search"><span class="search__icon">${icons.search}</span>
            <input class="search__input" data-search placeholder="${escapeHtml(t('lib.searchPlaceholder'))}" />
          </div>
          <select class="form-input library-sort" data-sort>
            ${SORTS.map((s) => `<option value="${s.value}">${escapeHtml(t(s.key))}</option>`).join('')}
          </select>
        </div>
        <div class="library-io">
          <button class="btn btn--ghost btn--sm" data-backup title="${escapeHtml(t('lib.backupHint'))}">${icons.download} ${t('lib.backup')}</button>
          <button class="btn btn--ghost btn--sm" data-restore title="${escapeHtml(t('lib.restoreHint'))}">${icons.upload} ${t('lib.restore')}</button>
          <input type="file" accept="application/json,.json" hidden data-restore-file>
        </div>
      </div>
    </div>
    <div data-body>${t('common.loading')}</div>`

  const body = view.querySelector<HTMLElement>('[data-body]')!
  const tools = view.querySelector<HTMLElement>('[data-tools]')!
  const searchEl = view.querySelector<HTMLInputElement>('[data-search]')!
  const sortEl = view.querySelector<HTMLSelectElement>('[data-sort]')!
  const restoreFileEl = view.querySelector<HTMLInputElement>('[data-restore-file]')!

  view.querySelector('[data-backup]')!.addEventListener('click', async () => {
    if (!all.length) {
      toast(t('lib.backupEmpty'))
      return
    }
    const backup = await buildBackup(Date.now())
    downloadText(backupFilename(Date.now()), JSON.stringify(backup, null, 2))
    toast(t('lib.backupDone').replace('{n}', String(backup.decks.length)))
  })
  view.querySelector('[data-restore]')!.addEventListener('click', () => restoreFileEl.click())
  restoreFileEl.addEventListener('change', async () => {
    const file = restoreFileEl.files?.[0]
    restoreFileEl.value = ''
    if (!file) return
    try {
      const decks = await parseBackupFile(file)
      const n = await restoreDecks(decks)
      toast(t('lib.restoreDone').replace('{n}', String(n)))
      await reload()
    } catch {
      toast(t('lib.restoreFailed'))
    }
  })

  const drawCards = (decks: Deck[]) => {
    thumbCleanups.splice(0).forEach((fn) => fn())

    if (!decks.length) {
      // Distinguish "no decks at all" from "none match the search".
      if (all.length && query) {
        body.innerHTML = `<div class="empty"><h3>${t('lib.noMatch')}</h3><p>${t('lib.noMatchHint')}</p></div>`
        return
      }
      body.innerHTML = `
        <div class="empty">
          ${icons.empty}
          <h3>${t('lib.emptyTitle')}</h3>
          <p>${t('lib.emptyHint')}</p>
          <button class="btn btn--primary" data-new>${icons.sparkles} ${t('lib.emptyCta')}</button>
        </div>`
      body.querySelector('[data-new]')!.addEventListener('click', () => navigate('#/'))
      return
    }

    body.innerHTML = `<div class="deck-grid" data-grid></div>`
    const grid = body.querySelector<HTMLElement>('[data-grid]')!

    for (const deck of decks) {
      const card = document.createElement('div')
      card.className = 'deck-card'
      card.innerHTML = `
        <div class="thumb"></div>
        <div class="deck-card__body">
          <div class="deck-card__title">${escapeHtml(deck.title)}</div>
          <div class="deck-card__meta">
            <span>${deck.slides.length} ${t('unit.pages')} · ${formatDate(deck.createdAt)}</span>
            <div class="deck-card__actions">
              <button class="icon-btn" data-edit title="${t('lib.action.edit')}">${icons.edit}</button>
              <button class="icon-btn" data-rename title="${t('lib.action.rename')}">${icons.rename}</button>
              <button class="icon-btn" data-copy title="${t('lib.action.copy')}">${icons.copy}</button>
              <button class="icon-btn" data-del title="${t('lib.action.delete')}">${icons.trash}</button>
            </div>
          </div>
        </div>`

      card.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.deck-card__actions')) return
        navigate(`#/play/${deck.id}`)
      })
      card.querySelector('[data-edit]')!.addEventListener('click', (e) => {
        e.stopPropagation()
        navigate(`#/edit/${deck.id}`)
      })
      card.querySelector('[data-rename]')!.addEventListener('click', async (e) => {
        e.stopPropagation()
        const name = prompt(t('lib.renamePrompt'), deck.title)?.trim()
        if (!name || name === deck.title) return
        const fresh = await getDeck(deck.id)
        if (!fresh) return
        fresh.title = name
        fresh.updatedAt = Date.now()
        await saveDeck(fresh)
        toast(t('lib.renamed'))
        await reload()
      })
      card.querySelector('[data-copy]')!.addEventListener('click', async (e) => {
        e.stopPropagation()
        const copy = await duplicateDeck(deck.id)
        toast(copy ? t('lib.copied') : t('lib.copyFailed'))
        await reload()
      })
      card.querySelector('[data-del]')!.addEventListener('click', async (e) => {
        e.stopPropagation()
        if (!confirm(t('lib.deleteConfirm').replace('{title}', deck.title))) return
        await deleteDeck(deck.id)
        toast(t('lib.deleted'))
        await reload()
      })

      grid.appendChild(card)
      thumbCleanups.push(mountThumb(card.querySelector<HTMLElement>('.thumb')!, deck))
    }
  }

  const render = () => {
    tools.hidden = all.length === 0
    const q = query.trim().toLowerCase()
    const filtered = q ? all.filter((d) => d.title.toLowerCase().includes(q)) : all
    drawCards(sortDecks(filtered, sort))
  }

  const reload = async () => {
    all = await listDecks()
    render()
  }

  searchEl.addEventListener('input', () => {
    query = searchEl.value
    render()
  })
  sortEl.addEventListener('change', () => {
    sort = sortEl.value as SortKey
    render()
  })

  reload().catch(() => {
    body.innerHTML = `<div class="empty"><h3>${t('lib.readError')}</h3><p>${t('lib.readErrorHint')}</p></div>`
  })

  return () => thumbCleanups.forEach((fn) => fn())
}
