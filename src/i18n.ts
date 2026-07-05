// Lightweight UI internationalization. The *deck content* language follows the
// user's topic (handled by the model); this only translates the app chrome.
//
// Usage: `t('nav.home')`. Missing keys fall back to the key itself, so an
// untranslated string is obvious in dev. `setLang` persists the choice and
// fires a `langchange` event that the shell listens to for a full re-render.

export type Lang = 'zh' | 'en'

const STORAGE_KEY = 'ui-lang'

function detectInitial(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'zh' || saved === 'en') return saved
  } catch {
    /* ignore */
  }
  // Default to Chinese; only auto-pick English for clearly non-Chinese locales.
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : ''
  return /^zh/i.test(nav) || !nav ? 'zh' : 'en'
}

let lang: Lang = detectInitial()

export function getLang(): Lang {
  return lang
}

export function setLang(next: Lang): void {
  if (next === lang) return
  lang = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* ignore */
  }
  document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en'
  window.dispatchEvent(new CustomEvent('langchange'))
}

export function toggleLang(): void {
  setLang(lang === 'zh' ? 'en' : 'zh')
}

interface Entry {
  zh: string
  en: string
}

// Keep keys namespaced by screen. English strings should read naturally, not
// be literal transliterations.
const DICT: Record<string, Entry> = {
  // App shell / nav
  'app.name': { zh: '课件生成器', en: 'Deck Maker' },
  'nav.home': { zh: '首页', en: 'Home' },
  'nav.library': { zh: '我的课件', en: 'My Decks' },
  'nav.settings': { zh: '设置', en: 'Settings' },
  'lang.toggle': { zh: 'EN', en: '中文' },
  'lang.toggleTitle': { zh: 'Switch to English', en: '切换到中文' },

  // Common
  'common.cancel': { zh: '取消', en: 'Cancel' },
  'common.confirm': { zh: '确定', en: 'OK' },
  'common.back': { zh: '返回', en: 'Back' },
  'common.save': { zh: '保存', en: 'Save' },
  'common.loading': { zh: '加载中…', en: 'Loading…' },
  'common.gotIt': { zh: '知道了', en: 'Got it' },
  'common.close': { zh: '关闭', en: 'Close' },
  'common.retry': { zh: '重试', en: 'Retry' },
  'common.next': { zh: '下一步 →', en: 'Next →' },
  'common.prevStep': { zh: '← 上一步', en: '← Back' },
  'common.skip': { zh: '跳过', en: 'Skip' },
  'unit.pages': { zh: '页', en: 'slides' },

  // Shared errors / toasts
  'err.noKey': { zh: '请先在「设置」中填写 API Key', en: 'Add an API key in Settings first' },
  'err.noKeyShort': { zh: '该服务尚未配置 API Key', en: 'This provider has no API key yet' },
  'err.noTopic': { zh: '请先输入一句话主题', en: 'Type a one-line topic first' },

  // Generating overlay
  'gen.title': { zh: '正在生成课件…', en: 'Generating your deck…' },
  'gen.subtitle': { zh: '「{topic}」 · 共 {n} 页', en: '“{topic}” · {n} slides' },
  'gen.connecting': { zh: '正在连接模型…', en: 'Connecting to the model…' },
  'gen.failed': { zh: '生成失败', en: 'Generation failed' },

  // Home
  'home.kicker': { zh: 'AI 课件生成器', en: 'AI Deck Maker' },
  'home.titlePre': { zh: '一句话，生成', en: 'One line becomes a ' },
  'home.titleHi': { zh: '精美课件', en: 'beautiful deck' },
  'home.subtitle': {
    zh: '输入一个主题，AI 自动编排结构与版式，在浏览器里像 PPT 一样播放。',
    en: 'Type a topic; AI arranges the structure and layouts, and it plays like a slideshow in your browser.',
  },
  'home.placeholder': {
    zh: '输入一句话主题，例如：用一节课讲清楚什么是机器学习',
    en: 'Type a one-line topic, e.g. Explain what machine learning is in one lesson',
  },
  'home.field.theme': { zh: '配色', en: 'Theme' },
  'home.field.duration': { zh: '分享时长', en: 'Length' },
  'home.field.tone': { zh: '语气', en: 'Tone' },
  'home.sample': { zh: '看示例', en: 'View sample' },
  'home.generate': { zh: '生成课件', en: 'Generate' },
  'home.examplesLabel': { zh: '试试这些主题：', en: 'Try a topic:' },
  'home.shuffle': { zh: '换一批', en: 'Shuffle' },
  'home.recent': { zh: '最近的课件', en: 'Recent decks' },
  'home.viewAll': { zh: '查看全部 →', en: 'View all →' },

  // Tone options
  'tone.auto': { zh: '自动', en: 'Auto' },
  'tone.pro': { zh: '专业严谨', en: 'Professional' },
  'tone.lively': { zh: '轻松活泼', en: 'Casual' },
  'tone.academic': { zh: '学术深入', en: 'Academic' },
  'tone.minimal': { zh: '极简克制', en: 'Minimal' },

  // Theme options (home — with a style hint)
  'home.theme.auto': { zh: '自动配色', en: 'Auto color' },
  'home.theme.aurora': { zh: '极光（科技）', en: 'Aurora (Tech)' },
  'home.theme.ink': { zh: '水墨（简约）', en: 'Ink (Minimal)' },
  'home.theme.sunrise': { zh: '暖阳（人文）', en: 'Sunrise (Humanities)' },
  'home.theme.forest': { zh: '森林（自然）', en: 'Forest (Nature)' },
  'home.theme.noir': { zh: '深邃（高级）', en: 'Noir (Premium)' },
  'home.theme.sand': { zh: '砂纸（温暖）', en: 'Sand (Warm)' },
  'home.theme.rose': { zh: '玫瑰（明艳）', en: 'Rose (Vivid)' },

  // Library
  'lib.searchPlaceholder': { zh: '搜索课件标题…', en: 'Search deck titles…' },
  'lib.sort.updated': { zh: '最近修改', en: 'Last modified' },
  'lib.sort.created': { zh: '最近创建', en: 'Recently created' },
  'lib.sort.title': { zh: '名称', en: 'Name' },
  'lib.noMatch': { zh: '没有匹配的课件', en: 'No matching decks' },
  'lib.noMatchHint': { zh: '试试换个关键词。', en: 'Try a different keyword.' },
  'lib.emptyTitle': { zh: '还没有课件', en: 'No decks yet' },
  'lib.emptyHint': {
    zh: '回到首页，输入一句话就能生成第一份精美课件。',
    en: 'Head to the home page — one line generates your first deck.',
  },
  'lib.emptyCta': { zh: '去创建', en: 'Create one' },
  'lib.action.edit': { zh: '编辑', en: 'Edit' },
  'lib.action.rename': { zh: '重命名', en: 'Rename' },
  'lib.action.copy': { zh: '复制', en: 'Duplicate' },
  'lib.action.delete': { zh: '删除', en: 'Delete' },
  'lib.renamePrompt': { zh: '重命名课件：', en: 'Rename deck:' },
  'lib.renamed': { zh: '已重命名', en: 'Renamed' },
  'lib.copied': { zh: '已复制', en: 'Duplicated' },
  'lib.copyFailed': { zh: '复制失败', en: 'Duplicate failed' },
  'lib.deleteConfirm': {
    zh: '删除「{title}」？此操作不可撤销。',
    en: 'Delete “{title}”? This cannot be undone.',
  },
  'lib.deleted': { zh: '已删除', en: 'Deleted' },
  'lib.readError': { zh: '读取失败', en: 'Failed to load' },
  'lib.readErrorHint': { zh: '无法读取本地课件库。', en: 'Could not read the local deck library.' },

  // Guided create wizard
  'guided.pickModel': { zh: '选择生成模型', en: 'Choose a model' },
  'guided.pickModelSub': {
    zh: '「{topic}」——先确认用哪个模型生成，可随时在「设置」里更改。',
    en: '“{topic}” — pick the model to generate with; you can change it anytime in Settings.',
  },
  'guided.systemKeyHint': {
    zh: 'DeepSeek 由系统提供、<b>免填 Key</b> 可直接开始；其它模型需填你自己的 API Key。生图模型也需自备 Key，否则只能生成文本型课件。',
    en: 'DeepSeek is provided by the system — <b>no key needed</b> to start. Other models require your own API key. Image models also need your own key, otherwise decks are text-only.',
  },
  'guided.service': { zh: '服务', en: 'Provider' },
  'guided.openaiCompat': { zh: 'OpenAI 兼容', en: 'OpenAI-compatible' },
  'guided.preset': { zh: '预设', en: 'Preset' },
  'guided.model': { zh: '模型', en: 'Model' },
  'guided.thinking': { zh: '思考', en: 'Thinking' },
  'guided.thinkingLabel': { zh: '思考模式（更深入，稍慢）', en: 'Thinking mode (deeper, a bit slower)' },
  'guided.bg': { zh: '背景图', en: 'Backgrounds' },
  'guided.bgLabel': { zh: '为每页自动配一张淡背景图', en: 'Add a subtle background image to each slide' },
  'guided.moreSettings': { zh: '更多设置', en: 'More settings' },
  'guided.start': { zh: '开始 →', en: 'Start →' },
  'guided.bgNote.own': {
    zh: '将用你的 Unsplash / Pexels 服务搜图（画质更好）。',
    en: 'Will search via your Unsplash / Pexels account (better quality).',
  },
  'guided.bgNote.system': {
    zh: '将用系统提供的<b>高清 Unsplash 图库</b>配图（免填 Key）。',
    en: 'Will use the system’s <b>high-res Unsplash library</b> (no key needed).',
  },
  'guided.bgNote.openverse': {
    zh: '默认用免费的 Openverse 图库（免 Key）。想更精致可用 <b>Unsplash / Pexels</b>——去官网免费申请 API Key，再到「更多设置」里填写。',
    en: 'Uses the free Openverse library by default (no key). For nicer images, use <b>Unsplash / Pexels</b> — get a free API key on their site and add it under “More settings”.',
  },
  'guided.willUseSystem': { zh: '将使用系统提供的 DeepSeek · {model}（免填 Key）', en: 'Will use the system DeepSeek · {model} (no key needed)' },
  'guided.willUse': { zh: '将使用 {host} 上的 {model}', en: 'Will use {model} on {host}' },
  'guided.warnNoKey': {
    zh: '⚠ 该服务尚未配置 API Key，请点「更多设置」填写后再生成（DeepSeek 可免填，由系统提供）。',
    en: '⚠ No API key for this provider yet — add one under “More settings” (DeepSeek needs none; it’s system-provided).',
  },
  'guided.qTitle': { zh: '回答 1~2 个关键问题', en: 'Answer 1–2 quick questions' },
  'guided.qSub': {
    zh: '帮我把课件方向定准——选一选或补充即可，可跳过。下一步会先跟你确认整体结构。',
    en: 'Help me aim the deck — pick or add a note, or skip. Next you’ll confirm the overall structure.',
  },
  'guided.qOptimizing': { zh: '正在按主题优化建议…', en: 'Tailoring suggestions to your topic…' },
  'guided.skipToStructure': { zh: '跳过，看整体结构', en: 'Skip to structure' },
  'guided.qCustom': { zh: '补充说明（可选）', en: 'Add a note (optional)' },

  // Viewer / player
  'viewer.timerTitle': { zh: '已用时间（点击归零）', en: 'Elapsed time (click to reset)' },
  'viewer.notes': { zh: '演讲者备注', en: 'Speaker notes' },
  'viewer.overview': { zh: '总览 (O)', en: 'Overview (O)' },
  'viewer.overviewShort': { zh: '幻灯总览', en: 'Slide overview' },
  'viewer.editDeck': { zh: '编辑课件', en: 'Edit deck' },
  'viewer.print': { zh: '导出 PDF / 打印', en: 'Export PDF / Print' },
  'viewer.fullscreen': { zh: '全屏 (F)', en: 'Fullscreen (F)' },
  'viewer.fullscreenShort': { zh: '全屏', en: 'Fullscreen' },
  'viewer.shortcuts': { zh: '快捷键', en: 'Shortcuts' },
  'viewer.help.title': { zh: '播放快捷键', en: 'Playback shortcuts' },
  'viewer.help.nav': { zh: '上一页 / 下一页', en: 'Previous / Next' },
  'viewer.help.speaker': { zh: '演讲者视图（备注 + 计时）', en: 'Speaker view (notes + timer)' },
  'viewer.help.esc': { zh: '退出全屏 / 总览', en: 'Exit fullscreen / overview' },
  'viewer.help.mobile': { zh: '手机：左右滑动翻页，横屏更清晰', en: 'Phone: swipe to flip; landscape is clearer' },
  'viewer.noNote': { zh: '本页没有备注', en: 'No notes for this slide' },
  'viewer.notFound': { zh: '课件不存在', en: 'Deck not found' },
  'viewer.notFoundHint': { zh: '它可能已被删除。', en: 'It may have been deleted.' },
  'viewer.loadError': { zh: '加载失败', en: 'Failed to load' },
  'viewer.rotate.title': { zh: '横屏观看更清晰', en: 'Landscape looks better' },
  'viewer.rotate.sub': {
    zh: '把手机横过来，课件会铺满屏幕；左右滑动翻页。',
    en: 'Turn your phone sideways to fill the screen; swipe to flip.',
  },
  'viewer.rotate.dismiss': { zh: '仍要竖屏播放', en: 'Play in portrait anyway' },

  // Short theme labels (editor / outline / structure pickers)
  'theme.aurora': { zh: '极光', en: 'Aurora' },
  'theme.ink': { zh: '水墨', en: 'Ink' },
  'theme.sunrise': { zh: '暖阳', en: 'Sunrise' },
  'theme.forest': { zh: '森林', en: 'Forest' },
  'theme.noir': { zh: '深邃', en: 'Noir' },
  'theme.sand': { zh: '砂纸', en: 'Sand' },
  'theme.rose': { zh: '玫瑰', en: 'Rose' },
}

export function t(key: string): string {
  const e = DICT[key]
  if (!e) return key
  return e[lang]
}

/** Register more entries (per-screen dictionaries live next to their screens is
 * also fine, but we keep them centralized here). */
export function addEntries(entries: Record<string, Entry>): void {
  Object.assign(DICT, entries)
}
