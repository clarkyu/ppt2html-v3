import {
  loadSettings,
  saveSettings,
  DEFAULT_SETTINGS,
  hasSystemKey,
  hasSystemImageKey,
  SYSTEM_DEEPSEEK,
  systemKeyApplies,
  type LlmSettings,
  type Provider,
} from '../llm/settings'
import { MODEL_PRESETS, modelChoicesFor, modelNote } from '../llm/models'
import { ABSTRACT_STYLES } from '../images/abstract'
import { escapeHtml } from '../lib/markdown'
import { toast } from '../lib/toast'
import { t } from '../i18n'

const PROVIDER_HINTS: Record<Provider, { base: string; model: string; noteKey: string }> = {
  anthropic: {
    base: 'https://api.anthropic.com',
    model: 'claude-opus-4-8',
    noteKey: 'settings.note.anthropic',
  },
  openai: {
    base: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    noteKey: 'settings.note.openai',
  },
}

const CUSTOM_MODEL = '__custom__'

export function renderSettings(view: HTMLElement): () => void {
  const state: LlmSettings = loadSettings()
  // Whether the model field is in free-text "custom" mode (vs picking from the list).
  let customModel = false

  view.innerHTML = `
    <div class="section-head"><h2>${t('nav.settings')}</h2></div>
    <div class="form">
      ${
        hasSystemKey
          ? `<div class="notice notice--ok">${t('settings.systemNotice').replace('{model}', escapeHtml(SYSTEM_DEEPSEEK.model))}</div>`
          : ''
      }
      <div class="form-group">
        <label>${t('settings.presets')}</label>
        <div class="chips" data-presets>
          ${MODEL_PRESETS.map((p, i) => `<button type="button" class="chip" data-preset="${i}">${p.label}</button>`).join('')}
        </div>
        <div class="hint">${t('settings.presetsHint')}</div>
      </div>

      <div class="form-group">
        <label>${t('settings.provider')}</label>
        <div class="seg" data-seg>
          <button data-provider="anthropic">Claude</button>
          <button data-provider="openai">${t('guided.openaiCompat')}</button>
        </div>
        <div class="hint" data-note></div>
      </div>

      <div class="form-group">
        <label>${t('settings.baseUrl')}</label>
        <input class="form-input" data-base placeholder="">
      </div>

      <div class="form-group">
        <label>${t('settings.apiKey')}</label>
        <input class="form-input" data-key type="password" placeholder="${escapeHtml(t('settings.apiKeyPlaceholder'))}" autocomplete="off">
        <div class="hint" data-key-hint>${t('settings.apiKeyHint')}</div>
      </div>

      <div class="form-group">
        <label>${t('guided.model')}</label>
        <select class="form-input" data-model-select></select>
        <input class="form-input" data-model-custom placeholder="${escapeHtml(t('settings.customModel'))}" style="display:none">
        <div class="hint">${t('settings.modelHint')}</div>
      </div>

      <div class="form-group">
        <label>${t('settings.thinkingMode')}</label>
        <label class="switch"><input type="checkbox" data-thinking><span>${t('settings.thinkingLabel')}</span></label>
        <div class="hint">${t('settings.thinkingHint')}</div>
      </div>

      <div class="form-group">
        <label>${t('settings.bgImages')}</label>
        <label class="switch"><input type="checkbox" data-img-enabled><span>${t('settings.bgLabel')}</span></label>
        <div class="seg" data-img-mode style="margin-top:10px">
          <button type="button" data-mode="photo">${t('settings.bgMode.photo')}</button>
          <button type="button" data-mode="abstract">${t('settings.bgMode.abstract')}</button>
        </div>
        <div class="hint" data-img-mode-note></div>
        <div data-img-abstract>
          <label style="margin-top:10px">${t('settings.abstractStyle')}</label>
          <select class="form-input" data-img-style>
            ${ABSTRACT_STYLES.map((s) => `<option value="${s}">${escapeHtml(t('settings.abstractStyle.' + s))}</option>`).join('')}
          </select>
          <div class="hint">${t('settings.abstractStyleHint')}</div>
        </div>
        <div data-img-photo-keys>
          <div class="hint">${(hasSystemImageKey ? t('settings.bgHint.system') : t('settings.bgHint.openverse')) + t('settings.bgHint.tail')}</div>
          <input class="form-input" data-img-unsplash placeholder="${escapeHtml(t('settings.unsplashPlaceholder'))}" autocomplete="off" style="margin-top:10px">
          <input class="form-input" data-img-pexels placeholder="${escapeHtml(t('settings.pexelsPlaceholder'))}" autocomplete="off" style="margin-top:8px">
          <input class="form-input" data-img-pixabay placeholder="${escapeHtml(t('settings.pixabayPlaceholder'))}" autocomplete="off" style="margin-top:8px">
          <div class="hint">${t('settings.imgKeyHint')}</div>
        </div>
      </div>

      <div class="form-group">
        <label>${t('settings.branding')}</label>
        <div class="hint">${t('settings.brandingHint')}</div>
        <input class="form-input" data-brand-presenter placeholder="${escapeHtml(t('settings.presenter'))}" style="margin-top:8px">
        <input class="form-input" data-brand-org placeholder="${escapeHtml(t('settings.org'))}" style="margin-top:8px">
        <div style="display:flex; gap:8px; align-items:center; margin-top:8px">
          <input class="form-input" data-brand-logo placeholder="${escapeHtml(t('settings.logoUrl'))}" style="flex:1; min-width:0">
          <label class="btn btn--ghost btn--sm" style="flex:none">${t('settings.upload')}<input type="file" accept="image/*" data-brand-logo-file hidden></label>
        </div>
        <img data-brand-logo-preview alt="" style="display:none; height:36px; margin-top:8px; object-fit:contain; background:var(--surface-2); border-radius:8px; padding:4px 8px">
      </div>

      <div class="notice notice--warn">${t('settings.corsNotice')}</div>

      <div style="display:flex; gap:12px; align-items:center">
        <button class="btn btn--primary" data-save>${t('settings.save')}</button>
        <button class="btn btn--ghost" data-reset>${t('settings.reset')}</button>
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
  const imgEnabledEl = view.querySelector<HTMLInputElement>('[data-img-enabled]')!
  const imgUnsplashEl = view.querySelector<HTMLInputElement>('[data-img-unsplash]')!
  const imgPexelsEl = view.querySelector<HTMLInputElement>('[data-img-pexels]')!
  const imgPixabayEl = view.querySelector<HTMLInputElement>('[data-img-pixabay]')!
  const imgModeEl = view.querySelector<HTMLElement>('[data-img-mode]')!
  const imgModeNoteEl = view.querySelector<HTMLElement>('[data-img-mode-note]')!
  const imgPhotoKeysEl = view.querySelector<HTMLElement>('[data-img-photo-keys]')!
  const imgAbstractEl = view.querySelector<HTMLElement>('[data-img-abstract]')!
  const imgStyleEl = view.querySelector<HTMLSelectElement>('[data-img-style]')!
  const brandPresenterEl = view.querySelector<HTMLInputElement>('[data-brand-presenter]')!
  const brandOrgEl = view.querySelector<HTMLInputElement>('[data-brand-org]')!
  const brandLogoEl = view.querySelector<HTMLInputElement>('[data-brand-logo]')!
  const brandLogoFileEl = view.querySelector<HTMLInputElement>('[data-brand-logo-file]')!
  const brandLogoPreviewEl = view.querySelector<HTMLImageElement>('[data-brand-logo-preview]')!
  const keyHintEl = view.querySelector<HTMLElement>('[data-key-hint]')!
  const DEFAULT_KEY_HINT = keyHintEl.textContent ?? ''

  const rebuildModels = () => {
    const cfg = state[state.provider]
    const choices = modelChoicesFor(state.provider, cfg.baseUrl, cfg.model)
    modelSelect.innerHTML =
      choices
        .map((m) => {
          const note = modelNote(m)
          const label = note ? `${m} — ${note}` : m
          return `<option value="${escapeHtml(m)}">${escapeHtml(label)}</option>`
        })
        .join('') +
      `<option value="${CUSTOM_MODEL}">${t('settings.customOption')}</option>`
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
    noteEl.textContent = t(hint.noteKey)
    baseEl.value = cfg.baseUrl
    baseEl.placeholder = hint.base
    keyEl.value = cfg.apiKey
    thinkingEl.checked = state.thinking
    imgEnabledEl.checked = state.images.enabled
    imgUnsplashEl.value = state.images.unsplashKey
    imgPexelsEl.value = state.images.pexelsKey
    imgPixabayEl.value = state.images.pixabayKey
    imgStyleEl.value = state.images.abstractStyle
    paintImgMode()
    brandPresenterEl.value = state.branding.presenter ?? ''
    brandOrgEl.value = state.branding.org ?? ''
    brandLogoEl.value = state.branding.logo ?? ''
    updateLogoPreview()
    updateKeyHint()
    rebuildModels()
  }

  const paintImgMode = () => {
    const abstract = state.images.mode === 'abstract'
    imgModeEl.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) =>
      b.classList.toggle('active', b.dataset.mode === state.images.mode),
    )
    // Stock-source keys only matter in photo mode; the style picker only in abstract mode.
    imgPhotoKeysEl.style.display = abstract ? 'none' : ''
    imgAbstractEl.style.display = abstract ? '' : 'none'
    imgModeNoteEl.textContent = abstract ? t('settings.bgMode.abstractNote') : t('settings.bgMode.photoNote')
  }

  const updateLogoPreview = () => {
    const u = (state.branding.logo ?? '').trim()
    if (u) {
      brandLogoPreviewEl.src = u
      brandLogoPreviewEl.style.display = ''
    } else {
      brandLogoPreviewEl.removeAttribute('src')
      brandLogoPreviewEl.style.display = 'none'
    }
  }

  // When the system DeepSeek fallback covers this endpoint, the key is optional.
  const updateKeyHint = () => {
    const covered = systemKeyApplies(state) && !state[state.provider].apiKey.trim()
    keyEl.placeholder = covered ? t('settings.keyOptional') : t('settings.apiKeyPlaceholder')
    keyHintEl.textContent = covered ? t('settings.keyCovered') : DEFAULT_KEY_HINT
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
    toast(t('settings.switchedTo').replace('{label}', p.label))
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
  imgEnabledEl.addEventListener('change', () => (state.images.enabled = imgEnabledEl.checked))
  imgUnsplashEl.addEventListener('input', () => (state.images.unsplashKey = imgUnsplashEl.value))
  imgPexelsEl.addEventListener('input', () => (state.images.pexelsKey = imgPexelsEl.value))
  imgPixabayEl.addEventListener('input', () => (state.images.pixabayKey = imgPixabayEl.value))
  imgModeEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]')
    if (!btn) return
    state.images.mode = btn.dataset.mode === 'abstract' ? 'abstract' : 'photo'
    paintImgMode()
  })
  imgStyleEl.addEventListener('change', () => {
    state.images.abstractStyle = imgStyleEl.value as (typeof ABSTRACT_STYLES)[number]
  })
  brandPresenterEl.addEventListener('input', () => (state.branding.presenter = brandPresenterEl.value))
  brandOrgEl.addEventListener('input', () => (state.branding.org = brandOrgEl.value))
  brandLogoEl.addEventListener('input', () => {
    state.branding.logo = brandLogoEl.value
    updateLogoPreview()
  })
  brandLogoFileEl.addEventListener('change', () => {
    const file = brandLogoFileEl.files?.[0]
    if (!file) return
    if (file.size > 900_000) {
      toast(t('settings.logoTooBig'))
      brandLogoFileEl.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      state.branding.logo = String(reader.result)
      brandLogoEl.value = state.branding.logo
      updateLogoPreview()
    }
    reader.readAsDataURL(file)
    brandLogoFileEl.value = ''
  })

  view.querySelector('[data-save]')!.addEventListener('click', () => {
    // Fall back to placeholder defaults for empty base/model.
    const hint = PROVIDER_HINTS[state.provider]
    if (!state[state.provider].baseUrl.trim()) state[state.provider].baseUrl = hint.base
    if (!state[state.provider].model.trim()) state[state.provider].model = hint.model
    saveSettings(state)
    customModel = false
    paint()
    toast(t('settings.saved'))
  })

  view.querySelector('[data-reset]')!.addEventListener('click', () => {
    const fresh = structuredClone(DEFAULT_SETTINGS)
    fresh.provider = state.provider
    state.anthropic = fresh.anthropic
    state.openai = fresh.openai
    state.thinking = fresh.thinking
    state.images = fresh.images
    state.branding = fresh.branding
    customModel = false
    paint()
    toast(t('settings.resetDone'))
  })

  paint()
  return () => {}
}
