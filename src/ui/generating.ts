import { generateDeckFromOutline } from '../llm/outline'
import { loadSettings, isConfigured, activeConfig } from '../llm/settings'
import { normalizeDeck } from '../render/normalize'
import { populateDeckImages } from '../images/search'
import { saveDeck } from '../store/db'
import { navigate } from '../router'
import { toast } from '../lib/toast'
import { escapeHtml } from '../lib/markdown'
import { liveTitles, renderLive } from '../lib/live'
import type { GenerateOptions, Outline } from '../types'

interface Overlay {
  el: HTMLElement
  setStream: (text: string) => void
  setImages: (done: number, total: number) => void
  fail: (message: string) => void
  remove: () => void
}

/** Generate the full deck from the confirmed outline, then open the player. */
export function generateAndPlay(topic: string, opts: GenerateOptions, outline: Outline): void {
  const trimmed = topic.trim()
  const settings = loadSettings()
  if (!isConfigured(settings)) {
    toast('请先在「设置」中填写 API Key')
    navigate('#/settings')
    return
  }

  const controller = new AbortController()
  const overlay = buildOverlay(trimmed, opts, outline, () => controller.abort())
  document.body.appendChild(overlay.el)

  const model = activeConfig(settings).model

  generateDeckFromOutline(trimmed, opts, outline, settings, {
    signal: controller.signal,
    onToken: (full) => overlay.setStream(full),
  })
    .then(async (spec) => {
      const deck = normalizeDeck(spec, { prompt: trimmed, model, theme: outline.theme })
      // Best-effort: fetch a subtle background image for each page.
      if (settings.images.enabled) {
        await populateDeckImages(deck, settings, {
          signal: controller.signal,
          onProgress: (done, total) => overlay.setImages(done, total),
        })
      }
      await saveDeck(deck)
      return deck
    })
    .then((deck) => {
      overlay.remove()
      navigate(`#/play/${deck.id}`)
    })
    .catch((err: unknown) => {
      if (controller.signal.aborted) {
        overlay.remove()
        return
      }
      overlay.fail(err instanceof Error ? err.message : String(err))
    })
}

function buildOverlay(
  topic: string,
  opts: GenerateOptions,
  outline: Outline,
  onCancel: () => void,
): Overlay {
  const el = document.createElement('div')
  el.className = 'overlay'
  el.innerHTML = `
    <div class="gen card" style="padding:32px">
      <div class="gen__spinner"></div>
      <h2>正在生成课件…</h2>
      <p>「${escapeHtml(topic)}」 · 共 ${outline.slides.length} 页</p>
      <ol class="gen-live gen-live--tall" data-live><li class="gen-live__wait">正在连接模型…</li></ol>
      <div class="gen__imgs" data-imgs hidden></div>
      <div class="gen__actions">
        <button class="btn btn--ghost" data-cancel>取消</button>
      </div>
    </div>`

  const liveEl = el.querySelector<HTMLElement>('[data-live]')!
  const imgsEl = el.querySelector<HTMLElement>('[data-imgs]')!
  el.querySelector('[data-cancel]')!.addEventListener('click', onCancel)

  return {
    el,
    setStream: (text) => {
      renderLive(liveEl, liveTitles(text))
      liveEl.scrollTop = liveEl.scrollHeight
    },
    setImages: (done, total) => {
      imgsEl.hidden = false
      const pct = total ? Math.round((done / total) * 100) : 0
      imgsEl.innerHTML =
        `<div class="gen__imgs-label">正在为每页配背景图… ${done}/${total}</div>` +
        `<div class="gen__bar"><span style="width:${pct}%"></span></div>`
    },
    fail: (message) => {
      el.querySelector('.gen')!.innerHTML = `
        <h2 class="gen__error">生成失败</h2>
        <p style="color:var(--text-muted)">${escapeHtml(message)}</p>
        <div class="gen__actions">
          <button class="btn btn--ghost" data-close>关闭</button>
          <button class="btn btn--primary" data-retry>重试</button>
        </div>`
      el.querySelector('[data-close]')!.addEventListener('click', () => el.remove())
      el.querySelector('[data-retry]')!.addEventListener('click', () => {
        el.remove()
        generateAndPlay(topic, opts, outline)
      })
    },
    remove: () => el.remove(),
  }
}
