import { icons } from '../lib/icons'
import { navigate } from '../router'
import { listDecks } from '../store/db'
import { mountThumb } from '../render/preview'
import { formatDate } from '../lib/dom'
import { escapeHtml } from '../lib/markdown'
import { startGuidedGeneration } from './guided'
import type { GenerateOptions, ThemeName } from '../types'

const EXAMPLES = [
  '用一节课讲清楚什么是机器学习',
  '如何培养孩子的阅读习惯',
  '给新员工介绍公司的核心价值观',
  '三分钟看懂碳中和',
  '宋词的美学世界',
]

const THEME_OPTIONS: Array<{ value: '' | ThemeName; label: string }> = [
  { value: '', label: '自动配色' },
  { value: 'aurora', label: '极光（科技）' },
  { value: 'ink', label: '水墨（简约）' },
  { value: 'sunrise', label: '暖阳（人文）' },
  { value: 'forest', label: '森林（自然）' },
  { value: 'noir', label: '深邃（高级）' },
]

export function renderHome(view: HTMLElement): () => void {
  const thumbCleanups: Array<() => void> = []

  view.innerHTML = `
    <div class="hero">
      <div class="hero__kicker">${icons.sparkles} AI 课件生成器</div>
      <h1>一句话，生成<span class="grad">精美课件</span></h1>
      <p>输入一个主题，AI 自动编排结构与版式，在浏览器里像 PPT 一样播放。</p>
    </div>

    <div class="composer card">
      <textarea class="composer__input" data-topic
        placeholder="输入一句话主题，例如：用一节课讲清楚什么是机器学习"></textarea>
      <div class="composer__row">
        <label class="field"><span>配色</span>
          <select class="select" data-theme>
            ${THEME_OPTIONS.map((o) => `<option value="${o.value}">${o.label}</option>`).join('')}
          </select>
        </label>
        <label class="field"><span>页数</span>
          <select class="select" data-count>
            <option value="">自动</option>
            <option value="8">约 8 页</option>
            <option value="10">约 10 页</option>
            <option value="12">约 12 页</option>
            <option value="14">约 14 页</option>
          </select>
        </label>
        <label class="field"><span>语气</span>
          <select class="select" data-tone>
            <option value="">自动</option>
            <option value="专业严谨">专业严谨</option>
            <option value="轻松活泼">轻松活泼</option>
            <option value="学术深入">学术深入</option>
            <option value="极简克制">极简克制</option>
          </select>
        </label>
        <div class="composer__actions">
          <button class="btn btn--ghost" data-sample>${icons.play} 看示例</button>
          <button class="btn btn--primary" data-generate>${icons.sparkles} 生成课件</button>
        </div>
      </div>
    </div>

    <div class="examples">
      <div class="examples__label">试试这些主题：</div>
      <div class="chips">
        ${EXAMPLES.map((e) => `<button class="chip" data-example="${escapeHtml(e)}">${escapeHtml(e)}</button>`).join('')}
      </div>
    </div>

    <div data-recent></div>
  `

  const topicEl = view.querySelector<HTMLTextAreaElement>('[data-topic]')!
  const themeEl = view.querySelector<HTMLSelectElement>('[data-theme]')!
  const countEl = view.querySelector<HTMLSelectElement>('[data-count]')!
  const toneEl = view.querySelector<HTMLSelectElement>('[data-tone]')!

  const collectOptions = (): GenerateOptions => ({
    theme: (themeEl.value || undefined) as ThemeName | undefined,
    slideCount: countEl.value ? Number(countEl.value) : undefined,
    tone: toneEl.value || undefined,
  })

  const submit = () => startGuidedGeneration(topicEl.value, collectOptions())

  view.querySelector('[data-generate]')!.addEventListener('click', submit)
  view.querySelector('[data-sample]')!.addEventListener('click', () => navigate('#/play/sample'))
  topicEl.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit()
  })
  view.querySelectorAll<HTMLElement>('[data-example]').forEach((chip) => {
    chip.addEventListener('click', () => {
      topicEl.value = chip.dataset.example ?? ''
      topicEl.focus()
    })
  })

  // Recent decks strip.
  const recentEl = view.querySelector<HTMLElement>('[data-recent]')!
  listDecks()
    .then((decks) => {
      if (!decks.length) return
      const recent = decks.slice(0, 4)
      recentEl.innerHTML = `
        <div class="section-head">
          <h2>最近的课件</h2>
          <a href="#/library">查看全部 →</a>
        </div>
        <div class="deck-grid" data-grid></div>`
      const grid = recentEl.querySelector<HTMLElement>('[data-grid]')!
      for (const deck of recent) {
        const card = document.createElement('div')
        card.className = 'deck-card'
        card.innerHTML = `
          <div class="thumb"></div>
          <div class="deck-card__body">
            <div class="deck-card__title">${escapeHtml(deck.title)}</div>
            <div class="deck-card__meta"><span>${deck.slides.length} 页 · ${formatDate(deck.createdAt)}</span></div>
          </div>`
        card.addEventListener('click', () => navigate(`#/play/${deck.id}`))
        grid.appendChild(card)
        thumbCleanups.push(mountThumb(card.querySelector<HTMLElement>('.thumb')!, deck))
      }
    })
    .catch(() => {
      /* ignore — recent strip is non-critical */
    })

  return () => thumbCleanups.forEach((fn) => fn())
}
