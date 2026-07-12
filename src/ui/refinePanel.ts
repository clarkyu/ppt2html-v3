// Refine pass: mechanical checks (lib/quality) locate defective pages for
// free, then ONLY those pages go to regenerateSlide with a targeted critique.
// Flow: scan report → user confirms → sequential batch rewrite (cancelable,
// per-page apply so an abort keeps finished pages) → done report with a
// whole-deck undo. Overlay shell reuses the share panel styles.

import type { Deck, Slide } from '../types'
import { deckIssues, refineInstruction } from '../lib/quality'
import { regenerateSlide } from '../llm/edit'
import { loadSettings, isConfigured } from '../llm/settings'
import { t } from '../i18n'
import { toast } from '../lib/toast'
import { navigate } from '../router'
import { escapeHtml } from '../lib/markdown'

export interface RefineHooks {
  /** Swap a slide into the deck + live player; called per page and for undo. */
  apply: (index: number, slide: Slide) => void
}

export function openRefinePanel(host: HTMLElement, deck: Deck, hooks: RefineHooks): () => void {
  host.querySelector('.refinepanel')?.remove()
  const settings = loadSettings()
  if (!isConfigured(settings)) {
    toast(t('err.noKey'))
    navigate('#/settings')
    return () => {}
  }
  const found = deckIssues(deck)
  const before = structuredClone(deck.slides)
  let controller: AbortController | null = null

  const wrap = document.createElement('div')
  wrap.className = 'sharepanel refinepanel'
  const listHtml = found
    .map(
      (f) => `
      <li>
        <b>P${f.index + 1} · ${escapeHtml(f.title.slice(0, 24))}</b>
        <ul>${f.issues.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
      </li>`,
    )
    .join('')
  wrap.innerHTML = `
    <div class="sharepanel__card">
      <h3>${t('refine.title')}</h3>
      ${
        found.length
          ? `<p class="sharepanel__hint">${t('refine.found')
              .replace('{n}', String(found.length))
              .replace('{m}', String(found.reduce((a, f) => a + f.issues.length, 0)))}</p>
             <ol class="refinepanel__list" data-rf-list>${listHtml}</ol>
             <p class="rewritepanel__status" data-rf-status hidden></p>`
          : `<p class="sharepanel__hint">${t('refine.clean')}</p>`
      }
      <div class="sharepanel__actions">
        ${found.length ? `<button class="btn btn--primary btn--sm" data-rf-go>${t('refine.go').replace('{n}', String(found.length))}</button>` : ''}
        <button class="btn btn--sm" data-rf-undo hidden>${t('refine.undoAll')}</button>
        <button class="btn btn--sm" data-rf-close>${found.length ? t('common.cancel') : t('common.gotIt')}</button>
      </div>
    </div>`
  host.appendChild(wrap)
  const close = (): void => {
    controller?.abort()
    wrap.remove()
  }
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || (e.target as HTMLElement).closest('[data-rf-close]')) close()
  })
  if (!found.length) return close

  const status = wrap.querySelector<HTMLElement>('[data-rf-status]')!
  const goBtn = wrap.querySelector<HTMLButtonElement>('[data-rf-go]')!
  const undoBtn = wrap.querySelector<HTMLButtonElement>('[data-rf-undo]')!
  const closeBtn = wrap.querySelector<HTMLButtonElement>('[data-rf-close]')!

  const run = async (): Promise<void> => {
    controller = new AbortController()
    goBtn.disabled = true
    status.hidden = false
    let done = 0
    let skipped = 0
    for (const f of found) {
      if (controller.signal.aborted || !wrap.isConnected) return
      status.textContent = t('refine.busy')
        .replace('{i}', String(done + skipped + 1))
        .replace('{n}', String(found.length))
      try {
        const next = await regenerateSlide(deck, f.index, refineInstruction(f.issues), settings, controller.signal)
        if (!wrap.isConnected) return
        hooks.apply(f.index, next)
        done++
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return
        skipped++ // one stubborn page must not sink the batch
      }
    }
    status.textContent = t('refine.done').replace('{x}', String(done)).replace('{y}', String(skipped))
    goBtn.hidden = true
    undoBtn.hidden = false
    closeBtn.textContent = t('common.gotIt')
  }
  goBtn.addEventListener('click', () => void run())
  // Undo restores the pre-refine snapshot for every touched page.
  undoBtn.addEventListener('click', () => {
    for (const f of found) hooks.apply(f.index, structuredClone(before[f.index]))
    toast(t('rw.undone'))
    close()
  })
  return close
}
