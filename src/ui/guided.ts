import { generateClarifyingQuestions, defaultQuestions } from '../llm/clarify'
import {
  loadSettings,
  saveSettings,
  isConfigured,
  hasSystemKey,
  hasSystemImageKey,
  systemKeyApplies,
  hostOf,
  isDeepSeekEndpoint,
  type LlmSettings,
  type Provider,
} from '../llm/settings'
import { MODEL_PRESETS, modelChoicesFor, presetFor } from '../llm/models'
import { startStructure } from './structure'
import { navigate } from '../router'
import { toast } from '../lib/toast'
import { escapeHtml } from '../lib/markdown'
import { openOverlay, overlayOpen } from '../lib/overlay'
import { t } from '../i18n'
import type { ClarifyQuestion, Clarification, GenerateOptions } from '../types'

interface Prefetch {
  promise: Promise<ClarifyQuestion[]>
  controller: AbortController
  provider: Provider
  resolved?: ClarifyQuestion[]
  rejected?: unknown
}

/**
 * Entry point from Home. Flow:
 *   1) confirm which model will generate the deck (pick the model up front)
 *   2) 1–2 quick clarifying questions — prefetched during step 1 so they show
 *      instantly (with generic defaults as an immediate fallback)
 *   3) hand off to the outline step
 */
export function startGuidedGeneration(topic: string, opts: GenerateOptions): void {
  const trimmed = topic.trim()
  if (!trimmed) {
    toast(t('err.noTopic'))
    return
  }
  const initial = loadSettings()
  if (!isConfigured(initial) && !usable(initial, 'anthropic') && !usable(initial, 'openai')) {
    toast(t('err.noKey'))
    navigate('#/settings')
    return
  }

  // One wizard at a time: a second launch while one is up (auto-repeat on
  // the launcher, a double tap) would stack a second overlay and a second
  // billed request.
  if (overlayOpen()) return

  const ov = openOverlay(`<div class="clarify card"><div data-body></div></div>`, () => close())
  const body = ov.el.querySelector<HTMLElement>('[data-body]')!
  let removed = false
  const close = () => {
    removed = true
    prefetch?.controller.abort()
    ov.dispose()
  }

  let prefetch: Prefetch | null = null
  let touched = false
  // Which step is on screen — so a late question-upgrade can't clobber the
  // model step after the user goes back.
  let step: 'model' | 'questions' = 'model'

  const startPrefetch = (s: LlmSettings) => {
    prefetch?.controller.abort()
    const controller = new AbortController()
    const pf: Prefetch = {
      controller,
      provider: s.provider,
      promise: generateClarifyingQuestions(trimmed, opts, s, controller.signal),
    }
    pf.promise.then((q) => (pf.resolved = q)).catch((e) => (pf.rejected = e))
    prefetch = pf
  }
  /** A prefetch still worth keeping for this provider (resolved or in flight). */
  const prefetchUsable = (provider: Provider): boolean =>
    !!prefetch && prefetch.provider === provider && !prefetch.rejected && !prefetch.controller.signal.aborted

  /* ----------------------------- step 1: model ----------------------------- */

  const showModel = () => {
    step = 'model'
    const draft = loadSettings()
    // Default to a provider that's actually usable (own key, or the system
    // DeepSeek fallback). Keep the saved one if it works; otherwise switch.
    if (!usable(draft, draft.provider)) {
      const other: Provider = draft.provider === 'anthropic' ? 'openai' : 'anthropic'
      if (usable(draft, other)) draft.provider = other
    }
    // Kick off the clarifying-questions request now so it overlaps this
    // step — unless the user pasted material: that text goes to a provider
    // only after they confirm which one, on 开始. Coming BACK to this step
    // keeps a prefetch that is still valid instead of re-sending it.
    if (!opts.material?.trim() && !prefetchUsable(draft.provider)) startPrefetch(draft)

    body.innerHTML = `
      <div class="clarify__head">
        <h2>${t('guided.pickModel')}</h2>
        <p>${t('guided.pickModelSub', { topic: escapeHtml(trimmed) })}</p>
        ${hasSystemKey ? `<p class="clarify__hint">${t('guided.systemKeyHint')}</p>` : ''}
      </div>
      <div class="modelpick">
        <div class="modelpick__row">
          <span class="modelpick__label">${t('guided.service')}</span>
          <div class="seg" data-seg>
            <button type="button" data-provider="anthropic">Claude</button>
            <button type="button" data-provider="openai">${t('guided.openaiCompat')}</button>
          </div>
        </div>
        <div class="modelpick__row">
          <span class="modelpick__label">${t('guided.preset')}</span>
          <div class="chips modelpick__presets" data-presets>
            ${MODEL_PRESETS.map((p, i) => `<button type="button" class="chip" data-preset="${i}">${p.label}</button>`).join('')}
          </div>
        </div>
        <div class="modelpick__row">
          <span class="modelpick__label">${t('guided.model')}</span>
          <select class="select modelpick__model" data-model></select>
        </div>
        <div class="modelpick__row" data-think-row hidden>
          <span class="modelpick__label">${t('guided.thinking')}</span>
          <label class="switch"><input type="checkbox" data-thinking><span>${t('guided.thinkingLabel')}</span></label>
        </div>
        <div class="modelpick__row">
          <span class="modelpick__label">${t('guided.bg')}</span>
          <label class="switch"><input type="checkbox" data-bg-enabled><span>${t('guided.bgLabel')}</span></label>
        </div>
        <div class="modelpick__note" data-bg-note></div>
        <div class="modelpick__note" data-note></div>
      </div>
      <div class="clarify__actions">
        <button class="btn btn--ghost" data-settings>${t('guided.moreSettings')}</button>
        <div class="clarify__actions-right">
          <button class="btn btn--ghost" data-cancel>${t('common.cancel')}</button>
          <button class="btn btn--primary" data-go>${t('guided.start')}</button>
        </div>
      </div>`

    const segBtns = body.querySelectorAll<HTMLButtonElement>('[data-provider]')
    const modelSel = body.querySelector<HTMLSelectElement>('[data-model]')!
    const noteEl = body.querySelector<HTMLElement>('[data-note]')!
    const goBtn = body.querySelector<HTMLButtonElement>('[data-go]')!
    const thinkRow = body.querySelector<HTMLElement>('[data-think-row]')!
    const thinkBox = body.querySelector<HTMLInputElement>('[data-thinking]')!
    const bgBox = body.querySelector<HTMLInputElement>('[data-bg-enabled]')!
    const bgNote = body.querySelector<HTMLElement>('[data-bg-note]')!

    const paintBg = () => {
      bgBox.checked = draft.images.enabled
      const hasImgKey = draft.images.unsplashKey.trim() || draft.images.pexelsKey.trim()
      bgNote.style.display = draft.images.enabled ? '' : 'none'
      bgNote.innerHTML = hasImgKey
        ? t('guided.bgNote.own')
        : hasSystemImageKey
          ? t('guided.bgNote.system')
          : t('guided.bgNote.openverse')
    }

    const paint = () => {
      const cfg = draft[draft.provider]
      const ownKey = cfg.apiKey.trim().length > 0
      const ready = isConfigured(draft) // own key, or system DeepSeek fallback
      const systemCovers = ready && !ownKey
      segBtns.forEach((b) => b.classList.toggle('active', b.dataset.provider === draft.provider))

      // Thinking-mode toggle only applies to DeepSeek V4 endpoints — the same
      // host test the client uses to decide whether to SEND `thinking`.
      thinkRow.hidden = !(draft.provider === 'openai' && isDeepSeekEndpoint(cfg.baseUrl))
      thinkBox.checked = draft.thinking

      const activePreset = presetFor(draft.provider, cfg.baseUrl)
      body.querySelectorAll<HTMLElement>('[data-preset]').forEach((chip) => {
        chip.classList.toggle('active', MODEL_PRESETS[Number(chip.dataset.preset)] === activePreset)
      })

      const choices = modelChoicesFor(draft.provider, cfg.baseUrl, cfg.model)
      if (!cfg.model || !choices.includes(cfg.model)) cfg.model = choices[0]
      modelSel.innerHTML = choices
        .map((m) => `<option value="${escapeHtml(m)}"${m === cfg.model ? ' selected' : ''}>${escapeHtml(m)}</option>`)
        .join('')

      noteEl.textContent = ready
        ? systemCovers
          ? t('guided.willUseSystem', { model: cfg.model })
          : t('guided.willUse', { host: hostOf(cfg.baseUrl) || cfg.baseUrl, model: cfg.model })
        : t('guided.warnNoKey')
      noteEl.classList.toggle('modelpick__note--warn', !ready)
      goBtn.disabled = !ready
      paintBg()
    }

    segBtns.forEach((b) =>
      b.addEventListener('click', () => {
        draft.provider = b.dataset.provider as Provider
        paint()
      }),
    )
    body.querySelector('[data-presets]')!.addEventListener('click', (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-preset]')
      if (!chip) return
      const p = MODEL_PRESETS[Number(chip.dataset.preset)]
      draft.provider = p.provider
      draft[p.provider].baseUrl = p.baseUrl
      draft[p.provider].model = p.models[0]
      paint()
    })
    modelSel.addEventListener('change', () => (draft[draft.provider].model = modelSel.value))
    thinkBox.addEventListener('change', () => (draft.thinking = thinkBox.checked))
    bgBox.addEventListener('change', () => {
      draft.images.enabled = bgBox.checked
      paintBg()
    })

    body.querySelector('[data-settings]')!.addEventListener('click', () => {
      close()
      navigate('#/settings')
    })
    body.querySelector('[data-cancel]')!.addEventListener('click', close)
    goBtn.addEventListener('click', () => {
      if (!isConfigured(draft)) {
        toast(t('err.noKeyShort'))
        return
      }
      // Storage refusing (quota / private mode) must not block the wizard: the
      // in-memory draft drives this run; the user just hears it won't stick.
      if (!saveSettings(draft)) toast(t('settings.saveFailed'))
      // Prefetch now if none is usable for this provider (material was held
      // back until this commit; or the provider changed; or it failed).
      if (!prefetchUsable(draft.provider)) startPrefetch(draft)
      goQuestions()
    })

    paint()
  }

  /* --------------------------- step 2: questions --------------------------- */

  const goQuestions = () => {
    const pf = prefetch
    if (pf?.resolved) {
      if (pf.resolved.length) showQuestions(pf.resolved, false)
      else {
        close()
        startStructure(trimmed, opts)
      }
      return
    }
    // Still loading (or failed): show generic defaults instantly, then upgrade
    // to the AI-tailored questions once they arrive (unless the user engaged).
    touched = false
    showQuestions(defaultQuestions(trimmed), true)
    // Whatever happens to the prefetch, the "optimizing…" line must not stay
    // up forever: it clears when the tailored questions land, when there are
    // none, when the request fails, or once the user has started answering.
    const settle = (): void => body.querySelector('.clarify__loading')?.remove()
    if (!pf) {
      settle()
      return
    }
    pf.promise
      .then((q) => {
        if (removed || step !== 'questions') return
        if (touched || !q.length) {
          settle()
          return
        }
        showQuestions(q, false)
      })
      .catch(() => {
        if (!removed && step === 'questions') settle() // the defaults are perfectly usable
      })
  }

  const showQuestions = (questions: ClarifyQuestion[], provisional: boolean) => {
    step = 'questions'
    body.innerHTML = `
      <div class="clarify__head">
        <h2>${t('guided.qTitle')}</h2>
        <p>${t('guided.qSub')}</p>
      </div>
      ${provisional ? `<div class="clarify__loading">${t('guided.qOptimizing')}</div>` : ''}
      <div class="clarify__list">
        ${questions.map(renderQuestion).join('')}
      </div>
      <div class="clarify__actions">
        <button class="btn btn--ghost" data-back>${t('common.prevStep')}</button>
        <button class="btn btn--ghost" data-skip>${t('guided.skipToStructure')}</button>
        <div class="clarify__actions-right">
          <button class="btn btn--ghost" data-cancel>${t('common.cancel')}</button>
          <button class="btn btn--primary" data-go>${t('common.next')}</button>
        </div>
      </div>`

    // Any interaction locks the current questions in (no live swap after this).
    const list = body.querySelector<HTMLElement>('.clarify__list')!
    const markTouched = () => {
      touched = true
      body.querySelector('.clarify__loading')?.remove() // no swap will happen now
    }
    list.addEventListener('click', (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-opt]')
      if (chip) chip.classList.toggle('active')
      markTouched()
    })
    list.addEventListener('input', markTouched)

    body.querySelector('[data-back]')!.addEventListener('click', showModel)
    body.querySelector('[data-cancel]')!.addEventListener('click', close)
    body.querySelector('[data-skip]')!.addEventListener('click', () => {
      close()
      startStructure(trimmed, opts)
    })
    body.querySelector('[data-go]')!.addEventListener('click', () => {
      const clarifications = collectAnswers(body, questions)
      close()
      startStructure(trimmed, { ...opts, clarifications })
    })
  }

  // System-key users still on the default DeepSeek go straight to the
  // questions — forcing a provider/model screen on someone who never
  // configured anything is the flow's biggest first-step drop-off. The
  // questions screen's ← back button still reaches the model step.
  if (systemKeyApplies(initial) && !initial[initial.provider].apiKey.trim()) {
    startPrefetch(initial)
    goQuestions()
  } else {
    showModel()
  }
}

/** Is provider `p` usable — its own key set, or the system fallback covers it? */
function usable(s: LlmSettings, p: Provider): boolean {
  return isConfigured({ ...s, provider: p })
}

function renderQuestion(q: ClarifyQuestion, i: number): string {
  const chips = (q.options ?? [])
    .map((o) => `<button type="button" class="chip" data-opt>${escapeHtml(o)}</button>`)
    .join('')
  return `
    <div class="clarify__q" data-q="${i}">
      <div class="clarify__qtext">${escapeHtml(q.question)}</div>
      ${chips ? `<div class="chips">${chips}</div>` : ''}
      <input class="input clarify__custom" data-custom placeholder="${escapeHtml(t('guided.qCustom'))}">
    </div>`
}

function collectAnswers(root: HTMLElement, questions: ClarifyQuestion[]): Clarification[] {
  const out: Clarification[] = []
  root.querySelectorAll<HTMLElement>('.clarify__q').forEach((qEl) => {
    const idx = Number(qEl.dataset.q)
    const question = questions[idx]?.question
    if (!question) return
    const picked = Array.from(qEl.querySelectorAll<HTMLElement>('[data-opt].active')).map((c) =>
      (c.textContent ?? '').trim(),
    )
    const custom = qEl.querySelector<HTMLInputElement>('[data-custom]')?.value.trim()
    const parts = [...picked, custom].filter(Boolean) as string[]
    if (parts.length) out.push({ question, answer: parts.join('；') })
  })
  return out
}
