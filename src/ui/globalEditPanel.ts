// Whole-deck conversational edit, step 2 of 2: the panel. One instruction →
// planner (llm/globalEdit) → visible per-page plan the user confirms BEFORE
// tokens are spent → two-phase execution: rewrites/relayouts go one by one
// through the single-page pipeline and new pages are synthesized (per-page
// apply, cancel keeps finished pages), then drops, moves and inserts land in
// ONE local recompose that remounts the player. Undo restores the full
// pre-execution snapshot.

import type { Deck, Slide } from '../types'
import { planGlobalEdit, recomposeSlides, type GlobalEditOp } from '../llm/globalEdit'
import { regenerateSlide, relayoutSlide, generateNewSlide } from '../llm/edit'
import { loadSettings, isConfigured } from '../llm/settings'
import { t } from '../i18n'
import { toast } from '../lib/toast'
import { navigate } from '../router'
import { escapeHtml } from '../lib/markdown'

export interface GlobalEditHooks {
  /** Swap ONE slide in place (content rewrite — no page-number changes). */
  apply: (index: number, slide: Slide) => void
  /** Replace the whole slide array (drops/reorders) — persists and remounts. */
  applyStructure: (slides: Slide[]) => void
}

function opLine(deck: Deck, op: GlobalEditOp): string {
  const title = escapeHtml(String(deck.slides[op.page - 1]?.title ?? '').replace(/\*\*/g, '').slice(0, 20))
  const detail =
    op.action === 'rewrite'
      ? escapeHtml(op.instruction ?? '')
      : op.action === 'drop'
        ? `${t('ge.actDrop')}${op.instruction ? `：${escapeHtml(op.instruction)}` : ''}`
        : op.action === 'add'
          ? `${t('ge.actAdd')}：${escapeHtml(op.instruction ?? '')}`
          : op.action === 'relayout'
            ? `${t('ge.actRelayout').replace('{layout}', op.layout ?? '')}${op.instruction ? `：${escapeHtml(op.instruction)}` : ''}`
            : t('ge.actMove').replace('{to}', String(op.to))
  return `<li><b>P${op.page} · ${title}</b><ul><li>${detail}</li></ul></li>`
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
      planEl.innerHTML = plan.map((op) => opLine(deck, op)).join('')
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
    snapshot = structuredClone(deck.slides)
    const inPlace = plan.filter((op) => op.action === 'rewrite' || op.action === 'relayout')
    const adds = plan.filter((op) => op.action === 'add')
    const structural = plan.filter((op) => op.action === 'drop' || op.action === 'move')
    const llmTotal = inPlace.length + adds.length
    let rewritten = 0
    let relaid = 0
    let added = 0
    let skipped = 0
    const step = (): number => rewritten + relaid + added + skipped + 1
    // Phase 1: in-place rewrites/relayouts — page indices are still the
    // original ones — then new-page synthesis (inserted later, so indices
    // stay stable throughout every LLM call).
    for (const op of inPlace) {
      if (controller.signal.aborted || !wrap.isConnected) return
      status.textContent = t('refine.busy').replace('{i}', String(step())).replace('{n}', String(llmTotal))
      try {
        const next =
          op.action === 'relayout'
            ? await relayoutSlide(deck, op.page - 1, op.layout!, op.instruction ?? '', settings, controller.signal)
            : await regenerateSlide(deck, op.page - 1, op.instruction ?? '', settings, controller.signal)
        if (!wrap.isConnected) return
        hooks.apply(op.page - 1, next)
        if (op.action === 'relayout') relaid++
        else rewritten++
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return
        skipped++ // one stubborn page must not sink the batch
      }
    }
    for (const op of adds) {
      if (controller.signal.aborted || !wrap.isConnected) return
      status.textContent = t('refine.busy').replace('{i}', String(step())).replace('{n}', String(llmTotal))
      try {
        op.slide = await generateNewSlide(deck, op.page - 1, op.instruction ?? '', settings, controller.signal)
        added++
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return
        skipped++
      }
    }
    // Phase 2: drops + moves + inserts in one local recompose, then remount.
    const recomposeOps = [...structural, ...adds.filter((o) => o.slide)]
    if (recomposeOps.length && wrap.isConnected && !controller.signal.aborted) {
      hooks.applyStructure(recomposeSlides(deck.slides, recomposeOps))
    }
    status.textContent = t('ge.doneV3')
      .replace('{x}', String(rewritten))
      .replace('{r}', String(relaid))
      .replace('{a}', String(added))
      .replace('{d}', String(structural.filter((o) => o.action === 'drop').length))
      .replace('{m}', String(structural.filter((o) => o.action === 'move').length))
      .replace('{y}', String(skipped))
    runBtn.hidden = true
    undoBtn.hidden = false
    closeBtn.textContent = t('common.gotIt')
  }

  planBtn.addEventListener('click', () => void makePlan())
  runBtn.addEventListener('click', () => void run())
  input.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void makePlan()
  })
  // Undo restores the full pre-execution snapshot (covers rewrites AND
  // structure; goes through applyStructure so the player rebuilds cleanly).
  undoBtn.addEventListener('click', () => {
    hooks.applyStructure(structuredClone(snapshot))
    toast(t('rw.undone'))
    close()
  })
  input.focus()

  return close
}
