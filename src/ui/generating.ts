import { splitOutlineSegments, generateSegmentSlides, completeSlides } from '../llm/outline'
import { loadSettings, isConfigured, activeConfig, newDeckBranding } from '../llm/settings'
import { normalizeDeck, normalizeSlide } from '../render/normalize'
import { mountSlidePreview } from '../render/preview'
import { saveDeck } from '../store/db'
import { navigate } from '../router'
import { toast } from '../lib/toast'
import { escapeHtml } from '../lib/markdown'
import { clearDraft } from '../lib/draft'
import { t } from '../i18n'
import type { GenerateOptions, Outline } from '../types'

export interface GenerateHooks {
  /** The deck was saved and playback is opening — tear down whatever's beneath. */
  onDone?: () => void
  /** The user backed out (cancel, or dismissed a failure) — the caller's UI is
      still there underneath and should take over again. */
  onDismiss?: () => void
}

/**
 * Generate the full deck from the confirmed outline, then open the player.
 *
 * Generation is SEGMENTED (one call per 环节-sized chunk): a failed segment can
 * be retried without redoing finished pages, and every page pops into a live
 * thumbnail wall the moment its JSON closes in the stream — the generation is
 * the show, not a spinner.
 */
export function generateAndPlay(
  topic: string,
  opts: GenerateOptions,
  outline: Outline,
  hooks: GenerateHooks = {},
): void {
  const trimmed = topic.trim()
  const settings = loadSettings()
  if (!isConfigured(settings)) {
    toast(t('err.noKey'))
    navigate('#/settings')
    hooks.onDismiss?.()
    return
  }

  const segments = splitOutlineSegments(outline)
  const total = outline.slides.length
  const model = activeConfig(settings).model

  const el = document.createElement('div')
  el.className = 'overlay'
  el.innerHTML = `
    <div class="gen card gen--film" style="padding:28px">
      <h2>${t('gen.title')}</h2>
      <p data-progress>${t('gen.subtitle').replace('{topic}', escapeHtml(trimmed)).replace('{n}', String(total))}</p>
      <div class="gen-film" data-film>
        ${outline.slides
          .map(
            (s, i) => `
        <div class="gen-film__cell" data-cell="${i}" title="${escapeHtml(s.title)}">
          <div class="thumb gen-film__thumb" data-mount></div>
          <span class="gen-film__num">${i + 1}</span>
        </div>`,
          )
          .join('')}
      </div>
      <div data-err hidden></div>
      <div class="gen__actions" data-actions>
        <button class="btn btn--ghost" data-cancel>${t('common.cancel')}</button>
      </div>
    </div>`
  document.body.appendChild(el)

  const filmEl = el.querySelector<HTMLElement>('[data-film]')!
  const progressEl = el.querySelector<HTMLElement>('[data-progress]')!
  const errEl = el.querySelector<HTMLElement>('[data-err]')!
  const actionsEl = el.querySelector<HTMLElement>('[data-actions]')!

  let controller = new AbortController()
  const slides: Array<Record<string, unknown>> = [] // completed segments only
  let revealed = 0

  const dismiss = () => {
    controller.abort()
    el.remove()
    hooks.onDismiss?.()
  }
  el.querySelector('[data-cancel]')!.addEventListener('click', dismiss)

  const setProgress = () => {
    progressEl.textContent = t('gen.pageProgress')
      .replace('{x}', String(revealed))
      .replace('{n}', String(total))
  }

  /** Pop slide `index`'s thumbnail into the wall (idempotent per cell). */
  const reveal = (raw: unknown, index: number) => {
    const cell = filmEl.querySelector<HTMLElement>(`[data-cell="${index}"]`)
    if (!cell) return
    const norm = normalizeSlide(raw)
    if (!norm) return
    if (!cell.classList.contains('is-on')) {
      cell.classList.add('is-on')
      revealed++
      setProgress()
    }
    mountSlidePreview(cell.querySelector<HTMLElement>('[data-mount]')!, outline.theme, norm)
    cell.scrollIntoView({ block: 'nearest' })
  }

  const finish = () => {
    const deck = normalizeDeck(
      { title: outline.title, subtitle: outline.subtitle, theme: outline.theme, slides },
      { prompt: trimmed, model, theme: outline.theme },
    )
    deck.branding = newDeckBranding(settings)
    // Background images are fetched lazily in the player (non-blocking).
    void saveDeck(deck)
      .then(() => {
        clearDraft()
        el.remove()
        hooks.onDone?.()
        navigate(`#/play/${deck.id}`)
      })
      .catch(() => showError(segments.length - 1, t('lib.readError')))
  }

  const showError = (segIdx: number, msg: string) => {
    errEl.hidden = false
    errEl.innerHTML = `
      <h2 class="gen__error">${t('gen.segmentFailed').replace('{i}', String(segIdx + 1))}</h2>
      <p style="color:var(--text-muted)">${escapeHtml(msg)}</p>`
    actionsEl.innerHTML = `
      <button class="btn btn--ghost" data-back>${t('gen.backToOutline')}</button>
      <button class="btn btn--primary" data-retry>${t('gen.retrySegment')}</button>`
    actionsEl.querySelector('[data-back]')!.addEventListener('click', dismiss)
    actionsEl.querySelector('[data-retry]')!.addEventListener('click', () => {
      errEl.hidden = true
      errEl.innerHTML = ''
      actionsEl.innerHTML = `<button class="btn btn--ghost" data-cancel>${t('common.cancel')}</button>`
      actionsEl.querySelector('[data-cancel]')!.addEventListener('click', dismiss)
      void runFrom(segIdx)
    })
  }

  const runFrom = async (fromSeg: number) => {
    controller = new AbortController()
    let si = fromSeg
    try {
      for (; si < segments.length; si++) {
        const base = segments.slice(0, si).reduce((n, s) => n + s.length, 0)
        let seen = 0
        const segSlides = await generateSegmentSlides(
          trimmed,
          opts,
          outline,
          segments,
          si,
          slides.map((s) => String(s.title ?? '')),
          settings,
          {
            signal: controller.signal,
            onToken: (full) => {
              // Reveal each page the moment its JSON object closes.
              const parsed = completeSlides(full)
              for (; seen < parsed.length && seen < segments[si].length; seen++) {
                reveal(parsed[seen], base + seen)
              }
            },
          },
        )
        // Any pages not caught mid-stream (or padded from the outline).
        segSlides.forEach((s, k) => reveal(s, base + k))
        slides.push(...segSlides)
      }
      finish()
    } catch (err: unknown) {
      if (controller.signal.aborted) return
      showError(si, err instanceof Error ? err.message : String(err))
    }
  }

  setProgress()
  void runFrom(0)
}
