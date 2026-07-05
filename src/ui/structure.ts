import { generateStructure } from '../llm/outline'
import { loadSettings, isConfigured } from '../llm/settings'
import { startPageOutline } from './outline'
import { navigate } from '../router'
import { toast } from '../lib/toast'
import { icons } from '../lib/icons'
import { escapeHtml } from '../lib/markdown'
import { t } from '../i18n'
import type { GenerateOptions, Section, Structure, ThemeName } from '../types'

const THEME_LABELS: Array<{ value: ThemeName; key: string }> = [
  { value: 'aurora', key: 'theme.aurora' },
  { value: 'ink', key: 'theme.ink' },
  { value: 'sunrise', key: 'theme.sunrise' },
  { value: 'forest', key: 'theme.forest' },
  { value: 'noir', key: 'theme.noir' },
  { value: 'sand', key: 'theme.sand' },
  { value: 'rose', key: 'theme.rose' },
]

/**
 * Step 1 of outlining: plan the deck's overall structure (a few parts, each
 * with an estimated page count / duration) plus a one-line restatement of the
 * user's intent, let the user confirm/edit, then move on to per-part detailing.
 */
export function startStructure(topic: string, opts: GenerateOptions): void {
  const trimmed = topic.trim()
  if (!trimmed) {
    toast(t('err.noTopic'))
    return
  }
  if (!isConfigured(loadSettings())) {
    toast(t('err.noKey'))
    navigate('#/settings')
    return
  }

  const minutes = opts.durationMinutes

  const el = document.createElement('div')
  el.className = 'overlay'
  el.innerHTML = `<div class="outline card"><div data-body></div></div>`
  document.body.appendChild(el)
  const body = el.querySelector<HTMLElement>('[data-body]')!
  const close = () => el.remove()
  let controller = new AbortController()

  const showLoading = () => {
    body.innerHTML = `
      <div class="gen" style="padding:8px">
        <div class="gen__spinner"></div>
        <h2>${t('struct.loading')}</h2>
        <p>「${escapeHtml(trimmed)}」</p>
        <div class="gen__actions"><button class="btn btn--ghost" data-cancel>${t('common.cancel')}</button></div>
      </div>`
    body.querySelector('[data-cancel]')!.addEventListener('click', () => {
      controller.abort()
      close()
    })
  }

  const showError = (msg: string) => {
    body.innerHTML = `
      <div class="gen" style="padding:8px">
        <h2 class="gen__error">${t('struct.failed')}</h2>
        <p style="color:var(--text-muted)">${escapeHtml(msg)}</p>
        <div class="gen__actions">
          <button class="btn btn--ghost" data-cancel>${t('common.close')}</button>
          <button class="btn btn--primary" data-retry>${t('common.retry')}</button>
        </div>
      </div>`
    body.querySelector('[data-cancel]')!.addEventListener('click', close)
    body.querySelector('[data-retry]')!.addEventListener('click', () => {
      controller = new AbortController()
      run()
    })
  }

  let rich = opts.richContent ?? true

  const showEditor = (structure: Structure) => {
    body.innerHTML = renderEditor(structure, rich)
    wireEditor(body, minutes, {
      onCancel: close,
      onRegen: () => {
        rich = body.querySelector<HTMLInputElement>('[data-rich]')?.checked ?? rich
        controller = new AbortController()
        run()
      },
      onNext: () => {
        const edited = collectStructure(body, trimmed)
        if (!edited.sections.length) {
          toast(t('struct.keepOne'))
          return
        }
        rich = body.querySelector<HTMLInputElement>('[data-rich]')?.checked ?? rich
        close()
        startPageOutline(trimmed, { ...opts, understanding: edited.understanding, richContent: rich }, edited)
      },
    })
  }

  const run = () => {
    showLoading()
    generateStructure(trimmed, opts, loadSettings(), controller.signal)
      .then((structure) => {
        if (!controller.signal.aborted) showEditor(structure)
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) showError(err instanceof Error ? err.message : String(err))
      })
  }

  run()
}

/* ------------------------------ rendering ------------------------------ */

function renderSecRow(s: Section): string {
  return `
    <li class="ol-row sec-row" data-row data-fam="structure">
      <div class="ol-row__index" data-index></div>
      <div class="ol-row__content">
        <div class="ol-row__top">
          <input class="ol-row__title" data-title value="${escapeHtml(s.title)}" placeholder="${escapeHtml(t('struct.partTitle'))}">
          <div class="sec-row__budget" title="${escapeHtml(t('struct.partPages'))}">
            <button class="sec-row__step" data-dec type="button" tabindex="-1">−</button>
            <input class="sec-row__pages" type="number" min="1" max="15" data-pages value="${s.pages ?? 3}">
            <button class="sec-row__step" data-inc type="button" tabindex="-1">+</button>
            <span class="sec-row__unit">${t('unit.pages')}</span>
            <span class="sec-row__time" data-time></span>
          </div>
          <div class="ol-row__ops">
            <button class="icon-btn" data-up title="${escapeHtml(t('common.moveUp'))}">${icons.up}</button>
            <button class="icon-btn" data-down title="${escapeHtml(t('common.moveDown'))}">${icons.down}</button>
            <button class="icon-btn" data-del title="${escapeHtml(t('lib.action.delete'))}">${icons.trash}</button>
          </div>
        </div>
        <input class="ol-row__brief" data-brief value="${escapeHtml(s.brief ?? '')}" placeholder="${escapeHtml(t('struct.partBrief'))}">
      </div>
    </li>`
}

function renderEditor(structure: Structure, rich: boolean): string {
  const themeChips = THEME_LABELS.map(
    (o) =>
      `<button type="button" class="chip${o.value === structure.theme ? ' active' : ''}" data-theme="${o.value}">${t(o.key)}</button>`,
  ).join('')

  return `
    <div class="outline__head">
      <h2>${t('struct.headPre')}<span data-count>${structure.sections.length}</span>${t('struct.headPost')}</h2>
      <p>${t('struct.headSub')}</p>
      <div class="outline__total">${t('struct.totalPre')}<b data-total-pages>–</b>${t('struct.totalMid')}<b data-total-time>–</b>${t('struct.totalPost')}</div>
    </div>
    <div class="understand">
      <label>${t('struct.understandLabel')}</label>
      <textarea class="form-input understand__text" data-understanding rows="2"
        placeholder="${escapeHtml(t('struct.understandPlaceholder'))}">${escapeHtml(structure.understanding ?? '')}</textarea>
    </div>
    <div class="outline__meta">
      <input class="form-input" data-deck-title value="${escapeHtml(structure.title)}" placeholder="${escapeHtml(t('struct.deckTitle'))}">
      <input class="form-input" data-deck-subtitle value="${escapeHtml(structure.subtitle ?? '')}" placeholder="${escapeHtml(t('struct.deckSubtitle'))}">
      <div class="outline__theme"><span>${t('home.field.theme')}</span><div class="chips" data-theme-chips>${themeChips}</div></div>
      <label class="switch"><input type="checkbox" data-rich${rich ? ' checked' : ''}><span>${t('struct.richLabel')}</span></label>
    </div>
    <ol class="outline__list" data-list>
      ${structure.sections.map(renderSecRow).join('')}
    </ol>
    <button class="btn btn--ghost btn--sm outline__add" data-add>${icons.plus} ${t('struct.addPart')}</button>
    <div class="outline__actions">
      <button class="btn btn--ghost" data-cancel>${t('common.cancel')}</button>
      <button class="btn btn--ghost" data-regen>${icons.refresh} ${t('struct.regen')}</button>
      <button class="btn btn--primary" data-go>${t('struct.next')}</button>
    </div>`
}

/* ------------------------------ behavior ------------------------------ */

function wireEditor(
  body: HTMLElement,
  minutes: number | undefined,
  h: { onCancel: () => void; onRegen: () => void; onNext: () => void },
): void {
  const list = body.querySelector<HTMLElement>('[data-list]')!
  const countEl = body.querySelector<HTMLElement>('[data-count]')
  const totalPagesEl = body.querySelector<HTMLElement>('[data-total-pages]')
  const totalTimeEl = body.querySelector<HTMLElement>('[data-total-time]')

  const pagesOf = (row: HTMLElement): number => {
    const v = Number(row.querySelector<HTMLInputElement>('[data-pages]')?.value)
    return Number.isFinite(v) && v > 0 ? Math.round(v) : 1
  }

  // Refresh numbering, per-part time labels, and the overall total.
  const recalc = () => {
    const rows = Array.from(list.querySelectorAll<HTMLElement>('[data-row]'))
    const contentSum = rows.reduce((sum, r) => sum + pagesOf(r), 0)
    const totalPages = contentSum + 2 // + cover + end
    const perPage = minutes && totalPages > 0 ? minutes / totalPages : 1.3
    rows.forEach((row, i) => {
      const idx = row.querySelector<HTMLElement>('[data-index]')
      if (idx) idx.textContent = String(i + 1)
      const up = row.querySelector<HTMLButtonElement>('[data-up]')
      const down = row.querySelector<HTMLButtonElement>('[data-down]')
      if (up) up.disabled = i === 0
      if (down) down.disabled = i === rows.length - 1
      const timeEl = row.querySelector<HTMLElement>('[data-time]')
      if (timeEl) timeEl.textContent = `· ~${Math.max(1, Math.round(pagesOf(row) * perPage))} ${t('unit.min')}`
    })
    if (countEl) countEl.textContent = String(rows.length)
    if (totalPagesEl) totalPagesEl.textContent = String(totalPages)
    if (totalTimeEl) totalTimeEl.textContent = `${Math.max(1, Math.round(totalPages * perPage))} ${t('unit.min')}`
  }

  list.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('button')
    if (!btn) return
    const row = btn.closest<HTMLElement>('[data-row]')
    if (!row) return
    if (btn.dataset.up !== undefined && row.previousElementSibling) {
      list.insertBefore(row, row.previousElementSibling)
      recalc()
    } else if (btn.dataset.down !== undefined && row.nextElementSibling) {
      list.insertBefore(row.nextElementSibling, row)
      recalc()
    } else if (btn.dataset.del !== undefined) {
      row.remove()
      recalc()
    } else if (btn.dataset.inc !== undefined || btn.dataset.dec !== undefined) {
      const input = row.querySelector<HTMLInputElement>('[data-pages]')
      if (input) {
        const next = Math.min(15, Math.max(1, pagesOf(row) + (btn.dataset.inc !== undefined ? 1 : -1)))
        input.value = String(next)
        recalc()
      }
    }
  })

  list.addEventListener('input', (e) => {
    if ((e.target as HTMLElement).matches('[data-pages]')) recalc()
  })

  body.querySelector('[data-add]')!.addEventListener('click', () => {
    list.insertAdjacentHTML('beforeend', renderSecRow({ title: '', brief: '', pages: 3 }))
    recalc()
  })

  const themeChips = body.querySelector<HTMLElement>('[data-theme-chips]')
  themeChips?.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-theme]')
    if (!chip) return
    themeChips.querySelectorAll('[data-theme]').forEach((c) => c.classList.remove('active'))
    chip.classList.add('active')
  })

  body.querySelector('[data-cancel]')!.addEventListener('click', h.onCancel)
  body.querySelector('[data-regen]')!.addEventListener('click', h.onRegen)
  body.querySelector('[data-go]')!.addEventListener('click', h.onNext)

  recalc()
}

function collectStructure(body: HTMLElement, topic: string): Structure {
  const understanding = body.querySelector<HTMLTextAreaElement>('[data-understanding]')?.value.trim() || undefined
  const title = body.querySelector<HTMLInputElement>('[data-deck-title]')?.value.trim() || topic.slice(0, 40)
  const subtitle = body.querySelector<HTMLInputElement>('[data-deck-subtitle]')?.value.trim() || undefined
  const activeTheme = body.querySelector<HTMLElement>('[data-theme].active')?.dataset.theme as ThemeName | undefined
  const theme: ThemeName = activeTheme ?? 'aurora'

  const sections: Section[] = []
  body.querySelectorAll<HTMLElement>('[data-row]').forEach((row) => {
    const ttl = row.querySelector<HTMLInputElement>('[data-title]')?.value.trim() ?? ''
    const brief = row.querySelector<HTMLInputElement>('[data-brief]')?.value.trim() || undefined
    const pagesRaw = Number(row.querySelector<HTMLInputElement>('[data-pages]')?.value)
    const pages = Number.isFinite(pagesRaw) && pagesRaw > 0 ? Math.round(pagesRaw) : 3
    if (ttl || brief) sections.push({ title: ttl || (brief as string), brief: ttl ? brief : undefined, pages })
  })

  return { understanding, title, subtitle, theme, sections }
}
