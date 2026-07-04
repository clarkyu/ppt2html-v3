import { loadSettings, saveSettings, DEFAULT_SETTINGS, type LlmSettings, type Provider } from '../llm/settings'
import { toast } from '../lib/toast'

const PROVIDER_HINTS: Record<Provider, { base: string; model: string; note: string }> = {
  anthropic: {
    base: 'https://api.anthropic.com',
    model: 'claude-opus-4-8',
    note: 'Claude（Anthropic）。浏览器直连 api.anthropic.com（已带浏览器直连标头）。',
  },
  openai: {
    base: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    note: 'OpenAI 兼容端点。base URL 可改为 DeepSeek、通义千问等兼容服务；模型名填对应服务的模型 ID。',
  },
}

export function renderSettings(view: HTMLElement): () => void {
  const state: LlmSettings = loadSettings()

  view.innerHTML = `
    <div class="section-head"><h2>设置</h2></div>
    <div class="form">
      <div class="form-group">
        <label>模型服务</label>
        <div class="seg" data-seg>
          <button data-provider="anthropic">Claude</button>
          <button data-provider="openai">OpenAI 兼容</button>
        </div>
        <div class="hint" data-note></div>
      </div>

      <div class="form-group">
        <label>API Base URL</label>
        <input class="form-input" data-base placeholder="">
      </div>

      <div class="form-group">
        <label>API Key</label>
        <input class="form-input" data-key type="password" placeholder="粘贴你的 API Key" autocomplete="off">
        <div class="hint">仅保存在本机浏览器（localStorage），只会发送给你上面填写的服务地址。</div>
      </div>

      <div class="form-group">
        <label>模型</label>
        <input class="form-input" data-model placeholder="">
      </div>

      <div class="notice notice--warn">
        提示：这是纯前端应用，部分第三方端点可能因 CORS 限制无法在浏览器直接调用。
        Claude 与 OpenAI 官方端点均支持浏览器直连。
      </div>

      <div style="display:flex; gap:12px; align-items:center">
        <button class="btn btn--primary" data-save>保存设置</button>
        <button class="btn btn--ghost" data-reset>恢复默认</button>
        <span data-status></span>
      </div>
    </div>`

  const segBtns = view.querySelectorAll<HTMLButtonElement>('[data-provider]')
  const noteEl = view.querySelector<HTMLElement>('[data-note]')!
  const baseEl = view.querySelector<HTMLInputElement>('[data-base]')!
  const keyEl = view.querySelector<HTMLInputElement>('[data-key]')!
  const modelEl = view.querySelector<HTMLInputElement>('[data-model]')!

  const paint = () => {
    const hint = PROVIDER_HINTS[state.provider]
    const cfg = state[state.provider]
    segBtns.forEach((b) => b.classList.toggle('active', b.dataset.provider === state.provider))
    noteEl.textContent = hint.note
    baseEl.value = cfg.baseUrl
    baseEl.placeholder = hint.base
    keyEl.value = cfg.apiKey
    modelEl.value = cfg.model
    modelEl.placeholder = hint.model
  }

  segBtns.forEach((b) =>
    b.addEventListener('click', () => {
      state.provider = b.dataset.provider as Provider
      paint()
    }),
  )
  baseEl.addEventListener('input', () => (state[state.provider].baseUrl = baseEl.value))
  keyEl.addEventListener('input', () => (state[state.provider].apiKey = keyEl.value))
  modelEl.addEventListener('input', () => (state[state.provider].model = modelEl.value))

  view.querySelector('[data-save]')!.addEventListener('click', () => {
    // Fall back to placeholder defaults for empty base/model.
    const hint = PROVIDER_HINTS[state.provider]
    if (!state[state.provider].baseUrl.trim()) state[state.provider].baseUrl = hint.base
    if (!state[state.provider].model.trim()) state[state.provider].model = hint.model
    saveSettings(state)
    paint()
    toast('设置已保存')
  })

  view.querySelector('[data-reset]')!.addEventListener('click', () => {
    const fresh = structuredClone(DEFAULT_SETTINGS)
    fresh.provider = state.provider
    state.anthropic = fresh.anthropic
    state.openai = fresh.openai
    paint()
    toast('已恢复默认（未保存）')
  })

  paint()
  return () => {}
}
