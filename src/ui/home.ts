import { icons } from '../lib/icons'
import { navigate } from '../router'
import { listDecks } from '../store/db'
import { mountThumb } from '../render/preview'
import { formatDate } from '../lib/dom'
import { escapeHtml } from '../lib/markdown'
import { startGuidedGeneration } from './guided'
import { durationOptions, slidesForMinutes } from '../lib/duration'
import { getLang, t } from '../i18n'
import type { GenerateOptions, ThemeName } from '../types'

const EXAMPLE_POOL_ZH = [
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
const EXAMPLE_POOL_EN = [
  'Explain what machine learning is in one lesson',
  'How to build a reading habit in kids',
  'Onboard new hires to our core values',
  'Understand carbon neutrality in three minutes',
  'An intro to the aesthetics of Song poetry',
  'Run a workshop on effective team communication',
  'Understand blockchain from scratch',
  'The science of healthy eating',
  'How to give a talk that moves people',
  'An introduction to Chinese tea culture',
  'Explain the solar system to kids',
  "A product manager's guide to requirements analysis",
  'Personal income tax, explained simply',
  'Time management for new professionals',
  'A brief history of artificial intelligence',
  'How to train strength the scientific way',
  'Three giants of ancient Greek philosophy',
  'Common psychological effects, explained',
  'How to read a company financial report',
  'A designer’s primer on color pairing',
]
const EXAMPLE_BATCH = 5

function sampleExamples(n: number): string[] {
  const copy = [...(getLang() === 'en' ? EXAMPLE_POOL_EN : EXAMPLE_POOL_ZH)]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, n)
}

const THEME_OPTIONS: Array<{ value: '' | ThemeName; key: string }> = [
  { value: '', key: 'home.theme.auto' },
  { value: 'aurora', key: 'home.theme.aurora' },
  { value: 'ink', key: 'home.theme.ink' },
  { value: 'sunrise', key: 'home.theme.sunrise' },
  { value: 'forest', key: 'home.theme.forest' },
  { value: 'noir', key: 'home.theme.noir' },
  { value: 'sand', key: 'home.theme.sand' },
  { value: 'rose', key: 'home.theme.rose' },
]

const TONE_OPTIONS: Array<{ value: string; key: string }> = [
  { value: '', key: 'tone.auto' },
  { value: '专业严谨', key: 'tone.pro' },
  { value: '轻松活泼', key: 'tone.lively' },
  { value: '学术深入', key: 'tone.academic' },
  { value: '极简克制', key: 'tone.minimal' },
]

export function renderHome(view: HTMLElement): () => void {
  const thumbCleanups: Array<() => void> = []

  view.innerHTML = `
    <div class="hero">
      <div class="hero__kicker">${icons.sparkles} ${t('home.kicker')}</div>
      <h1>${t('home.titlePre')}<span class="grad">${t('home.titleHi')}</span></h1>
      <p>${t('home.subtitle')}</p>
    </div>

    <div class="composer card">
      <textarea class="composer__input" data-topic
        placeholder="${escapeHtml(t('home.placeholder'))}"></textarea>
      <div class="composer__row">
        <label class="field"><span>${t('home.field.theme')}</span>
          <select class="select" data-theme>
            ${THEME_OPTIONS.map((o) => `<option value="${o.value}">${escapeHtml(t(o.key))}</option>`).join('')}
          </select>
        </label>
        <label class="field"><span>${t('home.field.duration')}</span>
          <select class="select" data-duration>
            ${durationOptions().map((o) => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join('')}
          </select>
        </label>
        <label class="field"><span>${t('home.field.tone')}</span>
          <select class="select" data-tone>
            ${TONE_OPTIONS.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(t(o.key))}</option>`).join('')}
          </select>
        </label>
        <div class="composer__actions">
          <button class="btn btn--ghost" data-sample>${icons.play} ${t('home.sample')}</button>
          <button class="btn btn--primary" data-generate>${icons.sparkles} ${t('home.generate')}</button>
        </div>
      </div>
    </div>

    <div class="examples">
      <div class="examples__head">
        <span class="examples__label">${t('home.examplesLabel')}</span>
        <button class="btn btn--ghost btn--sm" data-shuffle>${icons.refresh} ${t('home.shuffle')}</button>
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
          <h2>${t('home.recent')}</h2>
          <a href="#/library">${t('home.viewAll')}</a>
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
            <div class="deck-card__meta"><span>${deck.slides.length} ${t('unit.pages')} · ${formatDate(deck.createdAt)}</span></div>
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
