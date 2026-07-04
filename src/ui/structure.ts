import { generateStructure } from '../llm/outline'
import { loadSettings, isConfigured } from '../llm/settings'
import { startPageOutline } from './outline'
import { navigate } from '../router'
import { toast } from '../lib/toast'
import { icons } from '../lib/icons'
import { escapeHtml } from '../lib/markdown'
import type { GenerateOptions, Section, Structure, ThemeName } from '../types'

const THEME_LABELS: Array<{ value: ThemeName; label: string }> = [
  { value: 'aurora', label: '极光' },
  { value: 'ink', label: '水墨' },
  { value: 'sunrise', label: '暖阳' },
  { value: 'forest', label: '森林' },
  { value: 'noir', label: '深邃' },
]

/**
 * Step 1 of outlining: plan the deck's overall structure (a few parts) plus a
 * one-line restatement of the user's intent, let the user confirm/edit both,
 * then move on to page-level detailing.
 */
export function startStructure(topic: string, opts: GenerateOptions): void {
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
  el.innerHTML = `<div class="outline card"><div data-body></div></div>`
  document.body.appendChild(el)
  const body = el.querySelector<HTMLElement>('[data-body]')!
  const close = () => el.remove()
  let controller = new AbortController()

  const showLoading = () => {
    body.innerHTML = `
      <div class="gen" style="padding:8px">
        <div class="gen__spinner"></div>
        <h2>正在理解需求、规划整体结构…</h2>
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
        <h2 class="gen__error">结构生成失败</h2>
        <p style="color:var(--text-muted)">${escapeHtml(msg)}</p>
        <div class="gen__actions">
          <button class="btn btn--ghost" data-cancel>关闭</button>
          <button class="btn btn--primary" data-retry>重试</button>
        </div>
      </div>`
    body.querySelector('[data-cancel]')!.addEventListener('click', close)
    body.querySelector('[data-retry]')!.addEventListener('click', () => {
      controller = new AbortController()
      run()
    })
  }

  const showEditor = (structure: Structure) => {
    body.innerHTML = renderEditor(structure)
    wireEditor(body, {
      onCancel: close,
      onRegen: () => {
        controller = new AbortController()
        run()
      },
      onNext: () => {
        const edited = collectStructure(body, trimmed)
        if (!edited.sections.length) {
          toast('至少保留一个部分')
          return
        }
        close()
        startPageOutline(trimmed, { ...opts, understanding: edited.understanding }, edited)
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
          <input class="ol-row__title" data-title value="${escapeHtml(s.title)}" placeholder="部分标题">
          <div class="ol-row__ops">
            <button class="icon-btn" data-up title="上移">${icons.up}</button>
            <button class="icon-btn" data-down title="下移">${icons.down}</button>
            <button class="icon-btn" data-del title="删除">${icons.trash}</button>
          </div>
        </div>
        <input class="ol-row__brief" data-brief value="${escapeHtml(s.brief ?? '')}" placeholder="这一部分讲什么（可选）">
      </div>
    </li>`
}

function renderEditor(structure: Structure): string {
  const themeChips = THEME_LABELS.map(
    (t) =>
      `<button type="button" class="chip${t.value === structure.theme ? ' active' : ''}" data-theme="${t.value}">${t.label}</button>`,
  ).join('')

  return `
    <div class="outline__head">
      <h2>先确认整体结构 · <span data-count>${structure.sections.length}</span> 个部分</h2>
      <p>核对我对需求的理解，以及课件分成哪几个部分；下一步再把每个部分细化成具体页面。</p>
    </div>
    <div class="understand">
      <label>我的理解</label>
      <textarea class="form-input understand__text" data-understanding rows="2"
        placeholder="用一句话描述你想要的课件（讲给谁、目的、重点）">${escapeHtml(structure.understanding ?? '')}</textarea>
    </div>
    <div class="outline__meta">
      <input class="form-input" data-deck-title value="${escapeHtml(structure.title)}" placeholder="课件标题">
      <input class="form-input" data-deck-subtitle value="${escapeHtml(structure.subtitle ?? '')}" placeholder="副标题（可选）">
      <div class="outline__theme"><span>配色</span><div class="chips" data-theme-chips>${themeChips}</div></div>
    </div>
    <ol class="outline__list" data-list>
      ${structure.sections.map(renderSecRow).join('')}
    </ol>
    <button class="btn btn--ghost btn--sm outline__add" data-add>${icons.plus} 添加一个部分</button>
    <div class="outline__actions">
      <button class="btn btn--ghost" data-cancel>取消</button>
      <button class="btn btn--ghost" data-regen>${icons.refresh} 重新规划</button>
      <button class="btn btn--primary" data-go>下一步：细化每页 →</button>
    </div>`
}

/* ------------------------------ behavior ------------------------------ */

function wireEditor(
  body: HTMLElement,
  h: { onCancel: () => void; onRegen: () => void; onNext: () => void },
): void {
  const list = body.querySelector<HTMLElement>('[data-list]')!
  const countEl = body.querySelector<HTMLElement>('[data-count]')

  const renumber = () => {
    const rows = list.querySelectorAll<HTMLElement>('[data-row]')
    rows.forEach((row, i) => {
      const idx = row.querySelector<HTMLElement>('[data-index]')
      if (idx) idx.textContent = String(i + 1)
      const up = row.querySelector<HTMLButtonElement>('[data-up]')
      const down = row.querySelector<HTMLButtonElement>('[data-down]')
      if (up) up.disabled = i === 0
      if (down) down.disabled = i === rows.length - 1
    })
    if (countEl) countEl.textContent = String(rows.length)
  }

  list.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('button')
    if (!btn) return
    const row = btn.closest<HTMLElement>('[data-row]')
    if (!row) return
    if (btn.dataset.up !== undefined && row.previousElementSibling) {
      list.insertBefore(row, row.previousElementSibling)
      renumber()
    } else if (btn.dataset.down !== undefined && row.nextElementSibling) {
      list.insertBefore(row.nextElementSibling, row)
      renumber()
    } else if (btn.dataset.del !== undefined) {
      row.remove()
      renumber()
    }
  })

  body.querySelector('[data-add]')!.addEventListener('click', () => {
    list.insertAdjacentHTML('beforeend', renderSecRow({ title: '', brief: '' }))
    renumber()
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

  renumber()
}

function collectStructure(body: HTMLElement, topic: string): Structure {
  const understanding = body.querySelector<HTMLTextAreaElement>('[data-understanding]')?.value.trim() || undefined
  const title = body.querySelector<HTMLInputElement>('[data-deck-title]')?.value.trim() || topic.slice(0, 40)
  const subtitle = body.querySelector<HTMLInputElement>('[data-deck-subtitle]')?.value.trim() || undefined
  const activeTheme = body.querySelector<HTMLElement>('[data-theme].active')?.dataset.theme as ThemeName | undefined
  const theme: ThemeName = activeTheme ?? 'aurora'

  const sections: Section[] = []
  body.querySelectorAll<HTMLElement>('[data-row]').forEach((row) => {
    const t = row.querySelector<HTMLInputElement>('[data-title]')?.value.trim() ?? ''
    const brief = row.querySelector<HTMLInputElement>('[data-brief]')?.value.trim() || undefined
    if (t || brief) sections.push({ title: t || (brief as string), brief: t ? brief : undefined })
  })

  return { understanding, title, subtitle, theme, sections }
}
