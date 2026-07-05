import { icons } from '../lib/icons'
import { navigate } from '../router'
import { listDecks, deleteDeck, duplicateDeck, getDeck, saveDeck } from '../store/db'
import { mountThumb } from '../render/preview'
import { formatDate } from '../lib/dom'
import { escapeHtml } from '../lib/markdown'
import { toast } from '../lib/toast'
import type { Deck } from '../types'

export function renderLibrary(view: HTMLElement): () => void {
  const thumbCleanups: Array<() => void> = []
  view.innerHTML = `<div class="section-head"><h2>我的课件</h2></div><div data-body>加载中…</div>`
  const body = view.querySelector<HTMLElement>('[data-body]')!

  const draw = (decks: Deck[]) => {
    thumbCleanups.splice(0).forEach((fn) => fn())
    if (!decks.length) {
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
        draw(await listDecks())
      })
      card.querySelector('[data-copy]')!.addEventListener('click', async (e) => {
        e.stopPropagation()
        const copy = await duplicateDeck(deck.id)
        toast(copy ? '已复制' : '复制失败')
        draw(await listDecks())
      })
      card.querySelector('[data-del]')!.addEventListener('click', async (e) => {
        e.stopPropagation()
        if (!confirm(`删除「${deck.title}」？此操作不可撤销。`)) return
        await deleteDeck(deck.id)
        toast('已删除')
        draw((await listDecks()))
      })

      grid.appendChild(card)
      thumbCleanups.push(mountThumb(card.querySelector<HTMLElement>('.thumb')!, deck))
    }
  }

  listDecks()
    .then(draw)
    .catch(() => {
      body.innerHTML = `<div class="empty"><h3>读取失败</h3><p>无法读取本地课件库。</p></div>`
    })

  return () => thumbCleanups.forEach((fn) => fn())
}
