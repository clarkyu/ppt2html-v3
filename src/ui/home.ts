import { icons } from '../lib/icons'
import { navigate } from '../router'
import { listDecks } from '../store/db'
import { mountThumb } from '../render/preview'
import { formatDate } from '../lib/dom'
import { escapeHtml } from '../lib/markdown'
import { startGuidedGeneration } from './guided'
import { startPageOutline } from './outline'
import { quickGenerateAndPlay } from './generating'
import { loadDraft, clearDraft } from '../lib/draft'
import { durationOptions, slidesForMinutes } from '../lib/duration'
import { getLang, t } from '../i18n'
import { toast } from '../lib/toast'
import { MATERIAL_MAX_CHARS } from '../llm/prompt'
import { clampChars } from '../lib/materialSlice'
import { loadComposer, saveComposer } from '../lib/composer'
import { disposeAllOverlays, overlayOpen } from '../lib/overlay'
import type { GenerateOptions, ThemeName } from '../types'

/** Minimal Web Speech API surface (not in lib.dom; prefixed on Chrome/Safari). */
interface SpeechRecLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error?: string }) => void) | null
  start(): void
  stop(): void
}

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
      <div class="composer__inputwrap">
        <textarea class="composer__input" data-topic
          placeholder="${escapeHtml(t('home.placeholder'))}"></textarea>
        <div class="composer__inputtools">
          <button class="btn btn--ghost btn--sm" data-voice hidden title="${escapeHtml(t('home.voice'))}">${icons.mic}</button>
          <button class="btn btn--ghost btn--sm" data-paste hidden title="${escapeHtml(t('home.paste'))}">${icons.clipboard}</button>
        </div>
      </div>
      <details class="composer__material" data-material-box>
        <summary>${icons.note} ${t('home.materialSummary')}</summary>
        <textarea class="composer__input composer__material-input" data-material rows="5" maxlength="${MATERIAL_MAX_CHARS}"
          placeholder="${escapeHtml(t('home.materialPlaceholder'))}"></textarea>
        <div class="composer__material-row">
          <button class="btn btn--ghost btn--sm" data-material-file>${icons.upload} ${t('home.materialUpload')}</button>
          <input type="file" data-material-input accept=".txt,.md,.markdown,.pdf,.docx" hidden>
          <p class="composer__material-hint">${t('home.materialHint')}</p>
        </div>
      </details>
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
          <button class="btn btn--ghost" data-templates title="${escapeHtml(t('home.templatesHint'))}">${icons.library} ${t('home.templates')}</button>
          <button class="btn btn--ghost" data-generate title="${escapeHtml(t('home.customHint'))}">${icons.settings} ${t('home.custom')}</button>
          <button class="btn btn--primary" data-quick title="${escapeHtml(t('home.quickHint'))}">${icons.sparkles} ${t('home.quick')}</button>
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
  const materialEl = view.querySelector<HTMLTextAreaElement>('[data-material]')!
  const materialBox = view.querySelector<HTMLDetailsElement>('[data-material-box]')!
  const themeEl = view.querySelector<HTMLSelectElement>('[data-theme]')!
  const durationEl = view.querySelector<HTMLSelectElement>('[data-duration]')!
  const toneEl = view.querySelector<HTMLSelectElement>('[data-tone]')!

  // The composer survives a trip to Settings / a language toggle (both
  // remount this screen): restore, then keep the snapshot current.
  const setSelect = (sel: HTMLSelectElement, value: string): void => {
    if ([...sel.options].some((o) => o.value === value)) sel.value = value
  }
  const savedComposer = loadComposer()
  if (savedComposer) {
    topicEl.value = savedComposer.topic
    materialEl.value = savedComposer.material
    materialBox.open = savedComposer.materialOpen || !!savedComposer.material
    setSelect(themeEl, savedComposer.theme)
    setSelect(durationEl, savedComposer.duration)
    setSelect(toneEl, savedComposer.tone)
  }
  const persistComposer = (): void =>
    saveComposer({
      topic: topicEl.value,
      material: materialEl.value,
      theme: themeEl.value,
      duration: durationEl.value,
      tone: toneEl.value,
      materialOpen: materialBox.open,
    })
  topicEl.addEventListener('input', persistComposer)
  materialEl.addEventListener('input', persistComposer)
  for (const sel of [themeEl, durationEl, toneEl]) sel.addEventListener('change', persistComposer)
  materialBox.addEventListener('toggle', persistComposer)

  // Unfinished outline-wizard draft → offer to resume where the user left off.
  // Re-rendered on 'draftchange' (the wizard exiting deliberately) so the card
  // appears the moment the draft exists, not on the next visit.
  const renderDraftNote = (): void => {
    view.querySelector('.draft-note')?.remove()
    const draft = loadDraft()
    if (!draft) return
    const note = document.createElement('div')
    note.className = 'draft-note card'
    note.innerHTML = `
      <div class="draft-note__text">
        <b>${t('home.draftTitle')}</b>
        <span>${escapeHtml(draft.structure.title || draft.topic)}</span>
      </div>
      <div class="draft-note__actions">
        <button class="btn btn--primary btn--sm" data-draft-resume>${t('home.draftResume')}</button>
        <button class="btn btn--ghost btn--sm" data-draft-discard>${t('home.draftDiscard')}</button>
      </div>`
    view.querySelector('.hero')!.after(note)
    note.querySelector('[data-draft-resume]')!.addEventListener('click', () => {
      if (overlayOpen()) return
      try {
        startPageOutline(draft.topic, draft.opts, draft.structure, { results: draft.results, step: draft.step })
      } catch {
        // A draft that passed the shape check but still can't be resumed must
        // not leave a blank overlay on screen.
        disposeAllOverlays()
        clearDraft()
        renderDraftNote()
        toast(t('home.draftBroken'))
      }
    })
    note.querySelector('[data-draft-discard]')!.addEventListener('click', () => {
      clearDraft()
      note.remove()
    })
  }
  renderDraftNote()
  window.addEventListener('draftchange', renderDraftNote)

  const collectOptions = (): GenerateOptions => {
    const minutes = durationEl.value ? Number(durationEl.value) : undefined
    return {
      theme: (themeEl.value || undefined) as ThemeName | undefined,
      durationMinutes: minutes,
      slideCount: minutes ? slidesForMinutes(minutes) : undefined,
      tone: toneEl.value || undefined,
      material: materialEl.value.trim() || undefined,
    }
  }

  // One launch at a time: a held Ctrl+Enter (key auto-repeat) or a double
  // tap used to open several parallel, billed generations.
  const submit = () => {
    if (overlayOpen()) return
    startGuidedGeneration(topicEl.value, collectOptions())
  }
  const quick = () => {
    if (overlayOpen()) return
    quickGenerateAndPlay(topicEl.value, collectOptions())
  }

  view.querySelector('[data-generate]')!.addEventListener('click', submit)
  view.querySelector('[data-quick]')!.addEventListener('click', quick)
  view.querySelector('[data-sample]')!.addEventListener('click', () => navigate('#/play/sample'))
  view.querySelector('[data-templates]')!.addEventListener('click', () => navigate('#/templates'))
  topicEl.addEventListener('keydown', (e) => {
    if (e.repeat) return
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') quick()
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
    persistComposer()
    topicEl.focus()
  })
  view.querySelector('[data-shuffle]')!.addEventListener('click', renderChips)

  // Voice input — typing is the biggest friction on phones; speaking the topic
  // beats it. Hidden when the (prefixed) Web Speech API is absent.
  const w = window as unknown as Record<string, unknown>
  const SR = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => SpeechRecLike) | undefined
  const voiceBtn = view.querySelector<HTMLButtonElement>('[data-voice]')!
  let rec: SpeechRecLike | null = null
  if (SR) {
    voiceBtn.hidden = false
    voiceBtn.addEventListener('click', () => {
      if (rec) {
        rec.stop() // second tap ends the take; onend clears state
        return
      }
      const r = new SR()
      r.lang = getLang() === 'zh' ? 'zh-CN' : 'en-US'
      r.interimResults = false
      r.maxAlternatives = 1
      r.onresult = (e) => {
        let heard = ''
        for (let i = 0; i < e.results.length; i++) heard += e.results[i][0]?.transcript ?? ''
        heard = heard.trim()
        if (!heard) return
        const cur = topicEl.value.trim()
        topicEl.value = cur ? `${cur} ${heard}` : heard
        persistComposer()
      }
      r.onend = () => {
        rec = null
        voiceBtn.classList.remove('listening')
        topicEl.focus()
      }
      r.onerror = (e) => {
        // 'aborted' = user stopped it; 'no-speech' = silence — neither is worth a toast.
        if (e.error !== 'aborted' && e.error !== 'no-speech') toast(t('home.voiceFailed'))
      }
      try {
        r.start()
        rec = r
        voiceBtn.classList.add('listening')
      } catch {
        toast(t('home.voiceFailed'))
      }
    })
  }

  // Every way text enters the material box (file import, one-tap paste) goes
  // through here: merge, cap at the prompt limit (surrogate-safe) and SAY so —
  // the textarea's maxlength only guards typing, not programmatic writes, so
  // pasted over-limit material used to be cut downstream without a word.
  const appendMaterial = (text: string, sep = '\n\n'): boolean => {
    const cur = materialEl.value.trim()
    const merged = cur ? `${cur}${sep}${text}` : text
    materialEl.value = clampChars(merged, MATERIAL_MAX_CHARS)
    const truncated = merged.length > MATERIAL_MAX_CHARS
    if (truncated) toast(t('home.materialTruncated').replace('{n}', String(MATERIAL_MAX_CHARS)))
    persistComposer()
    materialEl.focus()
    return truncated
  }

  // File → material: .txt/.md read directly, .pdf/.docx parsed on-device
  // (lazy-loaded parsers, see lib/extractText). Appends into the box.
  const fileBtn = view.querySelector<HTMLButtonElement>('[data-material-file]')!
  const fileInput = view.querySelector<HTMLInputElement>('[data-material-input]')!
  fileBtn.addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    fileInput.value = '' // same file re-selectable
    if (!file) return
    fileBtn.disabled = true
    const label = fileBtn.innerHTML
    fileBtn.textContent = t('home.materialParsing')
    void import('../lib/extractText')
      .then(({ extractFileText }) => extractFileText(file))
      .then(({ text, decodedAs }) => {
        const truncated = appendMaterial(text)
        if (decodedAs === 'gbk') toast(t('home.materialDecodedGbk'))
        else if (!truncated) toast(t('home.materialParsed').replace('{n}', String(text.length)))
      })
      .catch((err: Error) => toast(err.message || t('home.materialParseFailed')))
      .finally(() => {
        fileBtn.disabled = false
        fileBtn.innerHTML = label
      })
  })

  // One-tap paste — the mobile path is “copy from a chat → drop it here”.
  // With the material box open, that's where pasted content belongs.
  const pasteBtn = view.querySelector<HTMLButtonElement>('[data-paste]')!
  if (typeof navigator.clipboard?.readText === 'function') {
    pasteBtn.hidden = false
    pasteBtn.addEventListener('click', () => {
      navigator.clipboard
        .readText()
        .then((text) => {
          const got = text.trim()
          if (!got) {
            toast(t('home.pasteEmpty'))
            return
          }
          if (materialBox.open) {
            appendMaterial(got, '\n')
            return
          }
          const cur = topicEl.value.trim()
          topicEl.value = cur ? `${cur} ${got}` : got
          persistComposer()
          topicEl.focus()
        })
        .catch(() => toast(t('home.pasteFailed'))) // permission denied / insecure context
    })
  }

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
          <a class="deck-card__link" href="#/play/${deck.id}">
            <div class="thumb"></div>
            <div class="deck-card__body">
              <div class="deck-card__title">${escapeHtml(deck.title)}</div>
              <div class="deck-card__meta"><span>${deck.slides.length} ${t('unit.pages')} · ${formatDate(deck.createdAt)}</span></div>
            </div>
          </a>`
        grid.appendChild(card)
        thumbCleanups.push(mountThumb(card.querySelector<HTMLElement>('.thumb')!, deck))
      }
    })
    .catch(() => {
      /* ignore — recent strip is non-critical */
    })

  return () => {
    rec?.stop()
    window.removeEventListener('draftchange', renderDraftNote)
    thumbCleanups.forEach((fn) => fn())
  }
}
