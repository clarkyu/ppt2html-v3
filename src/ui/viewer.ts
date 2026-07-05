import { getDeck, saveDeck } from '../store/db'
import { getSampleDeck } from '../sample'
import { mountPlayer, type PlayerHandle } from '../player/player'
import { populateDeckImages } from '../images/search'
import { loadSettings } from '../llm/settings'
import { navigate } from '../router'
import { icons } from '../lib/icons'

export function renderViewer(view: HTMLElement, id: string): () => void {
  let player: PlayerHandle | null = null
  let hideTimer = 0
  const imgAbort = new AbortController()

  view.innerHTML = `
    <div class="viewer">
      <div class="viewer__bar show">
        <button class="btn btn--sm" data-back>${icons.back} 返回</button>
        <div class="viewer__title" data-title></div>
        <button class="btn btn--sm" data-overview title="总览 (O)">${icons.grid}</button>
        <button class="btn btn--sm" data-edit title="编辑课件" hidden>${icons.edit} 编辑</button>
        <button class="btn btn--sm" data-print title="导出 PDF / 打印">${icons.print}</button>
        <button class="btn btn--sm" data-full title="全屏 (F)">${icons.expand}</button>
      </div>
      <div class="viewer__mount" data-mount></div>
      <div class="rotate-hint" data-rotate-hint>
        <div class="rotate-hint__icon">${icons.rotate}</div>
        <p class="rotate-hint__title">横屏观看更清晰</p>
        <p class="rotate-hint__sub">把手机横过来，课件会铺满屏幕；左右滑动翻页。</p>
        <button class="btn btn--sm" data-rotate-dismiss>仍要竖屏播放</button>
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

  const load = id === 'sample' ? Promise.resolve(getSampleDeck()) : getDeck(id)
  load
    .then((deck) => {
      if (!deck) {
        mount.innerHTML = `<div class="empty" style="color:#fff"><h3>课件不存在</h3><p>它可能已被删除。</p></div>`
        return
      }
      titleEl.textContent = deck.title
      const editBtn = view.querySelector<HTMLButtonElement>('[data-edit]')!
      if (id !== 'sample') {
        editBtn.hidden = false
        editBtn.addEventListener('click', () => navigate(`#/edit/${id}`))
      }
      player = mountPlayer(mount, deck)

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
      mount.innerHTML = `<div class="empty" style="color:#fff"><h3>加载失败</h3></div>`
    })

  return () => {
    window.clearTimeout(hideTimer)
    imgAbort.abort()
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    player?.destroy()
  }
}
