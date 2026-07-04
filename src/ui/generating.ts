import { generateDeckSpec } from '../llm/client'
import { loadSettings, isConfigured, activeConfig } from '../llm/settings'
import { normalizeDeck } from '../render/normalize'
import { saveDeck } from '../store/db'
import { navigate } from '../router'
import { toast } from '../lib/toast'
import { escapeHtml } from '../lib/markdown'
import type { GenerateOptions } from '../types'

interface Overlay {
  el: HTMLElement
  setStream: (text: string) => void
  fail: (message: string) => void
  remove: () => void
}

/** Run generation with a full-screen progress overlay, then open the player. */
export function generateAndPlay(topic: string, opts: GenerateOptions): void {
  const trimmed = topic.trim()
  if (!trimmed) {
    toast('请先输入一句话主题')
    return
  }

  const settings = loadSettings()
  if (!isConfigured(settings)) {
    toast('请先在「设置」中填写 API Key')
    navigate('#/settings')
    return
  }

  const controller = new AbortController()
  const overlay = buildOverlay(trimmed, opts, () => controller.abort())
  document.body.appendChild(overlay.el)

  const model = activeConfig(settings).model

  generateDeckSpec(trimmed, opts, settings, {
    signal: controller.signal,
    onToken: (full) => overlay.setStream(full),
  })
    .then((spec) => {
      const deck = normalizeDeck(spec, { prompt: trimmed, model, theme: opts.theme })
      return saveDeck(deck).then(() => deck)
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

function buildOverlay(topic: string, opts: GenerateOptions, onCancel: () => void): Overlay {
  const el = document.createElement('div')
  el.className = 'overlay'
  el.innerHTML = `
    <div class="gen card" style="padding:32px">
      <div class="gen__spinner"></div>
      <h2>正在生成课件…</h2>
      <p>「${escapeHtml(topic)}」</p>
      <div class="gen__stream" data-stream>正在连接模型…</div>
      <div class="gen__actions">
        <button class="btn btn--ghost" data-cancel>取消</button>
      </div>
    </div>`

  const streamEl = el.querySelector<HTMLElement>('[data-stream]')!
  el.querySelector('[data-cancel]')!.addEventListener('click', onCancel)

  return {
    el,
    setStream: (text) => {
      streamEl.textContent = text.slice(-1200)
      streamEl.scrollTop = streamEl.scrollHeight
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
        generateAndPlay(topic, opts)
      })
    },
    remove: () => el.remove(),
  }
}
