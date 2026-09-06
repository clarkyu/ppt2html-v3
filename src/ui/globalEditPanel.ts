// Whole-deck conversational edit, step 2 of 2: the panel. One instruction →
// planner (llm/globalEdit) → visible per-page plan the user confirms BEFORE
// tokens are spent → two-phase execution: rewrites/relayouts go one by one
// through the single-page pipeline and new pages are synthesized (per-page
// apply, cancel keeps finished pages), then drops, moves and inserts land in
// ONE local recompose that remounts the player. A successful relayout ALSO
// forces a remount even without structural ops — the section chrome
// (data-layout, ghost number, full-bleed bg layer) is baked per-layout at
// mount and an in-place .s swap would leave it stale. Undo restores the full
// pre-execution snapshot; cancelling mid-run keeps the panel open so undo
// stays reachable.

import type { Deck, Slide } from '../types'
import { planGlobalEdit, recomposeSlides, type GlobalEditOp } from '../llm/globalEdit'
import { regenerateSlide, relayoutSlide, generateNewSlide } from '../llm/edit'
import { loadSettings, isConfigured } from '../llm/settings'
import { LAYOUT_KEYS } from './editor'
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
  const s = deck.slides[op.page - 1]
  // big-number / quote pages routinely have no title — fall back like digest().
  const title = escapeHtml(String(s?.title ?? s?.value ?? s?.text ?? '').replace(/\*\*/g, '').slice(0, 20))
  const anchorRef = title ? `P${op.page}《${title}》` : `P${op.page}`
  // An add doesn't modify its anchor — say so in the HEADER, not just the
  // detail line, so a skimming user can't misread it as an edit of that page.
  const head = op.action === 'add' ? t('ge.addHead').replace('{a}', anchorRef) : `P${op.page} · ${title}`
  const detail =
    op.action === 'rewrite' || op.action === 'add'
      ? escapeHtml(op.instruction ?? '')
      : op.action === 'drop'
        ? `${t('ge.actDrop')}${op.instruction ? `：${escapeHtml(op.instruction)}` : ''}`
        : op.action === 'relayout'
          ? `${t('ge.actRelayout').replace('{layout}', op.layout ? t(LAYOUT_KEYS[op.layout]) : '')}${op.instruction ? `：${escapeHtml(op.instruction)}` : ''}`
          : t('ge.actMove').replace('{to}', String(op.to))
  return `<li><b>${head}</b><ul><li>${detail}</li></ul></li>`
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
  let running = false

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
  // While a run is in flight, the panel must stay open (it owns the undo
  // snapshot): backdrop clicks are inert, and the cancel button only ABORTS —
  // the run loop then reports what was already applied and reveals undo.
  wrap.addEventListener('click', (e) => {
    const onClose = !!(e.target as HTMLElement).closest('[data-ge-close]')
    if (e.target !== wrap && !onClose) return
    if (running) {
      if (onClose) controller?.abort()
      return
    }
    close()
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
      const res = await planGlobalEdit(deck, instruction, settings, controller.signal)
      if (!wrap.isConnected) return
      plan = res.ops
      planBtn.disabled = false
      const ignoredNote = res.ignored ? t('ge.ignored').replace('{n}', String(res.ignored)) : ''
      if (!plan.length) {
        // Distinguish "the AI found nothing to change" from "everything the
        // AI planned was disallowed" — blaming the instruction for the
        // latter sends the user down the wrong path.
        status.textContent = res.ignored ? t('ge.allIgnored') : t('ge.noOps')
        return
      }
      planEl.hidden = false
      planEl.innerHTML = plan.map((op) => opLine(deck, op)).join('')
      status.textContent = t('ge.planReady') + ignoredNote
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
    const signal = controller.signal
    running = true
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
    let lastErr = ''
    const step = (): number => rewritten + relaid + added + skipped + 1
    const halted = (): boolean => signal.aborted || !wrap.isConnected
    // Phase 1: in-place rewrites/relayouts — page indices are still the
    // original ones — then new-page synthesis (inserted later, so indices
    // stay stable throughout every LLM call).
    for (const op of inPlace) {
      if (halted()) break
      status.textContent = t('refine.busy').replace('{i}', String(step())).replace('{n}', String(llmTotal))
      try {
        const next =
          op.action === 'relayout'
            ? await relayoutSlide(deck, op.page - 1, op.layout!, op.instruction ?? '', settings, signal)
            : await regenerateSlide(deck, op.page - 1, op.instruction ?? '', settings, signal)
        if (halted()) break
        hooks.apply(op.page - 1, next)
        if (op.action === 'relayout') relaid++
        else rewritten++
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') break
        lastErr = (err as Error)?.message || ''
        skipped++ // one stubborn page must not sink the batch
      }
    }
    for (const op of adds) {
      if (halted()) break
      status.textContent = t('refine.busy').replace('{i}', String(step())).replace('{n}', String(llmTotal))
      try {
        op.slide = await generateNewSlide(deck, op.page - 1, op.instruction ?? '', settings, signal)
        added++
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') break
        lastErr = (err as Error)?.message || ''
        skipped++
      }
    }
    // Phase 2: drops + moves + inserts in one local recompose, then remount.
    // On abort the structural ops are NOT applied — but applied relayouts
    // still need the remount to rebuild their baked section chrome.
    const recomposeOps = signal.aborted ? [] : [...structural, ...adds.filter((o) => o.slide)]
    let structuralApplied = false
    if (recomposeOps.length) {
      hooks.applyStructure(recomposeSlides(deck.slides, recomposeOps))
      structuralApplied = true
    } else if (relaid > 0) {
      hooks.applyStructure([...deck.slides])
    }
    running = false
    if (!wrap.isConnected) return
    const applied =
      rewritten + relaid + (structuralApplied ? structural.length + adds.filter((o) => o.slide).length : 0)
    if (signal.aborted) {
      status.textContent = t('ge.aborted').replace('{k}', String(rewritten + relaid))
    } else {
      // Surface the last error alongside the counts — "跳过 N 页" alone reads
      // as "the AI had nothing better", not "my key/quota/network broke".
      status.textContent =
        t('ge.doneV3')
          .replace('{x}', String(rewritten))
          .replace('{r}', String(relaid))
          .replace('{a}', String(structuralApplied ? adds.filter((o) => o.slide).length : 0))
          .replace('{d}', String(structuralApplied ? structural.filter((o) => o.action === 'drop').length : 0))
          .replace('{m}', String(structuralApplied ? structural.filter((o) => o.action === 'move').length : 0))
          .replace('{y}', String(skipped)) + (skipped > 0 && lastErr ? `（${lastErr}）` : '')
    }
    runBtn.hidden = true
    undoBtn.hidden = applied === 0 // nothing changed → nothing to undo
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
