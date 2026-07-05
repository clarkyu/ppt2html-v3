import { generatePartPages, assembleOutline } from '../llm/outline'
import { loadSettings, isConfigured } from '../llm/settings'
import { generateAndPlay } from './generating'
import { navigate } from '../router'
import { toast } from '../lib/toast'
import { icons } from '../lib/icons'
import { escapeHtml } from '../lib/markdown'
import { liveTitles, renderLive } from '../lib/live'
import {
  LAYOUTS,
  type GenerateOptions,
  type Outline,
  type OutlineSlide,
  type SlideLayout,
  type Structure,
  type ThemeName,
} from '../types'

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

const LAYOUT_FAMILY: Record<SlideLayout, string> = {
  cover: 'structure',
  section: 'structure',
  end: 'structure',
  bullets: 'content',
  'two-col': 'content',
  'image-text': 'content',
  'big-number': 'accent',
  quote: 'accent',
  comparison: 'compare',
  timeline: 'compare',
  code: 'code',
}
const famOf = (l: SlideLayout): string => LAYOUT_FAMILY[l] ?? 'content'

type Step =
  | { kind: 'cover' }
  | { kind: 'part'; index: number }
  | { kind: 'end' }

/**
 * Step 2 of outlining: detail the confirmed structure **one part at a time**,
 * streaming each part live and confirming it before moving on
 * (封面 → 各部分 → 结束 → 整份大纲总览 → 生成).
 */
export function startPageOutline(topic: string, opts: GenerateOptions, structure: Structure): void {
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
  const close = () => {
    controller.abort()
    el.remove()
  }
  let controller = new AbortController()

  const buildSteps = (): Step[] => [
    { kind: 'cover' },
    ...structure.sections.map((_, index) => ({ kind: 'part', index }) as Step),
    { kind: 'end' },
  ]
  let steps: Step[] = buildSteps()
  const stepCount = () => steps.length + 1 // + overview
  const results: OutlineSlide[][] = new Array(steps.length)

  const coverSlides = (): OutlineSlide[] => [
    { layout: 'cover', title: structure.title, brief: structure.subtitle },
  ]
  const endSlides = (): OutlineSlide[] => [{ layout: 'end', title: '谢谢观看' }]

  /* ----------------------------- streaming a part ----------------------------- */

  const streamPart = (i: number, sIndex: number, instruction?: string) => {
    controller = new AbortController()
    const sec = structure.sections[sIndex]
    showStreaming(i, sec.title, sec.pages ?? 3)
    const liveEl = body.querySelector<HTMLElement>('[data-live]')!
    generatePartPages(
      trimmed,
      opts,
      structure,
      sIndex,
      loadSettings(),
      { signal: controller.signal, onToken: (full) => renderLive(liveEl, liveTitles(full)) },
      instruction,
    )
      .then((slides) => {
        if (!controller.signal.aborted) showStepEditor(i, slides)
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) showStepError(i, err instanceof Error ? err.message : String(err))
      })
  }

  const showStreaming = (i: number, partTitle: string, pages: number) => {
    body.innerHTML = `
      <div class="wizard__head">
        <div class="wizard__crumb">环节 ${i + 1} / ${stepCount()}</div>
        <h2>正在细化：${escapeHtml(partTitle)}</h2>
        <p>约 ${pages} 页 · 逐页规划中，实时显示 ↓</p>
      </div>
      <ol class="gen-live" data-live><li class="gen-live__wait">正在连接模型…</li></ol>
      <div class="outline__actions">
        <button class="btn btn--ghost" data-cancel>取消</button>
      </div>`
    body.querySelector('[data-cancel]')!.addEventListener('click', close)
  }

  const showStepError = (i: number, msg: string) => {
    body.innerHTML = `
      <div class="gen" style="padding:8px">
        <h2 class="gen__error">这一环节生成失败</h2>
        <p style="color:var(--text-muted)">${escapeHtml(msg)}</p>
        <div class="gen__actions">
          <button class="btn btn--ghost" data-cancel>关闭</button>
          <button class="btn btn--primary" data-retry>重试</button>
        </div>
      </div>`
    body.querySelector('[data-cancel]')!.addEventListener('click', close)
    body.querySelector('[data-retry]')!.addEventListener('click', () => runStep(i))
  }

  /* ------------------------------ per-step editor ------------------------------ */

  const runStep = (i: number) => {
    const step = steps[i]
    if (step.kind === 'part') {
      if (results[i]) showStepEditor(i, results[i]) // navigated back — reuse
      else streamPart(i, step.index)
    } else {
      showStepEditor(i, results[i] ?? (step.kind === 'cover' ? coverSlides() : endSlides()))
    }
  }

  const stepMeta = (i: number): { title: string; sub: string; canRegen: boolean } => {
    const step = steps[i]
    const nth = `第 ${i + 1} 步 / 共 ${stepCount()} 步`
    if (step.kind === 'cover') return { title: '封面页', sub: `确认课件封面 · ${nth}`, canRegen: false }
    if (step.kind === 'end') return { title: '结束页', sub: `确认收尾页 · ${nth}`, canRegen: false }
    const sec = structure.sections[step.index]
    return {
      title: `第 ${step.index + 1} 部分 · ${sec.title}`,
      sub: `约 ${sec.pages ?? 3} 页 · 确认这一环节 · ${nth}`,
      canRegen: true,
    }
  }

  const showStepEditor = (i: number, slides: OutlineSlide[]) => {
    const meta = stepMeta(i)
    const last = i === steps.length - 1
    body.innerHTML = `
      <div class="wizard__head">
        <div class="wizard__crumb">环节 ${i + 1} / ${stepCount()}</div>
        <h2>${escapeHtml(meta.title)}</h2>
        <p>${escapeHtml(meta.sub)}</p>
      </div>
      <ol class="outline__list" data-list>${slides.map(renderRow).join('')}</ol>
      <button class="btn btn--ghost btn--sm outline__add" data-add>${icons.plus} 添加一页</button>
      ${meta.canRegen ? `<div class="adjust"><input class="input adjust__input" data-adjust placeholder="想怎么调整这一环节？（可选：多举例 / 精简为要点 / 换个切入角度…）"></div>` : ''}
      <div class="outline__actions">
        <button class="btn btn--ghost" data-cancel>取消</button>
        ${i > 0 ? '<button class="btn btn--ghost" data-prev>← 上一环节</button>' : ''}
        ${meta.canRegen ? `<button class="btn btn--ghost" data-regen>${icons.refresh} 重新生成本环节</button>` : ''}
        <button class="btn btn--primary" data-next>${last ? '确认，看总览 →' : '确认，下一环节 →'}</button>
      </div>`

    wireRowList(body)
    body.querySelector('[data-cancel]')!.addEventListener('click', close)
    body.querySelector<HTMLElement>('[data-prev]')?.addEventListener('click', () => {
      results[i] = collectRows(body)
      runStep(i - 1)
    })
    body.querySelector<HTMLElement>('[data-regen]')?.addEventListener('click', () => {
      const step = steps[i]
      if (step.kind === 'part') {
        const instruction = body.querySelector<HTMLInputElement>('[data-adjust]')?.value.trim() || undefined
        streamPart(i, step.index, instruction)
      }
    })
    body.querySelector('[data-next]')!.addEventListener('click', () => {
      const collected = collectRows(body)
      if (!collected.length) {
        toast('至少保留一页')
        return
      }
      results[i] = collected
      if (last) showOverview()
      else runStep(i + 1)
    })
  }

  /* ------------------------------ final overview ------------------------------ */

  const groupLabel = (step: Step): string => {
    if (step.kind === 'cover') return '封面'
    if (step.kind === 'end') return '结束页'
    return `第 ${step.index + 1} 部分 · ${structure.sections[step.index].title}`
  }

  // Sync any edits made in the overview back into the per-step results.
  const syncOverviewIntoResults = () => {
    body.querySelectorAll<HTMLElement>('.ov-group').forEach((g, i) => {
      results[i] = collectRows(g)
    })
  }

  const showOverview = () => {
    const groups = steps.map((step, i) => ({ label: groupLabel(step), kind: step.kind, slides: results[i] ?? [] }))
    const title = assembleOutline(structure, results.map((r) => r ?? [])).title
    body.innerHTML = renderOverview(structure, title, groups)
    wireOverview(body, {
      onCancel: close,
      onPrev: () => {
        syncOverviewIntoResults()
        runStep(steps.length - 1)
      },
      onGoto: (i) => {
        syncOverviewIntoResults()
        runStep(i)
      },
      onDeletePart: (i) => {
        const step = steps[i]
        if (step.kind !== 'part') return
        syncOverviewIntoResults()
        structure.sections.splice(step.index, 1)
        results.splice(i, 1)
        steps = buildSteps()
        showOverview()
      },
      onAddPart: () => {
        syncOverviewIntoResults()
        structure.sections.push({ title: '新部分', pages: 3 })
        // Insert the new part's pages just before the 结束 group.
        results.splice(Math.max(1, results.length - 1), 0, [{ layout: 'section', title: '新部分' }])
        steps = buildSteps()
        showOverview()
      },
      onGenerate: () => {
        const edited = collectOutline(body, trimmed)
        if (!edited.slides.length) {
          toast('至少保留一页')
          return
        }
        el.remove()
        generateAndPlay(trimmed, opts, edited)
      },
    })
  }

  runStep(0)
}

/* ------------------------------ rendering ------------------------------ */

function layoutOptions(selected: SlideLayout): string {
  return LAYOUTS.map(
    (l) => `<option value="${l}"${l === selected ? ' selected' : ''}>${LAYOUT_LABELS[l]}</option>`,
  ).join('')
}

function renderRow(s: OutlineSlide): string {
  return `
    <li class="ol-row" data-row data-fam="${famOf(s.layout)}">
      <div class="ol-row__index" data-index></div>
      <div class="ol-row__content">
        <div class="ol-row__top">
          <select class="ol-row__layout" data-layout title="选择版式">${layoutOptions(s.layout)}</select>
          <input class="ol-row__title" data-title value="${escapeHtml(s.title)}" placeholder="这一页讲什么？">
          <div class="ol-row__ops">
            <button class="icon-btn" data-up title="上移">${icons.up}</button>
            <button class="icon-btn" data-down title="下移">${icons.down}</button>
            <button class="icon-btn" data-del title="删除">${icons.trash}</button>
          </div>
        </div>
        <input class="ol-row__brief" data-brief value="${escapeHtml(s.brief ?? '')}" placeholder="要点 / 内容简述（可选）">
      </div>
    </li>`
}

interface OvGroup {
  label: string
  kind: Step['kind']
  slides: OutlineSlide[]
}

function renderOverview(structure: Structure, title: string, groups: OvGroup[]): string {
  const themeChips = THEME_LABELS.map(
    (t) =>
      `<button type="button" class="chip${t.value === structure.theme ? ' active' : ''}" data-theme="${t.value}">${t.label}</button>`,
  ).join('')
  const total = groups.reduce((n, g) => n + g.slides.length, 0)

  return `<div data-ov>
    <div class="outline__head">
      <h2>整份大纲总览 · 共 <span data-count>${total}</span> 页</h2>
      <p>按环节分类，点标题左侧箭头可折叠；可增删部分、在某环节内加页，或用「去修改」/「上一步」回到逐环节修改。满意后再生成完整课件。</p>
    </div>
    <div class="outline__meta">
      <input class="form-input" data-deck-title value="${escapeHtml(title)}" placeholder="课件标题">
      <input class="form-input" data-deck-subtitle value="${escapeHtml(structure.subtitle ?? '')}" placeholder="副标题（可选）">
      <div class="outline__theme"><span>配色</span><div class="chips" data-theme-chips>${themeChips}</div></div>
    </div>
    ${groups
      .map(
        (g, i) => `
      <div class="ov-group" data-group="${i}">
        <div class="ov-group__head">
          <button class="icon-btn ov-group__fold" data-fold title="折叠 / 展开">${icons.down}</button>
          <span class="ov-group__label">${escapeHtml(g.label)}</span>
          <span class="ov-group__count">${g.slides.length} 页</span>
          <button class="btn btn--ghost btn--sm ov-group__goto" data-goto="${i}">${icons.edit} 去修改</button>
          ${g.kind === 'part' ? `<button class="icon-btn ov-group__del" data-del-group title="删除此部分">${icons.trash}</button>` : ''}
        </div>
        <div class="ov-group__body">
          <ol class="outline__list" data-list>${g.slides.map(renderRow).join('')}</ol>
          <button class="btn btn--ghost btn--sm" data-add>${icons.plus} 在此环节加一页</button>
        </div>
      </div>`,
      )
      .join('')}
    <button class="btn btn--ghost btn--sm ov-addpart" data-add-part>${icons.plus} 添加一个部分</button>
    <div class="outline__actions">
      <button class="btn btn--ghost" data-cancel>取消</button>
      <button class="btn btn--ghost" data-prev>← 上一步（逐环节修改）</button>
      <button class="btn btn--primary" data-go>生成课件 →</button>
    </div>
  </div>`
}

/* ------------------------------ behavior ------------------------------ */

/** Wire reorder / add / delete / layout-recolour / renumber for a `[data-list]`. */
function wireRowList(body: HTMLElement): void {
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

  list.addEventListener('change', (e) => {
    const sel = (e.target as HTMLElement).closest<HTMLSelectElement>('[data-layout]')
    if (!sel) return
    const row = sel.closest<HTMLElement>('[data-row]')
    if (row) row.dataset.fam = famOf(sel.value as SlideLayout)
  })

  body.querySelector('[data-add]')!.addEventListener('click', () => {
    list.insertAdjacentHTML('beforeend', renderRow({ layout: 'bullets', title: '', brief: '' }))
    renumber()
  })

  renumber()
}

function wireOverview(
  body: HTMLElement,
  h: {
    onCancel: () => void
    onPrev: () => void
    onGoto: (i: number) => void
    onDeletePart: (i: number) => void
    onAddPart: () => void
    onGenerate: () => void
  },
): void {
  // Global renumbering across all 环节 groups (page N of total).
  const renumber = () => {
    let idx = 0
    body.querySelectorAll<HTMLElement>('.ov-group').forEach((group) => {
      const rows = Array.from(group.querySelectorAll<HTMLElement>('[data-row]'))
      rows.forEach((row, i) => {
        idx++
        const ix = row.querySelector<HTMLElement>('[data-index]')
        if (ix) ix.textContent = String(idx)
        const up = row.querySelector<HTMLButtonElement>('[data-up]')
        const down = row.querySelector<HTMLButtonElement>('[data-down]')
        if (up) up.disabled = i === 0
        if (down) down.disabled = i === rows.length - 1
      })
      const c = group.querySelector<HTMLElement>('.ov-group__count')
      if (c) c.textContent = `${rows.length} 页`
    })
    const total = body.querySelector<HTMLElement>('[data-count]')
    if (total) total.textContent = String(idx)
  }

  const groupIndex = (btn: HTMLElement): number => Number(btn.closest<HTMLElement>('.ov-group')?.dataset.group)

  // Delegate on the (re-rendered) wrapper, not the persistent body, so listeners
  // don't stack across re-renders.
  const root = body.querySelector<HTMLElement>('[data-ov]')!

  root.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('button')
    if (!btn) return
    if (btn.dataset.fold !== undefined) {
      btn.closest<HTMLElement>('.ov-group')?.classList.toggle('is-collapsed')
      return
    }
    if (btn.dataset.goto !== undefined) return h.onGoto(Number(btn.dataset.goto))
    if (btn.dataset.delGroup !== undefined) return h.onDeletePart(groupIndex(btn))
    if (btn.dataset.addPart !== undefined) return h.onAddPart()
    if (btn.dataset.cancel !== undefined) return h.onCancel()
    if (btn.dataset.prev !== undefined) return h.onPrev()
    if (btn.dataset.go !== undefined) return h.onGenerate()
    if (btn.dataset.add !== undefined) {
      const list = btn.closest<HTMLElement>('.ov-group')?.querySelector<HTMLElement>('[data-list]')
      list?.insertAdjacentHTML('beforeend', renderRow({ layout: 'bullets', title: '', brief: '' }))
      renumber()
      return
    }
    const row = btn.closest<HTMLElement>('[data-row]')
    if (!row) return
    const list = row.parentElement!
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

  root.addEventListener('change', (e) => {
    const sel = (e.target as HTMLElement).closest<HTMLSelectElement>('[data-layout]')
    if (!sel) return
    const row = sel.closest<HTMLElement>('[data-row]')
    if (row) row.dataset.fam = famOf(sel.value as SlideLayout)
  })

  const themeChips = body.querySelector<HTMLElement>('[data-theme-chips]')
  themeChips?.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-theme]')
    if (!chip) return
    themeChips.querySelectorAll('[data-theme]').forEach((c) => c.classList.remove('active'))
    chip.classList.add('active')
  })

  renumber()
}

function collectRows(body: HTMLElement): OutlineSlide[] {
  const slides: OutlineSlide[] = []
  body.querySelectorAll<HTMLElement>('[data-row]').forEach((row) => {
    const layout = (row.querySelector<HTMLSelectElement>('[data-layout]')?.value ?? 'bullets') as SlideLayout
    const t = row.querySelector<HTMLInputElement>('[data-title]')?.value.trim() ?? ''
    const brief = row.querySelector<HTMLInputElement>('[data-brief]')?.value.trim() || undefined
    if (t || brief || layout === 'cover' || layout === 'end') slides.push({ layout, title: t, brief })
  })
  return slides
}

function collectOutline(body: HTMLElement, topic: string): Outline {
  const title = body.querySelector<HTMLInputElement>('[data-deck-title]')?.value.trim() || topic.slice(0, 40)
  const subtitle = body.querySelector<HTMLInputElement>('[data-deck-subtitle]')?.value.trim() || undefined
  const activeTheme = body.querySelector<HTMLElement>('[data-theme].active')?.dataset.theme as ThemeName | undefined
  const theme: ThemeName = activeTheme ?? 'aurora'
  return { title, subtitle, theme, slides: collectRows(body) }
}
