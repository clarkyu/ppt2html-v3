import { icons } from '../lib/icons'
import { navigate } from '../router'
import { listDecks } from '../store/db'
import { mountThumb } from '../render/preview'
import { formatDate } from '../lib/dom'
import { escapeHtml } from '../lib/markdown'
import { startGuidedGeneration } from './guided'
import { DURATION_OPTIONS, slidesForMinutes } from '../lib/duration'
import type { GenerateOptions, ThemeName } from '../types'

const EXAMPLE_POOL = [
  '用一节课讲清楚什么是机器学习',
  '如何培养孩子的阅读习惯',
  '给新员工介绍公司的核心价值观',
  '三分钟看懂碳中和',
  '宋词的美学世界',
  '给团队做一次高效沟通培训',
  '从零开始理解区块链',
  '健康饮食的科学原理',
  '如何做一次打动人心的演讲',
  '中国茶文化入门',
  '给孩子讲讲太阳系',
  '产品经理的需求分析方法',
  '一文读懂个人所得税',
  '职场新人的时间管理',
  '人工智能的发展简史',
  '如何科学地进行力量训练',
  '古希腊哲学的三位巨匠',
  '带你认识常见的心理学效应',
  '公司财报怎么看',
  '给设计师讲讲色彩搭配',
]
const EXAMPLE_BATCH = 5

function sampleExamples(n: number): string[] {
  const copy = [...EXAMPLE_POOL]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, n)
}

const THEME_OPTIONS: Array<{ value: '' | ThemeName; label: string }> = [
  { value: '', label: '自动配色' },
  { value: 'aurora', label: '极光（科技）' },
  { value: 'ink', label: '水墨（简约）' },
  { value: 'sunrise', label: '暖阳（人文）' },
  { value: 'forest', label: '森林（自然）' },
  { value: 'noir', label: '深邃（高级）' },
  { value: 'sand', label: '砂纸（温暖）' },
  { value: 'rose', label: '玫瑰（明艳）' },
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
        <label class="field"><span>分享时长</span>
          <select class="select" data-duration>
            ${DURATION_OPTIONS.map((o) => `<option value="${o.value}">${o.label}</option>`).join('')}
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
      <div class="examples__head">
        <span class="examples__label">试试这些主题：</span>
        <button class="btn btn--ghost btn--sm" data-shuffle>${icons.refresh} 换一批</button>
      </div>
      <div class="chips" data-examples></div>
    </div>

    <div data-recent></div>
  `

  const topicEl = view.querySelector<HTMLTextAreaElement>('[data-topic]')!
  const themeEl = view.querySelector<HTMLSelectElement>('[data-theme]')!
  const durationEl = view.querySelector<HTMLSelectElement>('[data-duration]')!
  const toneEl = view.querySelector<HTMLSelectElement>('[data-tone]')!

  const collectOptions = (): GenerateOptions => {
    const minutes = durationEl.value ? Number(durationEl.value) : undefined
    return {
      theme: (themeEl.value || undefined) as ThemeName | undefined,
      durationMinutes: minutes,
      slideCount: minutes ? slidesForMinutes(minutes) : undefined,
      tone: toneEl.value || undefined,
    }
  }

  const submit = () => startGuidedGeneration(topicEl.value, collectOptions())

  view.querySelector('[data-generate]')!.addEventListener('click', submit)
  view.querySelector('[data-sample]')!.addEventListener('click', () => navigate('#/play/sample'))
  topicEl.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit()
  })
  const examplesEl = view.querySelector<HTMLElement>('[data-examples]')!
  const renderChips = () => {
    examplesEl.innerHTML = sampleExamples(EXAMPLE_BATCH)
      .map((e) => `<button class="chip" data-example="${escapeHtml(e)}">${escapeHtml(e)}</button>`)
      .join('')
  }
  renderChips()
  examplesEl.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-example]')
    if (!chip) return
    topicEl.value = chip.dataset.example ?? ''
    topicEl.focus()
  })
  view.querySelector('[data-shuffle]')!.addEventListener('click', renderChips)

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
