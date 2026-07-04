import { generateClarifyingQuestions } from '../llm/clarify'
import { loadSettings, isConfigured } from '../llm/settings'
import { generateAndPlay } from './generating'
import { navigate } from '../router'
import { toast } from '../lib/toast'
import { escapeHtml } from '../lib/markdown'
import type { ClarifyQuestion, Clarification, GenerateOptions } from '../types'

/**
 * Entry point from Home: ask the model a few clarifying questions, let the user
 * answer/skip, then generate the deck with those answers folded in.
 */
export function startGuidedGeneration(topic: string, opts: GenerateOptions): void {
  const trimmed = topic.trim()
  if (!trimmed) {
    toast('请先输入一句话主题')
    return
  }
  if (!isConfigured(loadSettings())) {
    toast('请先在「设置」中填写 API Key')
    navigate('#/settings')
    return
  }

  const el = document.createElement('div')
  el.className = 'overlay'
  el.innerHTML = `<div class="clarify card"><div data-body></div></div>`
  document.body.appendChild(el)
  const body = el.querySelector<HTMLElement>('[data-body]')!
  const close = () => el.remove()

  let controller = new AbortController()

  const showLoading = () => {
    body.innerHTML = `
      <div class="gen" style="padding:8px">
        <div class="gen__spinner"></div>
        <h2>正在准备引导问题…</h2>
        <p>「${escapeHtml(trimmed)}」</p>
        <div class="gen__actions"><button class="btn btn--ghost" data-cancel>取消</button></div>
      </div>`
    body.querySelector('[data-cancel]')!.addEventListener('click', () => {
      controller.abort()
      close()
    })
  }

  const showError = (msg: string) => {
    body.innerHTML = `
      <div class="gen" style="padding:8px">
        <h2 class="gen__error">引导问题生成失败</h2>
        <p style="color:var(--text-muted)">${escapeHtml(msg)}</p>
        <div class="gen__actions">
          <button class="btn btn--ghost" data-skip>跳过，直接生成</button>
          <button class="btn btn--primary" data-retry>重试</button>
        </div>
      </div>`
    body.querySelector('[data-skip]')!.addEventListener('click', () => {
      close()
      generateAndPlay(trimmed, opts)
    })
    body.querySelector('[data-retry]')!.addEventListener('click', () => {
      controller = new AbortController()
      run()
    })
  }

  const showQuestions = (questions: ClarifyQuestion[]) => {
    body.innerHTML = `
      <div class="clarify__head">
        <h2>先聊两句，让课件更贴合你的需求</h2>
        <p>点选建议或自行补充，答完点「开始生成」——每一项都可留空跳过。</p>
      </div>
      <div class="clarify__list">
        ${questions.map(renderQuestion).join('')}
      </div>
      <div class="clarify__actions">
        <button class="btn btn--ghost" data-skip>跳过引导，直接生成</button>
        <div class="clarify__actions-right">
          <button class="btn btn--ghost" data-cancel>取消</button>
          <button class="btn btn--primary" data-go>开始生成 →</button>
        </div>
      </div>`

    // Toggle option chips (multi-select).
    body.querySelector('.clarify__list')!.addEventListener('click', (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-opt]')
      if (chip) chip.classList.toggle('active')
    })

    body.querySelector('[data-cancel]')!.addEventListener('click', close)
    body.querySelector('[data-skip]')!.addEventListener('click', () => {
      close()
      generateAndPlay(trimmed, opts)
    })
    body.querySelector('[data-go]')!.addEventListener('click', () => {
      const clarifications = collectAnswers(body, questions)
      close()
      generateAndPlay(trimmed, { ...opts, clarifications })
    })
  }

  const run = () => {
    showLoading()
    generateClarifyingQuestions(trimmed, opts, loadSettings(), controller.signal)
      .then((questions) => {
        if (controller.signal.aborted) return
        if (!questions.length) {
          // Nothing to ask — go straight to generation.
          close()
          generateAndPlay(trimmed, opts)
          return
        }
        showQuestions(questions)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        showError(err instanceof Error ? err.message : String(err))
      })
  }

  run()
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
