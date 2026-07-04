import { generateOutline } from '../llm/outline'
import { loadSettings, isConfigured } from '../llm/settings'
import { generateAndPlay } from './generating'
import { navigate } from '../router'
import { toast } from '../lib/toast'
import { icons } from '../lib/icons'
import { escapeHtml } from '../lib/markdown'
import { LAYOUTS, type GenerateOptions, type Outline, type OutlineSlide, type SlideLayout, type ThemeName } from '../types'

const LAYOUT_LABELS: Record<SlideLayout, string> = {
  cover: '封面',
  section: '章节分隔',
  bullets: '要点',
  'two-col': '两栏对照',
  'big-number': '大数字',
  quote: '金句',
  comparison: '对比卡片',
  timeline: '时间线',
  code: '代码',
  'image-text': '图文',
  end: '结束',
}

const THEME_LABELS: Array<{ value: ThemeName; label: string }> = [
  { value: 'aurora', label: '极光' },
  { value: 'ink', label: '水墨' },
  { value: 'sunrise', label: '暖阳' },
  { value: 'forest', label: '森林' },
  { value: 'noir', label: '深邃' },
]

/**
 * Fetch a deck outline, let the user review/edit/reorder it, then generate
 * the full deck from the confirmed outline.
 */
export function startOutline(topic: string, opts: GenerateOptions): void {
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
        <h2>正在规划课件大纲…</h2>
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
        <h2 class="gen__error">大纲生成失败</h2>
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

  const showEditor = (outline: Outline) => {
    body.innerHTML = renderEditor(outline)
    wireEditor(body, {
      onCancel: close,
      onRegen: () => {
        controller = new AbortController()
        run()
      },
      onGenerate: () => {
        const edited = collectOutline(body, trimmed)
        if (!edited.slides.length) {
          toast('至少保留一页')
          return
        }
        close()
        generateAndPlay(trimmed, opts, edited)
      },
    })
  }

  const run = () => {
    showLoading()
    generateOutline(trimmed, opts, loadSettings(), controller.signal)
      .then((outline) => {
        if (!controller.signal.aborted) showEditor(outline)
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) showError(err instanceof Error ? err.message : String(err))
      })
  }

  run()
}

/* ------------------------------ rendering ------------------------------ */

function layoutOptions(selected: SlideLayout): string {
  return LAYOUTS.map(
    (l) => `<option value="${l}"${l === selected ? ' selected' : ''}>${LAYOUT_LABELS[l]}</option>`,
  ).join('')
}

function renderRow(s: OutlineSlide): string {
  return `
    <li class="ol-row" data-row>
      <div class="ol-row__main">
        <select class="select ol-row__layout" data-layout>${layoutOptions(s.layout)}</select>
        <input class="form-input ol-row__title" data-title value="${escapeHtml(s.title)}" placeholder="页标题">
        <div class="ol-row__ops">
          <button class="icon-btn" data-up title="上移">${icons.up}</button>
          <button class="icon-btn" data-down title="下移">${icons.down}</button>
          <button class="icon-btn" data-del title="删除">${icons.trash}</button>
        </div>
      </div>
      <input class="form-input ol-row__brief" data-brief value="${escapeHtml(s.brief ?? '')}" placeholder="要点 / 内容简述（可选）">
    </li>`
}

function renderEditor(outline: Outline): string {
  const themeChips = THEME_LABELS.map(
    (t) =>
      `<button type="button" class="chip${t.value === outline.theme ? ' active' : ''}" data-theme="${t.value}">${t.label}</button>`,
  ).join('')

  return `
    <div class="outline__head">
      <h2>确认课件大纲</h2>
      <p>调整标题、每页版式、顺序与要点，满意后再生成完整课件（共 <span data-count>${outline.slides.length}</span> 页）。</p>
    </div>
    <div class="outline__meta">
      <input class="form-input" data-deck-title value="${escapeHtml(outline.title)}" placeholder="课件标题">
      <input class="form-input" data-deck-subtitle value="${escapeHtml(outline.subtitle ?? '')}" placeholder="副标题（可选）">
      <div class="outline__theme"><span>配色</span><div class="chips" data-theme-chips>${themeChips}</div></div>
    </div>
    <ol class="outline__list" data-list>
      ${outline.slides.map(renderRow).join('')}
    </ol>
    <button class="btn btn--ghost btn--sm outline__add" data-add>${icons.plus} 添加一页</button>
    <div class="outline__actions">
      <button class="btn btn--ghost" data-cancel>取消</button>
      <button class="btn btn--ghost" data-regen>${icons.refresh} 重新生成大纲</button>
      <button class="btn btn--primary" data-go>生成课件 →</button>
    </div>`
}

/* ------------------------------ behavior ------------------------------ */

function wireEditor(
  body: HTMLElement,
  h: { onCancel: () => void; onRegen: () => void; onGenerate: () => void },
): void {
  const list = body.querySelector<HTMLElement>('[data-list]')!
  const countEl = body.querySelector<HTMLElement>('[data-count]')
  const updateCount = () => {
    if (countEl) countEl.textContent = String(list.querySelectorAll('[data-row]').length)
  }

  list.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('button')
    if (!btn) return
    const row = btn.closest<HTMLElement>('[data-row]')
    if (!row) return
    if (btn.dataset.up !== undefined && row.previousElementSibling) {
      list.insertBefore(row, row.previousElementSibling)
    } else if (btn.dataset.down !== undefined && row.nextElementSibling) {
      list.insertBefore(row.nextElementSibling, row)
    } else if (btn.dataset.del !== undefined) {
      row.remove()
      updateCount()
    }
  })

  body.querySelector('[data-add]')!.addEventListener('click', () => {
    list.insertAdjacentHTML('beforeend', renderRow({ layout: 'bullets', title: '', brief: '' }))
    updateCount()
  })

  // Theme chips: single-select.
  const themeChips = body.querySelector<HTMLElement>('[data-theme-chips]')
  themeChips?.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-theme]')
    if (!chip) return
    themeChips.querySelectorAll('[data-theme]').forEach((c) => c.classList.remove('active'))
    chip.classList.add('active')
  })

  body.querySelector('[data-cancel]')!.addEventListener('click', h.onCancel)
  body.querySelector('[data-regen]')!.addEventListener('click', h.onRegen)
  body.querySelector('[data-go]')!.addEventListener('click', h.onGenerate)
}

function collectOutline(body: HTMLElement, topic: string): Outline {
  const title = body.querySelector<HTMLInputElement>('[data-deck-title]')?.value.trim() || topic.slice(0, 40)
  const subtitle = body.querySelector<HTMLInputElement>('[data-deck-subtitle]')?.value.trim() || undefined
  const activeTheme = body.querySelector<HTMLElement>('[data-theme].active')?.dataset.theme as ThemeName | undefined
  const theme: ThemeName = activeTheme ?? 'aurora'

  const slides: OutlineSlide[] = []
  body.querySelectorAll<HTMLElement>('[data-row]').forEach((row) => {
    const layout = (row.querySelector<HTMLSelectElement>('[data-layout]')?.value ?? 'bullets') as SlideLayout
    const t = row.querySelector<HTMLInputElement>('[data-title]')?.value.trim() ?? ''
    const brief = row.querySelector<HTMLInputElement>('[data-brief]')?.value.trim() || undefined
    if (t || brief || layout === 'cover' || layout === 'end') {
      slides.push({ layout, title: t, brief })
    }
  })

  return { title, subtitle, theme, slides }
}
