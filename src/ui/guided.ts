import { generateClarifyingQuestions, DEFAULT_QUESTIONS } from '../llm/clarify'
import { loadSettings, saveSettings, type LlmSettings, type Provider } from '../llm/settings'
import { MODEL_PRESETS, modelChoicesFor, presetFor } from '../llm/models'
import { startStructure } from './structure'
import { navigate } from '../router'
import { toast } from '../lib/toast'
import { escapeHtml } from '../lib/markdown'
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
    toast('请先输入一句话主题')
    return
  }
  const initial = loadSettings()
  if (!initial.anthropic.apiKey.trim() && !initial.openai.apiKey.trim()) {
    toast('请先在「设置」中填写 API Key')
    navigate('#/settings')
    return
  }

  const el = document.createElement('div')
  el.className = 'overlay'
  el.innerHTML = `<div class="clarify card"><div data-body></div></div>`
  document.body.appendChild(el)
  const body = el.querySelector<HTMLElement>('[data-body]')!
  let removed = false
  const close = () => {
    removed = true
    prefetch?.controller.abort()
    el.remove()
  }

  let prefetch: Prefetch | null = null
  let touched = false

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

  /* ----------------------------- step 1: model ----------------------------- */

  const showModel = () => {
    const draft = loadSettings()
    // Default to a provider that actually has a key configured.
    if (!draft[draft.provider].apiKey.trim()) {
      draft.provider = draft.anthropic.apiKey.trim() ? 'anthropic' : 'openai'
    }
    // Kick off the clarifying-questions request now so it overlaps this step.
    startPrefetch(draft)

    body.innerHTML = `
      <div class="clarify__head">
        <h2>选择生成模型</h2>
        <p>「${escapeHtml(trimmed)}」——先确认用哪个模型生成，可随时在「设置」里更改。</p>
      </div>
      <div class="modelpick">
        <div class="modelpick__row">
          <span class="modelpick__label">服务</span>
          <div class="seg" data-seg>
            <button type="button" data-provider="anthropic">Claude</button>
            <button type="button" data-provider="openai">OpenAI 兼容</button>
          </div>
        </div>
        <div class="modelpick__row">
          <span class="modelpick__label">预设</span>
          <div class="chips modelpick__presets" data-presets>
            ${MODEL_PRESETS.map((p, i) => `<button type="button" class="chip" data-preset="${i}">${p.label}</button>`).join('')}
          </div>
        </div>
        <div class="modelpick__row">
          <span class="modelpick__label">模型</span>
          <select class="select modelpick__model" data-model></select>
        </div>
        <div class="modelpick__note" data-note></div>
      </div>
      <div class="clarify__actions">
        <button class="btn btn--ghost" data-settings>更多设置</button>
        <div class="clarify__actions-right">
          <button class="btn btn--ghost" data-cancel>取消</button>
          <button class="btn btn--primary" data-go>开始 →</button>
        </div>
      </div>`

    const segBtns = body.querySelectorAll<HTMLButtonElement>('[data-provider]')
    const modelSel = body.querySelector<HTMLSelectElement>('[data-model]')!
    const noteEl = body.querySelector<HTMLElement>('[data-note]')!
    const goBtn = body.querySelector<HTMLButtonElement>('[data-go]')!

    const paint = () => {
      const cfg = draft[draft.provider]
      const hasKey = cfg.apiKey.trim().length > 0
      segBtns.forEach((b) => b.classList.toggle('active', b.dataset.provider === draft.provider))

      const activePreset = presetFor(draft.provider, cfg.baseUrl)
      body.querySelectorAll<HTMLElement>('[data-preset]').forEach((chip) => {
        chip.classList.toggle('active', MODEL_PRESETS[Number(chip.dataset.preset)] === activePreset)
      })

      const choices = modelChoicesFor(draft.provider, cfg.baseUrl, cfg.model)
      if (!cfg.model || !choices.includes(cfg.model)) cfg.model = choices[0]
      modelSel.innerHTML = choices
        .map((m) => `<option value="${escapeHtml(m)}"${m === cfg.model ? ' selected' : ''}>${escapeHtml(m)}</option>`)
        .join('')

      noteEl.textContent = hasKey
        ? `将使用 ${hostOf(cfg.baseUrl)} 上的 ${cfg.model}`
        : '⚠ 该服务尚未配置 API Key，请点「更多设置」填写后再生成。'
      noteEl.classList.toggle('modelpick__note--warn', !hasKey)
      goBtn.disabled = !hasKey
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

    body.querySelector('[data-settings]')!.addEventListener('click', () => {
      close()
      navigate('#/settings')
    })
    body.querySelector('[data-cancel]')!.addEventListener('click', close)
    goBtn.addEventListener('click', () => {
      if (!draft[draft.provider].apiKey.trim()) {
        toast('该服务尚未配置 API Key')
        return
      }
      saveSettings(draft)
      // If the provider changed vs. what we prefetched with, redo the prefetch.
      if (!prefetch || prefetch.provider !== draft.provider) startPrefetch(draft)
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
    showQuestions(DEFAULT_QUESTIONS, true)
    pf?.promise
      .then((q) => {
        if (removed || touched || !q.length) return
        showQuestions(q, false)
      })
      .catch(() => {
        /* keep the defaults — they are perfectly usable */
      })
  }

  const showQuestions = (questions: ClarifyQuestion[], provisional: boolean) => {
    body.innerHTML = `
      <div class="clarify__head">
        <h2>回答 1~2 个关键问题</h2>
        <p>帮我把课件方向定准——选一选或补充即可，可跳过。下一步会先跟你确认整体结构。</p>
      </div>
      ${provisional ? `<div class="clarify__loading">正在按主题优化建议…</div>` : ''}
      <div class="clarify__list">
        ${questions.map(renderQuestion).join('')}
      </div>
      <div class="clarify__actions">
        <button class="btn btn--ghost" data-skip>跳过，看整体结构</button>
        <div class="clarify__actions-right">
          <button class="btn btn--ghost" data-cancel>取消</button>
          <button class="btn btn--primary" data-go>下一步 →</button>
        </div>
      </div>`

    // Any interaction locks the current questions in (no live swap after this).
    const list = body.querySelector<HTMLElement>('.clarify__list')!
    const markTouched = () => (touched = true)
    list.addEventListener('click', (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-opt]')
      if (chip) chip.classList.toggle('active')
      markTouched()
    })
    list.addEventListener('input', markTouched)

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

  showModel()
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function renderQuestion(q: ClarifyQuestion, i: number): string {
  const chips = (q.options ?? [])
    .map((o) => `<button type="button" class="chip" data-opt>${escapeHtml(o)}</button>`)
    .join('')
  return `
    <div class="clarify__q" data-q="${i}">
      <div class="clarify__qtext">${escapeHtml(q.question)}</div>
      ${chips ? `<div class="chips">${chips}</div>` : ''}
      <input class="input clarify__custom" data-custom placeholder="补充说明（可选）">
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
