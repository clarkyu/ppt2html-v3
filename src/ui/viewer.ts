import { getDeck } from '../store/db'
import { getSampleDeck } from '../sample'
import { mountPlayer, type PlayerHandle } from '../player/player'
import { navigate } from '../router'
import { icons } from '../lib/icons'

export function renderViewer(view: HTMLElement, id: string): () => void {
  let player: PlayerHandle | null = null
  let hideTimer = 0

  view.innerHTML = `
    <div class="viewer">
      <div class="viewer__bar show">
        <button class="btn btn--sm" data-back>${icons.back} 返回</button>
        <div class="viewer__title" data-title></div>
        <button class="btn btn--sm" data-overview title="总览 (O)">${icons.grid}</button>
        <button class="btn btn--sm" data-print title="导出 PDF / 打印">${icons.print}</button>
        <button class="btn btn--sm" data-full title="全屏 (F)">${icons.expand}</button>
      </div>
      <div class="viewer__mount" data-mount></div>
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
  const nudgeBar = () => {
    bar.classList.add('show')
    window.clearTimeout(hideTimer)
    hideTimer = window.setTimeout(() => bar.classList.remove('show'), 2600)
  }
  viewerEl.addEventListener('mousemove', nudgeBar)
  nudgeBar()

  view.querySelector('[data-back]')!.addEventListener('click', goBack)
  view.querySelector('[data-overview]')!.addEventListener('click', () => player?.toggleOverview())
  view.querySelector('[data-print]')!.addEventListener('click', () => window.print())
  view.querySelector('[data-full]')!.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else viewerEl.requestFullscreen?.()
  })

  const load = id === 'sample' ? Promise.resolve(getSampleDeck()) : getDeck(id)
  load
    .then((deck) => {
      if (!deck) {
        mount.innerHTML = `<div class="empty" style="color:#fff"><h3>课件不存在</h3><p>它可能已被删除。</p></div>`
        return
      }
      titleEl.textContent = deck.title
      player = mountPlayer(mount, deck)
    })
    .catch(() => {
      mount.innerHTML = `<div class="empty" style="color:#fff"><h3>加载失败</h3></div>`
    })

  return () => {
    window.clearTimeout(hideTimer)
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    player?.destroy()
  }
}
