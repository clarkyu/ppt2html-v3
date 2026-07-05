import {
  loadSettings,
  saveSettings,
  DEFAULT_SETTINGS,
  hasSystemKey,
  SYSTEM_DEEPSEEK,
  systemKeyApplies,
  type LlmSettings,
  type Provider,
} from '../llm/settings'
import { MODEL_PRESETS, modelChoicesFor } from '../llm/models'
import { escapeHtml } from '../lib/markdown'
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
    note: 'OpenAI 兼容端点。base URL 可改为 Gemini / DeepSeek / 通义千问 / 智谱 / Grok / Mistral / OpenRouter 等兼容服务；模型名填对应服务的模型 ID。',
  },
}

const CUSTOM_MODEL = '__custom__'

export function renderSettings(view: HTMLElement): () => void {
  const state: LlmSettings = loadSettings()
  // Whether the model field is in free-text "custom" mode (vs picking from the list).
  let customModel = false

  view.innerHTML = `
    <div class="section-head"><h2>设置</h2></div>
    <div class="form">
      ${
        hasSystemKey
          ? `<div class="notice notice--ok">
               默认使用 <b>系统提供的 DeepSeek（${escapeHtml(SYSTEM_DEEPSEEK.model)}）</b>——免填 API Key，开箱即用。
               想用 Claude / OpenAI / Gemini 等其它模型，请在下方填写你自己的 API Key。
               <br>生图模型需自备 API Key；未提供时只能生成文本型课件。
             </div>`
          : ''
      }
      <div class="form-group">
        <label>快速预设</label>
        <div class="chips" data-presets>
          ${MODEL_PRESETS.map((p, i) => `<button type="button" class="chip" data-preset="${i}">${p.label}</button>`).join('')}
        </div>
        <div class="hint">一键填好 base URL 与模型；再填入对应服务的 API Key 并保存即可。</div>
      </div>

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
        <div class="hint" data-key-hint>仅保存在本机浏览器（localStorage），只会发送给你上面填写的服务地址。</div>
      </div>

      <div class="form-group">
        <label>模型</label>
        <select class="form-input" data-model-select></select>
        <input class="form-input" data-model-custom placeholder="输入自定义模型 ID" style="display:none">
        <div class="hint">从常见模型中选择；如需其它模型请选「自定义…」自行填写。</div>
      </div>

      <div class="form-group">
        <label>思考模式</label>
        <label class="switch"><input type="checkbox" data-thinking><span>开启思考 / 推理（更深入，但更慢）</span></label>
        <div class="hint">仅对支持思考模式的模型生效，如 DeepSeek V4（v4-flash / v4-pro）。</div>
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
  const modelSelect = view.querySelector<HTMLSelectElement>('[data-model-select]')!
  const modelCustom = view.querySelector<HTMLInputElement>('[data-model-custom]')!
  const thinkingEl = view.querySelector<HTMLInputElement>('[data-thinking]')!
  const keyHintEl = view.querySelector<HTMLElement>('[data-key-hint]')!
  const DEFAULT_KEY_HINT = keyHintEl.textContent ?? ''

  const rebuildModels = () => {
    const cfg = state[state.provider]
    const choices = modelChoicesFor(state.provider, cfg.baseUrl, cfg.model)
    modelSelect.innerHTML =
      choices.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('') +
      `<option value="${CUSTOM_MODEL}">自定义…</option>`
    if (customModel) {
      modelSelect.value = CUSTOM_MODEL
      modelCustom.style.display = ''
      modelCustom.value = cfg.model
    } else {
      if (!cfg.model || !choices.includes(cfg.model)) cfg.model = choices[0]
      modelSelect.value = cfg.model
      modelCustom.style.display = 'none'
    }
  }

  const paint = () => {
    const hint = PROVIDER_HINTS[state.provider]
    const cfg = state[state.provider]
    segBtns.forEach((b) => b.classList.toggle('active', b.dataset.provider === state.provider))
    noteEl.textContent = hint.note
    baseEl.value = cfg.baseUrl
    baseEl.placeholder = hint.base
    keyEl.value = cfg.apiKey
    thinkingEl.checked = state.thinking
    updateKeyHint()
    rebuildModels()
  }

  // When the system DeepSeek fallback covers this endpoint, the key is optional.
  const updateKeyHint = () => {
    const covered = systemKeyApplies(state) && !state[state.provider].apiKey.trim()
    keyEl.placeholder = covered ? '可留空 —— DeepSeek 由系统提供' : '粘贴你的 API Key'
    keyHintEl.textContent = covered
      ? '此服务已由系统提供 Key，可留空直接使用；如填入你自己的 Key，则优先用你的。'
      : DEFAULT_KEY_HINT
  }

  segBtns.forEach((b) =>
    b.addEventListener('click', () => {
      state.provider = b.dataset.provider as Provider
      customModel = false
      paint()
    }),
  )

  view.querySelector('[data-presets]')!.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-preset]')
    if (!btn) return
    const p = MODEL_PRESETS[Number(btn.dataset.preset)]
    state.provider = p.provider
    state[p.provider].baseUrl = p.baseUrl
    state[p.provider].model = p.models[0]
    customModel = false
    paint()
    toast(`已切到 ${p.label}，填好 API Key 后记得保存`)
  })

  baseEl.addEventListener('input', () => {
    state[state.provider].baseUrl = baseEl.value
    updateKeyHint()
    if (!customModel) rebuildModels()
  })
  keyEl.addEventListener('input', () => {
    state[state.provider].apiKey = keyEl.value
    updateKeyHint()
  })
  modelSelect.addEventListener('change', () => {
    if (modelSelect.value === CUSTOM_MODEL) {
      customModel = true
      modelCustom.style.display = ''
      modelCustom.value = state[state.provider].model
      modelCustom.focus()
    } else {
      customModel = false
      modelCustom.style.display = 'none'
      state[state.provider].model = modelSelect.value
    }
  })
  modelCustom.addEventListener('input', () => (state[state.provider].model = modelCustom.value))
  thinkingEl.addEventListener('change', () => (state.thinking = thinkingEl.checked))

  view.querySelector('[data-save]')!.addEventListener('click', () => {
    // Fall back to placeholder defaults for empty base/model.
    const hint = PROVIDER_HINTS[state.provider]
    if (!state[state.provider].baseUrl.trim()) state[state.provider].baseUrl = hint.base
    if (!state[state.provider].model.trim()) state[state.provider].model = hint.model
    saveSettings(state)
    customModel = false
    paint()
    toast('设置已保存')
  })

  view.querySelector('[data-reset]')!.addEventListener('click', () => {
    const fresh = structuredClone(DEFAULT_SETTINGS)
    fresh.provider = state.provider
    state.anthropic = fresh.anthropic
    state.openai = fresh.openai
    state.thinking = fresh.thinking
    customModel = false
    paint()
    toast('已恢复默认（未保存）')
  })

  paint()
  return () => {}
}
