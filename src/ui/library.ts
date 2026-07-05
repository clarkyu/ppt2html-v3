import { icons } from '../lib/icons'
import { navigate } from '../router'
import { listDecks, deleteDeck, duplicateDeck, getDeck, saveDeck } from '../store/db'
import { mountThumb } from '../render/preview'
import { formatDate } from '../lib/dom'
import { escapeHtml } from '../lib/markdown'
import { toast } from '../lib/toast'
import type { Deck } from '../types'

type SortKey = 'updated' | 'created' | 'title'

const SORTS: Array<{ value: SortKey; label: string }> = [
  { value: 'updated', label: '最近修改' },
  { value: 'created', label: '最近创建' },
  { value: 'title', label: '名称' },
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
      <h2>我的课件</h2>
      <div class="library-tools" data-tools hidden>
        <div class="search"><span class="search__icon">${icons.search}</span>
          <input class="search__input" data-search placeholder="搜索课件标题…" />
        </div>
        <select class="form-input library-sort" data-sort>
          ${SORTS.map((s) => `<option value="${s.value}">${s.label}</option>`).join('')}
        </select>
      </div>
    </div>
    <div data-body>加载中…</div>`

  const body = view.querySelector<HTMLElement>('[data-body]')!
  const tools = view.querySelector<HTMLElement>('[data-tools]')!
  const searchEl = view.querySelector<HTMLInputElement>('[data-search]')!
  const sortEl = view.querySelector<HTMLSelectElement>('[data-sort]')!

  const drawCards = (decks: Deck[]) => {
    thumbCleanups.splice(0).forEach((fn) => fn())

    if (!decks.length) {
      // Distinguish "no decks at all" from "none match the search".
      if (all.length && query) {
        body.innerHTML = `<div class="empty"><h3>没有匹配的课件</h3><p>试试换个关键词。</p></div>`
        return
      }
      body.innerHTML = `
        <div class="empty">
          ${icons.empty}
          <h3>还没有课件</h3>
          <p>回到首页，输入一句话就能生成第一份精美课件。</p>
          <button class="btn btn--primary" data-new>${icons.sparkles} 去创建</button>
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
            <span>${deck.slides.length} 页 · ${formatDate(deck.createdAt)}</span>
            <div class="deck-card__actions">
              <button class="icon-btn" data-edit title="编辑">${icons.edit}</button>
              <button class="icon-btn" data-rename title="重命名">${icons.rename}</button>
              <button class="icon-btn" data-copy title="复制">${icons.copy}</button>
              <button class="icon-btn" data-del title="删除">${icons.trash}</button>
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
        const name = prompt('重命名课件：', deck.title)?.trim()
        if (!name || name === deck.title) return
        const fresh = await getDeck(deck.id)
        if (!fresh) return
        fresh.title = name
        fresh.updatedAt = Date.now()
        await saveDeck(fresh)
        toast('已重命名')
        await reload()
      })
      card.querySelector('[data-copy]')!.addEventListener('click', async (e) => {
        e.stopPropagation()
        const copy = await duplicateDeck(deck.id)
        toast(copy ? '已复制' : '复制失败')
        await reload()
      })
      card.querySelector('[data-del]')!.addEventListener('click', async (e) => {
        e.stopPropagation()
        if (!confirm(`删除「${deck.title}」？此操作不可撤销。`)) return
        await deleteDeck(deck.id)
        toast('已删除')
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
    body.innerHTML = `<div class="empty"><h3>读取失败</h3><p>无法读取本地课件库。</p></div>`
  })

  return () => thumbCleanups.forEach((fn) => fn())
}
