// In-player AI rewrite: a lightweight overlay that rewords the CURRENT slide
// from one instruction — the phone-sized alternative to the full editor (whose
// per-field forms are hopeless on a small screen). The LLM call is the
// editor's regenerateSlide (layout/background are pinned there); this panel
// only owns the input → busy → done/undo states and cancellation.

import type { Deck, Slide } from '../types'
import { regenerateSlide } from '../llm/edit'
import { loadSettings, isConfigured } from '../llm/settings'
import { t } from '../i18n'
import { toast } from '../lib/toast'
import { navigate } from '../router'
import { escapeHtml } from '../lib/markdown'

export interface RewriteHooks {
  /** Swap a slide into the deck + live player; called for apply AND undo. */
  apply: (index: number, slide: Slide) => void
}

export function openRewritePanel(host: HTMLElement, deck: Deck, index: number, hooks: RewriteHooks): () => void {
  host.querySelector('.rewritepanel')?.remove()
  const settings = loadSettings()
  if (!isConfigured(settings)) {
    toast(t('err.noKey'))
    navigate('#/settings')
    return () => {}
  }
  const slide = deck.slides[index]
  if (!slide) return () => {}
  const before = structuredClone(slide)
  let controller: AbortController | null = null

  const wrap = document.createElement('div')
  // Reuses the share panel's overlay/card layout styles.
  wrap.className = 'sharepanel rewritepanel'
  wrap.innerHTML = `
    <div class="sharepanel__card">
      <h3>${t('rw.title').replace('{n}', String(index + 1))}</h3>
      <p class="sharepanel__hint">${t('rw.hint')}</p>
      <textarea class="form-input rewritepanel__input" data-rw-input rows="3"
        placeholder="${escapeHtml(t('rw.placeholder'))}"></textarea>
      <p class="rewritepanel__status" data-rw-status hidden></p>
      <div class="sharepanel__actions">
        <button class="btn btn--primary btn--sm" data-rw-go>${t('rw.go')}</button>
        <button class="btn btn--sm" data-rw-undo hidden>${t('rw.undo')}</button>
        <button class="btn btn--sm" data-rw-close>${t('common.cancel')}</button>
      </div>
    </div>`
  host.appendChild(wrap)
  const close = (): void => {
    controller?.abort()
    wrap.remove()
  }
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || (e.target as HTMLElement).closest('[data-rw-close]')) close()
  })

  const input = wrap.querySelector<HTMLTextAreaElement>('[data-rw-input]')!
  const status = wrap.querySelector<HTMLElement>('[data-rw-status]')!
  const goBtn = wrap.querySelector<HTMLButtonElement>('[data-rw-go]')!
  const undoBtn = wrap.querySelector<HTMLButtonElement>('[data-rw-undo]')!
  const closeBtn = wrap.querySelector<HTMLButtonElement>('[data-rw-close]')!

  const run = async (): Promise<void> => {
    const instruction = input.value.trim()
    if (!instruction) {
      input.focus()
      return
    }
    controller?.abort()
    controller = new AbortController()
    goBtn.disabled = true
    status.hidden = false
    status.textContent = t('rw.busy')
    try {
      const next = await regenerateSlide(deck, index, instruction, settings, controller.signal)
      // Panel may have been dismissed (or replaced by another overlay) while
      // the model was thinking — a closed panel means "never mind".
      if (!wrap.isConnected) return
      hooks.apply(index, next)
      status.textContent = t('rw.done')
      goBtn.disabled = false
      goBtn.textContent = t('rw.again')
      undoBtn.hidden = false
      closeBtn.textContent = t('common.gotIt')
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return
      if (!wrap.isConnected) return
      status.textContent = (err as Error)?.message || t('err.modelError')
      goBtn.disabled = false
    }
  }
  goBtn.addEventListener('click', () => void run())
  input.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void run()
  })
  // Undo restores the pre-panel snapshot (covers multi-round rewrites too).
  undoBtn.addEventListener('click', () => {
    hooks.apply(index, structuredClone(before))
    toast(t('rw.undone'))
    close()
  })
  input.focus()

  return close
}
