// Whole-deck conversational edit, step 2 of 2: the panel. One instruction →
// planner (llm/globalEdit) → visible per-page plan the user confirms BEFORE
// tokens are spent on rewrites → sequential batch through regenerateSlide
// (per-page apply, cancel keeps finished pages) → done report + undo-all.
// Overlay shell reuses the share/refine panel styles.

import type { Deck, Slide } from '../types'
import { planGlobalEdit, type GlobalEditOp } from '../llm/globalEdit'
import { regenerateSlide } from '../llm/edit'
import { loadSettings, isConfigured } from '../llm/settings'
import { t } from '../i18n'
import { toast } from '../lib/toast'
import { navigate } from '../router'
import { escapeHtml } from '../lib/markdown'

export interface GlobalEditHooks {
  /** Swap a slide into the deck + live player; called per page and for undo. */
  apply: (index: number, slide: Slide) => void
}

export function openGlobalEditPanel(host: HTMLElement, deck: Deck, hooks: GlobalEditHooks): () => void {
  host.querySelector('.gedit')?.remove()
  const settings = loadSettings()
  if (!isConfigured(settings)) {
    toast(t('err.noKey'))
    navigate('#/settings')
    return () => {}
  }
  let controller: AbortController | null = null
  let plan: GlobalEditOp[] = []
  let snapshot: Slide[] = []

  const wrap = document.createElement('div')
  wrap.className = 'sharepanel gedit'
  wrap.innerHTML = `
    <div class="sharepanel__card">
      <h3>${t('ge.title')}</h3>
      <p class="sharepanel__hint">${t('ge.hint')}</p>
      <textarea class="form-input rewritepanel__input" data-ge-input rows="3"
        placeholder="${escapeHtml(t('ge.placeholder'))}"></textarea>
      <ol class="refinepanel__list" data-ge-plan hidden></ol>
      <p class="rewritepanel__status" data-ge-status hidden></p>
      <div class="sharepanel__actions">
        <button class="btn btn--primary btn--sm" data-ge-plan-btn>${t('ge.planBtn')}</button>
        <button class="btn btn--primary btn--sm" data-ge-run hidden></button>
        <button class="btn btn--sm" data-ge-undo hidden>${t('refine.undoAll')}</button>
        <button class="btn btn--sm" data-ge-close>${t('common.cancel')}</button>
      </div>
    </div>`
  host.appendChild(wrap)
  const close = (): void => {
    controller?.abort()
    wrap.remove()
  }
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || (e.target as HTMLElement).closest('[data-ge-close]')) close()
  })

  const input = wrap.querySelector<HTMLTextAreaElement>('[data-ge-input]')!
  const planEl = wrap.querySelector<HTMLElement>('[data-ge-plan]')!
  const status = wrap.querySelector<HTMLElement>('[data-ge-status]')!
  const planBtn = wrap.querySelector<HTMLButtonElement>('[data-ge-plan-btn]')!
  const runBtn = wrap.querySelector<HTMLButtonElement>('[data-ge-run]')!
  const undoBtn = wrap.querySelector<HTMLButtonElement>('[data-ge-undo]')!
  const closeBtn = wrap.querySelector<HTMLButtonElement>('[data-ge-close]')!

  const makePlan = async (): Promise<void> => {
    const instruction = input.value.trim()
    if (!instruction) {
      input.focus()
      return
    }
    controller?.abort()
    controller = new AbortController()
    planBtn.disabled = true
    runBtn.hidden = true
    planEl.hidden = true
    status.hidden = false
    status.textContent = t('ge.planning')
    try {
      plan = await planGlobalEdit(deck, instruction, settings, controller.signal)
      if (!wrap.isConnected) return
      planBtn.disabled = false
      if (!plan.length) {
        status.textContent = t('ge.noOps')
        return
      }
      planEl.hidden = false
      planEl.innerHTML = plan
        .map(
          (op) => `<li><b>P${op.page} · ${escapeHtml(String(deck.slides[op.page - 1]?.title ?? '').replace(/\*\*/g, '').slice(0, 20))}</b>
            <ul><li>${escapeHtml(op.instruction)}</li></ul></li>`,
        )
        .join('')
      status.textContent = t('ge.planReady')
      runBtn.hidden = false
      runBtn.textContent = t('ge.run').replace('{n}', String(plan.length))
      planBtn.textContent = t('ge.replan') // instruction editable → plan again
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return
      if (!wrap.isConnected) return
      status.textContent = (err as Error)?.message || t('err.modelError')
      planBtn.disabled = false
    }
  }

  const run = async (): Promise<void> => {
    controller?.abort()
    controller = new AbortController()
    runBtn.disabled = true
    planBtn.hidden = true
    input.disabled = true
    snapshot = plan.map((op) => structuredClone(deck.slides[op.page - 1]))
    let done = 0
    let skipped = 0
    for (const op of plan) {
      if (controller.signal.aborted || !wrap.isConnected) return
      status.textContent = t('refine.busy').replace('{i}', String(done + skipped + 1)).replace('{n}', String(plan.length))
      try {
        const next = await regenerateSlide(deck, op.page - 1, op.instruction, settings, controller.signal)
        if (!wrap.isConnected) return
        hooks.apply(op.page - 1, next)
        done++
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return
        skipped++ // one stubborn page must not sink the batch
      }
    }
    status.textContent = t('refine.done').replace('{x}', String(done)).replace('{y}', String(skipped))
    runBtn.hidden = true
    undoBtn.hidden = false
    closeBtn.textContent = t('common.gotIt')
  }

  planBtn.addEventListener('click', () => void makePlan())
  runBtn.addEventListener('click', () => void run())
  input.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void makePlan()
  })
  undoBtn.addEventListener('click', () => {
    plan.forEach((op, k) => {
      if (snapshot[k]) hooks.apply(op.page - 1, structuredClone(snapshot[k]))
    })
    toast(t('rw.undone'))
    close()
  })
  input.focus()

  return close
}
