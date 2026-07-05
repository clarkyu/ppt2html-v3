import { getDeck, saveDeck } from '../store/db'
import { getSampleDeck } from '../sample'
import { mountSlidePreview } from '../render/preview'
import { regenerateSlide } from '../llm/edit'
import { searchImage, queryForSlide } from '../images/search'
import { loadSettings, isConfigured } from '../llm/settings'
import { navigate } from '../router'
import { toast } from '../lib/toast'
import { icons } from '../lib/icons'
import { escapeHtml } from '../lib/markdown'
import {
  LAYOUTS,
  THEMES,
  type CompareItem,
  type Deck,
  type Slide,
  type SlideLayout,
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
const THEME_LABELS: Record<ThemeName, string> = {
  aurora: '极光',
  ink: '水墨',
  sunrise: '暖阳',
  forest: '森林',
  noir: '深邃',
}

/** Deck content editor: every page shown with a live preview and editable fields. */
export function renderDeckEditor(view: HTMLElement, id: string): () => void {
  const cleanups: Array<() => void> = []

  view.innerHTML = `
    <div class="section-head">
      <h2>编辑课件</h2>
      <a href="#/library">← 返回课件库</a>
    </div>
    <div data-root><div class="empty"><p>加载中…</p></div></div>`
  const root = view.querySelector<HTMLElement>('[data-root]')!

  const isSample = id === 'sample'
  const load = isSample ? Promise.resolve(getSampleDeck()) : getDeck(id)
  load
    .then((loaded) => {
      if (!loaded) {
        root.innerHTML = `<div class="empty"><h3>课件不存在</h3><p>它可能已被删除。</p></div>`
        return
      }
      // Editing the built-in sample creates a fresh copy in the library.
      const deck: Deck = isSample
        ? { ...structuredClone(loaded), id: crypto.randomUUID(), createdAt: Date.now(), updatedAt: Date.now() }
        : structuredClone(loaded)
      mountEditor(root, deck, cleanups)
    })
    .catch(() => {
      root.innerHTML = `<div class="empty"><h3>加载失败</h3></div>`
    })

  return () => cleanups.forEach((fn) => fn())
}

/* ------------------------------ mount ------------------------------ */

function mountEditor(root: HTMLElement, deck: Deck, cleanups: Array<() => void>): void {
  const previewCleanups = new Map<HTMLElement, () => void>()
  cleanups.push(() => previewCleanups.forEach((fn) => fn()))

  const render = () => {
    // Tear down old preview observers before replacing the DOM.
    previewCleanups.forEach((fn) => fn())
    previewCleanups.clear()

    root.innerHTML = `
      <div class="ed-meta card">
        <label class="f"><span>课件标题</span><input class="form-input" data-meta="title" value="${escapeHtml(deck.title)}"></label>
        <label class="f"><span>副标题</span><input class="form-input" data-meta="subtitle" value="${escapeHtml(deck.subtitle ?? '')}"></label>
        <label class="f"><span>配色主题</span>
          <select class="form-input" data-meta="theme">
            ${THEMES.map((t) => `<option value="${t}"${t === deck.theme ? ' selected' : ''}>${THEME_LABELS[t]}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="ed-list" data-list>
        ${deck.slides.map((s, i) => renderCard(s, i, deck.slides.length)).join('')}
      </div>
      <button class="btn btn--ghost btn--sm ed-add" data-add-slide>${icons.plus} 添加一页</button>
      <div class="ed-actions">
        <span class="ed-status" data-status></span>
        <button class="btn btn--ghost" data-play>${icons.play} 播放</button>
        <button class="btn btn--primary" data-save>${icons.save} 保存</button>
      </div>`

    root.querySelectorAll<HTMLElement>('[data-card]').forEach((card) => mountPreview(card))
  }

  const mountPreview = (card: HTMLElement) => {
    const i = Number(card.dataset.i)
    const box = card.querySelector<HTMLElement>('[data-preview]')
    if (!box || !deck.slides[i]) return
    previewCleanups.get(box)?.()
    const cleanup = mountSlidePreview(box, deck.theme, deck.slides[i])
    previewCleanups.set(box, cleanup)
  }

  const refreshPreview = (card: HTMLElement) => mountPreview(card)

  const setStatus = (text: string) => {
    const el = root.querySelector<HTMLElement>('[data-status]')
    if (el) el.textContent = text
  }

  render()

  // ---- field edits (live) ----
  root.addEventListener('input', (e) => {
    const target = e.target as HTMLElement
    const meta = target.closest<HTMLElement>('[data-meta]')
    if (meta) {
      const key = meta.dataset.meta as 'title' | 'subtitle'
      const value = (meta as HTMLInputElement).value
      if (key === 'title') deck.title = value
      else deck.subtitle = value.trim() || undefined
      setStatus('未保存')
      return
    }
    const card = target.closest<HTMLElement>('[data-card]')
    if (card && target.closest('[data-field]')) {
      const i = Number(card.dataset.i)
      deck.slides[i] = collectSlide(card, deck.slides[i].layout, deck.slides[i])
      refreshPreview(card)
      setStatus('未保存')
    }
  })

  // ---- selects (theme / layout) ----
  root.addEventListener('change', (e) => {
    const target = e.target as HTMLElement
    if (target.matches('[data-meta="theme"]')) {
      deck.theme = (target as HTMLSelectElement).value as ThemeName
      render() // re-render all previews with the new theme
      setStatus('未保存')
      return
    }
    if (target.matches('[data-layout]')) {
      const card = target.closest<HTMLElement>('[data-card]')!
      const i = Number(card.dataset.i)
      const layout = (target as HTMLSelectElement).value as SlideLayout
      deck.slides[i] = { ...collectSlide(card, deck.slides[i].layout, deck.slides[i]), layout }
      // Re-render just this card so its fields match the new layout.
      card.outerHTML = renderCard(deck.slides[i], i, deck.slides.length)
      mountPreview(root.querySelector<HTMLElement>(`[data-card][data-i="${i}"]`)!)
      setStatus('未保存')
    }
  })

  // ---- clicks (ops) ----
  root.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('button')
    if (!btn) return
    const card = btn.closest<HTMLElement>('[data-card]')

    if (btn.dataset.save !== undefined) {
      deck.updatedAt = Date.now()
      saveDeck(deck).then(() => {
        setStatus('已保存')
        toast('已保存')
      })
      return
    }
    if (btn.dataset.play !== undefined) {
      deck.updatedAt = Date.now()
      saveDeck(deck).then(() => navigate(`#/play/${deck.id}`))
      return
    }
    if (btn.dataset.addSlide !== undefined) {
      deck.slides.push({ layout: 'bullets', title: '新的一页', bullets: ['要点一'] })
      render()
      setStatus('未保存')
      return
    }
    if (!card) return
    const i = Number(card.dataset.i)

    if (btn.dataset.regenSlide !== undefined) {
      const settings = loadSettings()
      if (!isConfigured(settings)) {
        toast('请先在「设置」中填写 API Key')
        navigate('#/settings')
        return
      }
      const instruction = card.querySelector<HTMLInputElement>('[data-instruct]')?.value.trim() ?? ''
      if (!instruction) {
        toast('先写下想怎么改这一页')
        return
      }
      // Persist current edits on this card before regenerating.
      deck.slides[i] = collectSlide(card, deck.slides[i].layout, deck.slides[i])
      btn.setAttribute('disabled', '')
      btn.textContent = 'AI 重写中…'
      regenerateSlide(deck, i, instruction, settings)
        .then((slide) => {
          deck.slides[i] = slide
          card.outerHTML = renderCard(slide, i, deck.slides.length)
          mountPreview(root.querySelector<HTMLElement>(`[data-card][data-i="${i}"]`)!)
          setStatus('未保存')
          toast('已重写这一页')
        })
        .catch((err: unknown) => {
          toast('重写失败：' + (err instanceof Error ? err.message : String(err)))
          btn.removeAttribute('disabled')
          btn.textContent = 'AI 重写本页'
        })
      return
    }

    if (btn.dataset.bgRemove !== undefined) {
      const slide = collectSlide(card, deck.slides[i].layout, deck.slides[i])
      slide.bg = undefined
      deck.slides[i] = slide
      card.outerHTML = renderCard(slide, i, deck.slides.length)
      mountPreview(root.querySelector<HTMLElement>(`[data-card][data-i="${i}"]`)!)
      setStatus('未保存')
      return
    }

    if (btn.dataset.bgRefresh !== undefined) {
      const settings = loadSettings()
      if (!settings.images.enabled) {
        toast('已在「设置」里关闭了背景图')
        return
      }
      deck.slides[i] = collectSlide(card, deck.slides[i].layout, deck.slides[i])
      const used = new Set<string>()
      for (const s of deck.slides) if (s.bg?.url) used.add(s.bg.url)
      btn.setAttribute('disabled', '')
      searchImage(queryForSlide(deck.slides[i], deck), settings, { exclude: used })
        .then((bg) => {
          if (!bg) {
            toast('没找到合适的图片，换个说法或稍后再试')
            btn.removeAttribute('disabled')
            return
          }
          deck.slides[i].bg = bg
          card.outerHTML = renderCard(deck.slides[i], i, deck.slides.length)
          mountPreview(root.querySelector<HTMLElement>(`[data-card][data-i="${i}"]`)!)
          setStatus('未保存')
          toast('已换背景图')
        })
        .catch(() => {
          toast('换背景图失败，请稍后再试')
          btn.removeAttribute('disabled')
        })
      return
    }

    if (btn.dataset.up !== undefined && i > 0) {
      ;[deck.slides[i - 1], deck.slides[i]] = [deck.slides[i], deck.slides[i - 1]]
      render()
      setStatus('未保存')
    } else if (btn.dataset.down !== undefined && i < deck.slides.length - 1) {
      ;[deck.slides[i + 1], deck.slides[i]] = [deck.slides[i], deck.slides[i + 1]]
      render()
      setStatus('未保存')
    } else if (btn.dataset.del !== undefined) {
      if (deck.slides.length <= 1) {
        toast('至少保留一页')
        return
      }
      deck.slides.splice(i, 1)
      render()
      setStatus('未保存')
    } else if (btn.dataset.addItem !== undefined) {
      const slide = collectSlide(card, deck.slides[i].layout, deck.slides[i])
      ;(slide.items ??= []).push({ heading: '新方案', points: [''] })
      deck.slides[i] = slide
      card.outerHTML = renderCard(slide, i, deck.slides.length)
      mountPreview(root.querySelector<HTMLElement>(`[data-card][data-i="${i}"]`)!)
      setStatus('未保存')
    } else if (btn.dataset.addStep !== undefined) {
      const slide = collectSlide(card, deck.slides[i].layout, deck.slides[i])
      ;(slide.steps ??= []).push({ label: '新步骤', text: '' })
      deck.slides[i] = slide
      card.outerHTML = renderCard(slide, i, deck.slides.length)
      mountPreview(root.querySelector<HTMLElement>(`[data-card][data-i="${i}"]`)!)
      setStatus('未保存')
    } else if (btn.dataset.delSub !== undefined) {
      const sub = btn.closest<HTMLElement>('[data-item],[data-step]')
      sub?.remove()
      deck.slides[i] = collectSlide(card, deck.slides[i].layout, deck.slides[i])
      refreshPreview(card)
      setStatus('未保存')
    }
  })
}

/* ------------------------------ card + fields ------------------------------ */

function layoutOptions(selected: SlideLayout): string {
  return LAYOUTS.map(
    (l) => `<option value="${l}"${l === selected ? ' selected' : ''}>${LAYOUT_LABELS[l]}</option>`,
  ).join('')
}

function renderCard(s: Slide, i: number, total: number): string {
  return `
    <div class="slide-card card" data-card data-i="${i}">
      <div class="slide-card__bar">
        <span class="slide-card__n">${i + 1}</span>
        <select class="select slide-card__layout" data-layout>${layoutOptions(s.layout)}</select>
        <div class="slide-card__ops">
          <button class="icon-btn" data-up title="上移"${i === 0 ? ' disabled' : ''}>${icons.up}</button>
          <button class="icon-btn" data-down title="下移"${i === total - 1 ? ' disabled' : ''}>${icons.down}</button>
          <button class="icon-btn" data-del title="删除">${icons.trash}</button>
        </div>
      </div>
      <div class="slide-card__body">
        <div class="thumb slide-card__preview" data-preview></div>
        <div class="slide-card__fields">${renderFields(s)}</div>
      </div>
      <div class="ed-bg">
        <span class="ed-bg__label">${s.bg ? '🖼 已配背景图（很淡）' : '未配背景图'}</span>
        <button class="btn btn--ghost btn--sm" data-bg-refresh>${icons.refresh} 换背景图</button>
        ${s.bg ? `<button class="btn btn--ghost btn--sm" data-bg-remove>移除背景</button>` : ''}
      </div>
      <div class="adjust">
        <input class="input adjust__input" data-instruct placeholder="想怎么改这一页的内容？（例如：换成更具体的例子、语气更活泼、补一个数据…）">
        <button class="btn btn--ghost btn--sm" data-regen-slide>${icons.sparkles} AI 重写本页</button>
      </div>
    </div>`
}

function text(field: string, label: string, value?: string): string {
  return `<label class="f"><span>${label}</span><input class="form-input" data-field="${field}" value="${escapeHtml(value ?? '')}"></label>`
}
function area(field: string, label: string, value?: string, rows = 3, mono = false): string {
  return `<label class="f"><span>${label}</span><textarea class="form-input${mono ? ' mono' : ''}" data-field="${field}" rows="${rows}">${escapeHtml(value ?? '')}</textarea></label>`
}
function lines(field: string, label: string, arr?: string[]): string {
  return area(field, label, (arr ?? []).join('\n'), Math.min(6, Math.max(2, (arr?.length ?? 2) + 1)))
}

function renderFields(s: Slide): string {
  switch (s.layout) {
    case 'cover':
    case 'section':
      return text('eyebrow', '小标签', s.eyebrow) + text('title', '标题', s.title) + text('subtitle', '副标题', s.subtitle)
    case 'end':
      return text('title', '结束语', s.title) + text('subtitle', '收尾副标题', s.subtitle)
    case 'bullets':
      return text('title', '页标题', s.title) + lines('bullets', '要点（每行一条）', s.bullets) + text('note', '讲者备注', s.note)
    case 'big-number':
      return text('value', '关键数字', s.value) + text('caption', '说明', s.caption) + text('title', '页标题（可选）', s.title)
    case 'quote':
      return area('text', '金句', s.text, 3) + text('author', '出处', s.author)
    case 'image-text':
      return text('title', '页标题', s.title) + area('body', '正文（支持 Markdown）', s.body, 5)
    case 'code':
      return text('title', '页标题', s.title) + text('language', '语言', s.language) + area('code', '代码', s.code, 6, true)
    case 'two-col':
      return (
        text('title', '页标题', s.title) +
        `<div class="f-cols">` +
        `<div class="f-col">${text('left.heading', '左栏标题', s.left?.heading)}${lines('left.bullets', '左栏要点', s.left?.bullets)}</div>` +
        `<div class="f-col">${text('right.heading', '右栏标题', s.right?.heading)}${lines('right.bullets', '右栏要点', s.right?.bullets)}</div>` +
        `</div>`
      )
    case 'comparison':
      return (
        text('title', '页标题', s.title) +
        (s.items ?? []).map(renderCompareItem).join('') +
        `<button class="btn btn--ghost btn--sm" data-add-item>${icons.plus} 添加一张卡片</button>`
      )
    case 'timeline':
      return (
        text('title', '页标题', s.title) +
        (s.steps ?? []).map(renderStep).join('') +
        `<button class="btn btn--ghost btn--sm" data-add-step>${icons.plus} 添加一步</button>`
      )
    default:
      return text('title', '标题', s.title)
  }
}

function renderCompareItem(item: CompareItem): string {
  const tones: Array<[string, string]> = [
    ['neutral', '中性'],
    ['positive', '正面'],
    ['negative', '反面'],
  ]
  return `
    <div class="f-sub" data-item>
      <div class="f-sub__head">
        <input class="form-input" data-f="heading" value="${escapeHtml(item.heading ?? '')}" placeholder="卡片标题">
        <select class="select" data-f="tone">${tones
          .map(([v, l]) => `<option value="${v}"${(item.tone ?? 'neutral') === v ? ' selected' : ''}>${l}</option>`)
          .join('')}</select>
        <button class="icon-btn" data-del-sub title="删除">${icons.trash}</button>
      </div>
      <textarea class="form-input" data-f="points" rows="3" placeholder="每行一条要点">${escapeHtml((item.points ?? []).join('\n'))}</textarea>
    </div>`
}

function renderStep(step: { label: string; text?: string }): string {
  return `
    <div class="f-sub" data-step>
      <div class="f-sub__head">
        <input class="form-input" data-f="label" value="${escapeHtml(step.label ?? '')}" placeholder="阶段 / 步骤">
        <button class="icon-btn" data-del-sub title="删除">${icons.trash}</button>
      </div>
      <input class="form-input" data-f="text" value="${escapeHtml(step.text ?? '')}" placeholder="说明（可选）">
    </div>`
}

/* ------------------------------ collect ------------------------------ */

function collectSlide(card: HTMLElement, layout: SlideLayout, prev?: Slide): Slide {
  const raw = (f: string): string => card.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-field="${f}"]`)?.value ?? ''
  const v = (f: string): string => raw(f).trim()
  const und = (f: string): string | undefined => v(f) || undefined
  const list = (f: string): string[] => raw(f).split('\n').map((x) => x.trim()).filter(Boolean)
  // Carry over fields that have no form input, so edits don't drop them.
  const s: Slide = { layout, bg: prev?.bg, imageQuery: prev?.imageQuery }

  switch (layout) {
    case 'cover':
    case 'section':
      s.eyebrow = und('eyebrow')
      s.title = und('title')
      s.subtitle = und('subtitle')
      break
    case 'end':
      s.title = und('title')
      s.subtitle = und('subtitle')
      break
    case 'bullets':
      s.title = und('title')
      s.bullets = list('bullets')
      s.note = und('note')
      break
    case 'big-number':
      s.value = und('value')
      s.caption = und('caption')
      s.title = und('title')
      break
    case 'quote':
      s.text = und('text')
      s.author = und('author')
      break
    case 'image-text':
      s.title = und('title')
      s.body = und('body')
      break
    case 'code':
      s.title = und('title')
      s.language = und('language')
      s.code = raw('code') // preserve whitespace / newlines
      break
    case 'two-col':
      s.title = und('title')
      s.left = { heading: und('left.heading'), bullets: list('left.bullets') }
      s.right = { heading: und('right.heading'), bullets: list('right.bullets') }
      break
    case 'comparison':
      s.title = und('title')
      s.items = Array.from(card.querySelectorAll<HTMLElement>('[data-item]')).map((it) => ({
        heading: (it.querySelector<HTMLInputElement>('[data-f="heading"]')?.value ?? '').trim(),
        tone: (it.querySelector<HTMLSelectElement>('[data-f="tone"]')?.value ?? 'neutral') as CompareItem['tone'],
        points: (it.querySelector<HTMLTextAreaElement>('[data-f="points"]')?.value ?? '')
          .split('\n')
          .map((x) => x.trim())
          .filter(Boolean),
      }))
      break
    case 'timeline':
      s.title = und('title')
      s.steps = Array.from(card.querySelectorAll<HTMLElement>('[data-step]')).map((st) => ({
        label: (st.querySelector<HTMLInputElement>('[data-f="label"]')?.value ?? '').trim(),
        text: (st.querySelector<HTMLInputElement>('[data-f="text"]')?.value ?? '').trim() || undefined,
      }))
      break
  }
  return s
}
