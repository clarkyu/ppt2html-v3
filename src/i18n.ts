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
  'common.moveUp': { zh: '上移', en: 'Move up' },
  'common.moveDown': { zh: '下移', en: 'Move down' },
  'unit.pages': { zh: '页', en: 'slides' },
  'unit.min': { zh: '分钟', en: 'min' },

  // Structure step
  'struct.loading': { zh: '正在理解需求、规划整体结构…', en: 'Understanding your goal and planning the structure…' },
  'struct.failed': { zh: '结构生成失败', en: 'Structure generation failed' },
  'struct.keepOne': { zh: '至少保留一个部分', en: 'Keep at least one part' },
  'struct.partTitle': { zh: '部分标题', en: 'Part title' },
  'struct.partPages': { zh: '这一部分的页数', en: 'Slides in this part' },
  'struct.partBrief': { zh: '这一部分讲什么（可选）', en: 'What this part covers (optional)' },
  'struct.headPre': { zh: '先确认整体结构 · ', en: 'Confirm the structure · ' },
  'struct.headPost': { zh: ' 个部分', en: ' parts' },
  'struct.headSub': {
    zh: '核对我对需求的理解，以及分成哪几个部分、每部分多少页；下一步会逐个环节细化成具体页面。',
    en: 'Check my read of your goal and how it splits into parts and slide counts; next we detail each part into slides.',
  },
  'struct.totalPre': { zh: '全篇约 ', en: 'About ' },
  'struct.totalMid': { zh: ' 页 · ', en: ' slides · ' },
  'struct.totalPost': { zh: '（含封面 / 结束页）', en: ' total (incl. cover / closing)' },
  'struct.understandLabel': { zh: '我的理解', en: 'My understanding' },
  'struct.understandPlaceholder': {
    zh: '用一句话描述你想要的课件（讲给谁、目的、重点）',
    en: 'Describe the deck in one line (audience, goal, focus)',
  },
  'struct.deckTitle': { zh: '课件标题', en: 'Deck title' },
  'struct.deckSubtitle': { zh: '副标题（可选）', en: 'Subtitle (optional)' },
  'struct.richLabel': {
    zh: '生成更丰富的内容（正文 / 要点，而不只是提纲框架）',
    en: 'Generate richer content (prose / bullet points, not just an outline)',
  },
  'struct.addPart': { zh: '添加一个部分', en: 'Add a part' },
  'struct.regen': { zh: '重新规划', en: 'Re-plan' },
  'struct.next': { zh: '下一步：逐环节细化 →', en: 'Next: detail each part →' },

  // Shared errors / toasts
  'err.noKey': { zh: '请先在「设置」中填写 API Key', en: 'Add an API key in Settings first' },
  'err.noKeyShort': { zh: '该服务尚未配置 API Key', en: 'This provider has no API key yet' },
  'err.noTopic': { zh: '请先输入一句话主题', en: 'Type a one-line topic first' },
  'err.notConfigured': { zh: '尚未配置 API Key，请先在「设置」中填写。', en: 'No API key configured yet — add one in Settings.' },
  'err.invalidDeck': { zh: '模型返回的内容不是有效的课件结构，请重试。', en: 'The model’s response wasn’t a valid deck. Please retry.' },
  'err.modelError': { zh: '模型返回错误', en: 'The model returned an error' },
  'err.httpPrefix': { zh: '请求失败（HTTP {status}）：', en: 'Request failed (HTTP {status}): ' },
  'err.noJson': { zh: '模型没有返回有效的 JSON', en: 'The model did not return valid JSON' },
  'err.network': {
    zh: '请求未能完成(浏览器只报了网络 / CORS 错误)。常见两种原因:① API Key 无效或账户无额度——密钥被拒时,若对方的错误响应缺少 CORS 头,浏览器会把真正的 401 藏起来、只显示网络/CORS 错误,请到「设置」核对 Key、确认账户已绑支付/有余额;② 你的网络无法直连该服务(如 api.openai.com 在中国大陆常需代理/VPN,或被浏览器插件/防火墙拦截)。可先用免 Key、可直连的 DeepSeek,或核对 Key 后重试。',
    en: 'The request didn’t complete (the browser only reports a network/CORS error). Two common causes: (1) an invalid API key or no account balance — when a key is rejected and the error response lacks CORS headers, the browser hides the real 401 and shows only a network/CORS error, so check your key and billing in Settings; (2) your network can’t reach the endpoint directly (e.g. api.openai.com often needs a proxy/VPN in mainland China, or is blocked by an extension/firewall). Try the built-in DeepSeek (no key) or fix the key and retry.',
  },

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

  // Deck default text
  'deck.thanks': { zh: '谢谢观看', en: 'Thank you' },
  'struct.newPart': { zh: '新部分', en: 'New part' },

  // Layout names
  'layout.cover': { zh: '封面', en: 'Cover' },
  'layout.section': { zh: '章节分隔', en: 'Section' },
  'layout.bullets': { zh: '要点', en: 'Bullets' },
  'layout.twoCol': { zh: '两栏对照', en: 'Two columns' },
  'layout.bigNumber': { zh: '大数字', en: 'Big number' },
  'layout.quote': { zh: '金句', en: 'Quote' },
  'layout.comparison': { zh: '对比卡片', en: 'Comparison' },
  'layout.timeline': { zh: '时间线', en: 'Timeline' },
  'layout.code': { zh: '代码', en: 'Code' },
  'layout.imageText': { zh: '图文', en: 'Image + text' },
  'layout.end': { zh: '结束', en: 'Closing' },

  // Outline (per-part) step
  'outline.crumb': { zh: '环节 {i} / {n}', en: 'Step {i} / {n}' },
  'outline.detailing': { zh: '正在细化：{title}', en: 'Detailing: {title}' },
  'outline.detailingSub': { zh: '约 {pages} 页 · 逐页规划中，实时显示 ↓', en: '~{pages} slides · planning page by page, live ↓' },
  'outline.partFailed': { zh: '这一环节生成失败', en: 'This part failed to generate' },
  'outline.stepNth': { zh: '第 {i} 步 / 共 {n} 步', en: 'Step {i} of {n}' },
  'outline.coverTitle': { zh: '封面页', en: 'Cover slide' },
  'outline.coverSub': { zh: '确认课件封面', en: 'Confirm the cover' },
  'outline.endTitle': { zh: '结束页', en: 'Closing slide' },
  'outline.endSub': { zh: '确认收尾页', en: 'Confirm the closing slide' },
  'outline.partN': { zh: '第 {n} 部分 · {title}', en: 'Part {n} · {title}' },
  'outline.partSub': { zh: '约 {pages} 页 · 确认这一环节', en: '~{pages} slides · confirm this part' },
  'outline.addPage': { zh: '添加一页', en: 'Add a slide' },
  'outline.adjustPlaceholder': {
    zh: '想怎么调整这一环节？（可选：多举例 / 精简为要点 / 换个切入角度…）',
    en: 'How should this part change? (optional: more examples / trim to bullets / new angle…)',
  },
  'outline.prevPart': { zh: '← 上一环节', en: '← Previous part' },
  'outline.regenPart': { zh: '重新生成本环节', en: 'Regenerate this part' },
  'outline.nextOverview': { zh: '确认，看总览 →', en: 'Confirm, see overview →' },
  'outline.nextPart': { zh: '确认，下一环节 →', en: 'Confirm, next part →' },
  'outline.keepOnePage': { zh: '至少保留一页', en: 'Keep at least one slide' },
  'outline.pickLayout': { zh: '选择版式', en: 'Choose layout' },
  'outline.rowTitle': { zh: '这一页讲什么？', en: 'What’s on this slide?' },
  'outline.rowBrief': { zh: '要点 / 内容简述（可选）', en: 'Key point / brief (optional)' },
  'outline.ovPre': { zh: '整份大纲总览 · 共 ', en: 'Full outline · ' },
  'outline.ovPost': { zh: ' 页', en: ' slides' },
  'outline.ovSub': {
    zh: '按环节分类，点标题左侧箭头可折叠；可增删部分、在某环节内加页，或用「去修改」/「上一步」回到逐环节修改。满意后再生成完整课件。',
    en: 'Grouped by part — collapse with the arrow. Add/remove parts, add slides within a part, or use “Edit” / “Back” to revisit a part. Generate the full deck when you’re happy.',
  },
  'outline.foldTitle': { zh: '折叠 / 展开', en: 'Collapse / expand' },
  'outline.goEdit': { zh: '去修改', en: 'Edit' },
  'outline.delPart': { zh: '删除此部分', en: 'Delete this part' },
  'outline.addPageHere': { zh: '在此环节加一页', en: 'Add a slide here' },
  'outline.ovPrev': { zh: '← 上一步（逐环节修改）', en: '← Back (edit by part)' },
  'outline.ovGenerate': { zh: '生成课件 →', en: 'Generate deck →' },

  // Settings
  'settings.systemNotice': {
    zh: '默认使用 <b>系统提供的 DeepSeek（{model}）</b>——免填 API Key，开箱即用。想用 Claude / OpenAI / Gemini 等其它模型，请在下方填写你自己的 API Key。<br>生图模型需自备 API Key；未提供时只能生成文本型课件。',
    en: 'Uses the <b>system-provided DeepSeek ({model})</b> by default — no API key needed. To use Claude / OpenAI / Gemini and others, add your own API key below.<br>Image models need your own key; without one, decks are text-only.',
  },
  'settings.presets': { zh: '快速预设', en: 'Quick presets' },
  'settings.presetsHint': {
    zh: '一键填好 base URL 与模型；再填入对应服务的 API Key 并保存即可。',
    en: 'Fills the base URL and model in one click; then add that provider’s API key and save.',
  },
  'settings.provider': { zh: '模型服务', en: 'Provider' },
  'settings.baseUrl': { zh: 'API Base URL', en: 'API base URL' },
  'settings.apiKey': { zh: 'API Key', en: 'API key' },
  'settings.apiKeyPlaceholder': { zh: '粘贴你的 API Key', en: 'Paste your API key' },
  'settings.apiKeyHint': {
    zh: '仅保存在本机浏览器（localStorage），只会发送给你上面填写的服务地址。',
    en: 'Stored only in your browser (localStorage) and sent only to the endpoint above.',
  },
  'settings.customModel': { zh: '输入自定义模型 ID', en: 'Enter a custom model ID' },
  'settings.customOption': { zh: '自定义…', en: 'Custom…' },
  'settings.modelHint': {
    zh: '从常见模型中选择；如需其它模型请选「自定义…」自行填写。',
    en: 'Pick a common model; choose “Custom…” to enter any other model ID.',
  },
  'settings.thinkingMode': { zh: '思考模式', en: 'Thinking mode' },
  'settings.thinkingLabel': { zh: '开启思考 / 推理（更深入，但更慢）', en: 'Enable thinking / reasoning (deeper, but slower)' },
  'settings.thinkingHint': {
    zh: '仅对支持思考模式的模型生效，如 DeepSeek V4（v4-flash / v4-pro）。',
    en: 'Only applies to models that support it, e.g. DeepSeek V4 (v4-flash / v4-pro).',
  },
  'settings.bgImages': { zh: '页面背景图', en: 'Slide backgrounds' },
  'settings.bgLabel': { zh: '自动为每页配一张相关的淡背景图', en: 'Add a subtle, relevant background image to each slide' },
  'settings.bgHint.system': {
    zh: '默认已由<b>系统提供的高清图库（Unsplash）</b>配图——开箱即用、免填 Key。若填入你自己的 Unsplash / Pexels Key，则优先用你的。',
    en: 'Backed by the <b>system’s high-res library (Unsplash)</b> by default — no key needed. Add your own Unsplash / Pexels key to use it instead.',
  },
  'settings.bgHint.openverse': {
    zh: '默认用免费的 <b>Openverse</b> 图库搜索（CC 授权、<b>无需 Key</b>、开箱即用）。想要更高画质/更贴合，可填下面任一图片 Key（有则优先用 Unsplash）——<b>Unsplash / Pexels 都可去官网免费申请 API Key</b>。',
    en: 'Uses the free <b>Openverse</b> library by default (CC-licensed, <b>no key</b>). For higher quality, add an image key below (Unsplash is preferred if set) — <b>both Unsplash and Pexels offer free API keys</b>.',
  },
  'settings.bgHint.tail': {
    zh: '背景很淡、不干扰阅读，右下角会标注图片来源。',
    en: ' Backgrounds are faint and unobtrusive; the source is credited in the corner.',
  },
  'settings.unsplashPlaceholder': { zh: 'Unsplash Access Key（可选）', en: 'Unsplash Access Key (optional)' },
  'settings.pexelsPlaceholder': { zh: 'Pexels API Key（可选）', en: 'Pexels API Key (optional)' },
  'settings.imgKeyHint': {
    zh: '这些是「图片搜索」Key，仅用于给页面配背景照片，只存本机。',
    en: 'These are image-search keys, used only to fetch slide backgrounds, stored locally.',
  },
  'settings.branding': { zh: '署名信息（人 / 单位 / Logo）', en: 'Branding (presenter / org / logo)' },
  'settings.brandingHint': {
    zh: '填一次作为全局默认，新课件自动带上；每份课件也可在编辑器里单独覆盖。日期默认用生成当天。会显示在封面/结束页与每页角落。',
    en: 'Set once as a global default for new decks; each deck can override it in the editor. Date defaults to the generation day. Shown on the cover/closing and in each slide’s corner.',
  },
  'settings.presenter': { zh: '演示者 / 姓名', en: 'Presenter / name' },
  'settings.org': { zh: '单位 / 组织', en: 'Organization' },
  'settings.logoUrl': { zh: 'Logo 图片网址（或点右侧上传）', en: 'Logo image URL (or upload →)' },
  'settings.upload': { zh: '上传', en: 'Upload' },
  'settings.corsNotice': {
    zh: '提示：这是纯前端应用，部分第三方端点可能因 CORS 限制无法在浏览器直接调用。Claude 与 OpenAI 官方端点均支持浏览器直连。',
    en: 'Note: this is a front-end-only app; some third-party endpoints may block direct browser calls (CORS). The official Claude and OpenAI endpoints allow browser access.',
  },
  'settings.save': { zh: '保存设置', en: 'Save settings' },
  'settings.reset': { zh: '恢复默认', en: 'Reset to defaults' },
  'settings.note.anthropic': {
    zh: 'Claude（Anthropic）。浏览器直连 api.anthropic.com（已带浏览器直连标头）。',
    en: 'Claude (Anthropic). Connects directly to api.anthropic.com from the browser (with the direct-access header).',
  },
  'settings.note.openai': {
    zh: 'OpenAI 兼容端点。base URL 可改为 Gemini / DeepSeek / 通义千问 / 智谱 / Grok / Mistral / OpenRouter 等兼容服务；模型名填对应服务的模型 ID。',
    en: 'OpenAI-compatible endpoint. Change the base URL to Gemini / DeepSeek / Qwen / GLM / Grok / Mistral / OpenRouter, etc.; set the model to that provider’s model ID.',
  },
  'settings.keyOptional': { zh: '可留空 —— DeepSeek 由系统提供', en: 'Optional — DeepSeek is system-provided' },
  'settings.keyCovered': {
    zh: '此服务已由系统提供 Key，可留空直接使用；如填入你自己的 Key，则优先用你的。',
    en: 'This provider has a system key; leave blank to use it, or enter your own to override.',
  },
  'settings.switchedTo': { zh: '已切到 {label}，填好 API Key 后记得保存', en: 'Switched to {label} — add the API key and save' },
  'settings.logoTooBig': { zh: 'Logo 图片太大，请用小于 ~900KB 的图片', en: 'Logo image is too large — use one under ~900KB' },
  'settings.saved': { zh: '设置已保存', en: 'Settings saved' },
  'settings.resetDone': { zh: '已恢复默认（未保存）', en: 'Reset to defaults (not yet saved)' },

  // Editor
  'ed.title': { zh: '编辑课件', en: 'Edit deck' },
  'ed.backToLibrary': { zh: '← 返回课件库', en: '← Back to library' },
  'ed.subtitle': { zh: '副标题', en: 'Subtitle' },
  'ed.theme': { zh: '配色主题', en: 'Theme' },
  'ed.name': { zh: '姓名', en: 'Name' },
  'ed.org': { zh: '单位', en: 'Org' },
  'ed.date': { zh: '日期', en: 'Date' },
  'ed.datePlaceholder': { zh: '如 2026-07-05', en: 'e.g. 2026-07-05' },
  'ed.logoPlaceholder': { zh: '图片网址，或点上传', en: 'Image URL, or upload' },
  'ed.addSlide': { zh: '添加一页', en: 'Add slide' },
  'ed.play': { zh: '播放', en: 'Play' },
  'ed.unsaved': { zh: '未保存', en: 'Unsaved' },
  'ed.saved': { zh: '已保存', en: 'Saved' },
  'ed.newSlide': { zh: '新的一页', en: 'New slide' },
  'ed.newBullet': { zh: '要点一', en: 'Point one' },
  'ed.newCard': { zh: '新方案', en: 'New option' },
  'ed.newStep': { zh: '新步骤', en: 'New step' },
  'ed.writeInstruction': { zh: '先写下想怎么改这一页', en: 'Describe how to change this slide first' },
  'ed.rewriting': { zh: 'AI 重写中…', en: 'Rewriting…' },
  'ed.rewritten': { zh: '已重写这一页', en: 'Slide rewritten' },
  'ed.rewriteFailed': { zh: '重写失败：', en: 'Rewrite failed: ' },
  'ed.aiRewrite': { zh: 'AI 重写本页', en: 'AI rewrite' },
  'ed.bgDisabled': { zh: '已在「设置」里关闭了背景图', en: 'Backgrounds are turned off in Settings' },
  'ed.noImage': { zh: '没找到合适的图片，换个说法或稍后再试', en: 'No suitable image found — try different wording or later' },
  'ed.bgChanged': { zh: '已换背景图', en: 'Background changed' },
  'ed.bgFailed': { zh: '换背景图失败，请稍后再试', en: 'Failed to change background — try again later' },
  'ed.bgOn': { zh: '🖼 已配背景图（很淡）', en: '🖼 Background set (subtle)' },
  'ed.bgOff': { zh: '未配背景图', en: 'No background' },
  'ed.bgRefresh': { zh: '换背景图', en: 'Change background' },
  'ed.bgRemove': { zh: '移除背景', en: 'Remove background' },
  'ed.instructPlaceholder': {
    zh: '想怎么改这一页的内容？（例如：换成更具体的例子、语气更活泼、补一个数据…）',
    en: 'How should this slide change? (e.g. a more concrete example, livelier tone, add a stat…)',
  },
  'ed.addCard': { zh: '添加一张卡片', en: 'Add a card' },
  'ed.addStep': { zh: '添加一步', en: 'Add a step' },
  'ed.f.eyebrow': { zh: '小标签', en: 'Eyebrow' },
  'ed.f.title': { zh: '标题', en: 'Title' },
  'ed.f.closing': { zh: '结束语', en: 'Closing line' },
  'ed.f.closingSub': { zh: '收尾副标题', en: 'Closing subtitle' },
  'ed.f.pageTitle': { zh: '页标题', en: 'Slide title' },
  'ed.f.pageTitleOpt': { zh: '页标题（可选）', en: 'Slide title (optional)' },
  'ed.f.bullets': { zh: '要点（每行一条）', en: 'Bullets (one per line)' },
  'ed.f.note': { zh: '讲者备注', en: 'Speaker note' },
  'ed.f.value': { zh: '关键数字', en: 'Key number' },
  'ed.f.caption': { zh: '说明', en: 'Caption' },
  'ed.f.quote': { zh: '金句', en: 'Quote' },
  'ed.f.author': { zh: '出处', en: 'Attribution' },
  'ed.f.body': { zh: '正文（支持 Markdown）', en: 'Body (Markdown supported)' },
  'ed.f.language': { zh: '语言', en: 'Language' },
  'ed.f.code': { zh: '代码', en: 'Code' },
  'ed.f.leftHeading': { zh: '左栏标题', en: 'Left heading' },
  'ed.f.leftBullets': { zh: '左栏要点', en: 'Left bullets' },
  'ed.f.rightHeading': { zh: '右栏标题', en: 'Right heading' },
  'ed.f.rightBullets': { zh: '右栏要点', en: 'Right bullets' },
  'ed.f.cardTitle': { zh: '卡片标题', en: 'Card title' },
  'ed.f.pointsPerLine': { zh: '每行一条要点', en: 'One point per line' },
  'ed.f.stepLabel': { zh: '阶段 / 步骤', en: 'Stage / step' },
  'ed.f.stepText': { zh: '说明（可选）', en: 'Description (optional)' },
  'ed.tone.neutral': { zh: '中性', en: 'Neutral' },
  'ed.tone.positive': { zh: '正面', en: 'Positive' },
  'ed.tone.negative': { zh: '反面', en: 'Negative' },

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
