// Prompt-quality regression harness. Generates (or loads) decks for a fixed
// golden set and scores them mechanically, so a DECK_SCHEMA_GUIDE change can
// be judged by deltas instead of vibes.
//
// Modes:
//   node scripts/eval/run-eval.mjs --local          # sample deck + 6 templates, zero API
//   node scripts/eval/run-eval.mjs                  # golden-set generation (needs env key)
//   node scripts/eval/run-eval.mjs --mock           # scorer self-test on built-in fixtures
//   ... --baseline scripts/eval/results/<run>/scores.json   # print deltas vs a past run
//   ... --only train-comm,report-q2                 # subset of golden topics
//   ... --no-render                                 # skip the browser overflow pass
//
// Real-generation env (BYOK, never committed):
//   EVAL_LLM_BASE=https://api.deepseek.com  EVAL_LLM_KEY=sk-...  EVAL_LLM_MODEL=deepseek-chat
//
// The app pipeline itself (client → extractJson → normalizeDeck) runs inside a
// headless browser against the Vite dev server, so the eval measures exactly
// what the product ships. Playwright module/browser paths are resolved from
// the environment (see resolvePlaywright) for sandbox vs laptop portability.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { TOPICS } from './topics.mjs'
import { scoreDeck, summarize } from './score.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const val = (f) => {
  const i = args.indexOf(f)
  return i >= 0 ? args[i + 1] : undefined
}
const MODE = has('--mock') ? 'mock' : has('--local') ? 'local' : 'golden'
const RENDER = !has('--no-render') && MODE !== 'mock'
const ONLY = val('--only')?.split(',').map((s) => s.trim()).filter(Boolean)
const PORT = Number(process.env.EVAL_PORT || 5177)

for (const k of ['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy','ALL_PROXY','all_proxy','NO_PROXY','no_proxy']) delete process.env[k]

/* ------------------------------ fixtures ------------------------------ */
// Scorer self-test: one clean deck, one violation-laden deck. Expected hits
// are asserted so a scorer regression fails loudly.
const GOOD_DECK = {
  title: '好课件', theme: 'aurora',
  slides: [
    { layout: 'cover', title: '好课件', subtitle: '副标题', imageQuery: 'city skyline' },
    { layout: 'section', title: '第一部分', imageQuery: 'forest path' },
    { layout: 'bullets', title: '要点页', imageQuery: 'team meeting room', note: '这一页我们重点看三个结论，第一个结论来自 2024 年的真实数据。', bullets: ['转化率在三个月内提升了 18%', '获客成本下降 12% 且持续走低', '**留存**是下阶段唯一的主战场'] },
    { layout: 'big-number', value: '42%', caption: '来自年报的增速', imageQuery: 'mountain sunrise', note: '这个数字说明市场远没有饱和，我们再看它的构成。' },
    { layout: 'section', title: '第二部分', imageQuery: 'ocean waves' },
    { layout: 'timeline', title: '路线图', imageQuery: 'road horizon', note: '四步走，每一步都有明确的验收标准，大家记住第二步最容易被低估。', steps: [{ label: '调研', text: '两周内完成 30 个访谈' }, { label: '试点', text: '选 2 个城市小规模验证' }, { label: '推广', text: '按 ROI 排序逐城铺开' }] },
    { layout: 'end', title: '谢谢观看', imageQuery: 'starry night sky' },
  ],
}
const BAD_DECK = {
  title: '坏课件', theme: 'aurora',
  slides: [
    { layout: 'bullets', title: '这是一个远远超过二十个字上限的超长页面标题示例文本', bullets: ['短', '效率'], imageQuery: '城市天际线' },
    { layout: 'bullets', title: '页二', bullets: ['提升效率', '加强管理', '优化流程', '赋能业务', '促进增长', '深化改革'], imageQuery: 'city skyline' },
    { layout: 'bullets', title: '页三', bullets: ['**加粗没有闭合的要点', '第二条', '第三条'], imageQuery: 'city skyline' },
    { layout: 'image-text', title: '长文页', body: '这一段说明文字被刻意写得非常非常长，远远超过图文页大约九十个字的容量上限，还在继续写，继续写，塞进更多没有信息量的句子，让它一定超过一百一十个字符的宽容线，再补一句凑数的话让它彻底超标，然后再来一句确保万无一失的凑数长句压轴收尾。' },
  ],
}
const MOCK_EXPECT = [
  ['bad 首页不是 cover', (s) => s.bad.structureIssues.some((x) => x.includes('cover'))],
  ['bad 连续 bullets>2', (s) => s.bad.structureIssues.some((x) => x.includes('连续 bullets'))],
  ['bad 标题超长被抓', (s) => s.bad.capViolations.some((x) => x.includes('标题'))],
  ['bad bullets 超条数被抓', (s) => s.bad.capViolations.some((x) => x.includes('bullets 条数'))],
  ['bad body 超长被抓', (s) => s.bad.capViolations.some((x) => x.includes('body 长度'))],
  ['bad 非英文 imageQuery 被抓', (s) => s.bad.nonEnglishQuery >= 1],
  ['bad 重复 imageQuery 被抓', (s) => s.bad.dupQueries >= 1],
  ['bad 不配平的 ** 被抓', (s) => s.bad.unbalancedBold >= 1],
  ['bad 具体性低于 good', (s) => s.bad.anchorRate < s.good.anchorRate],
  ['good 结构零问题', (s) => s.good.structureIssues.length === 0],
  ['good 容量零违规', (s) => s.good.capViolationCount === 0],
  ['good 讲稿覆盖率=1', (s) => s.good.noteCoverage === 1],
]

/* --------------------------- infra helpers ---------------------------- */
async function resolvePlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node22/lib/node_modules/playwright/index.js'].filter(Boolean)
  for (const c of candidates) {
    try { return (await import(c)).default ?? (await import(c)) } catch { /* next */ }
  }
  throw new Error('playwright 不可用：npm i -D playwright 或设 PLAYWRIGHT_MODULE 指向其入口')
}

function chromiumPath() {
  return process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
}

async function withServer(fn) {
  // Reuse an already-running dev server on the port, else spawn one.
  const url = `http://localhost:${PORT}`
  const up = await fetch(url).then((r) => r.ok).catch(() => false)
  let child = null
  if (!up) {
    child = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore', detached: false })
    const deadline = Date.now() + 30000
    while (Date.now() < deadline) {
      if (await fetch(url).then((r) => r.ok).catch(() => false)) break
      await new Promise((r) => setTimeout(r, 400))
    }
  }
  try {
    return await fn(url)
  } finally {
    child?.kill()
  }
}

/* ----------------------- deck acquisition (browser) -------------------- */
async function collectDecks(page, base) {
  if (MODE === 'local') {
    await page.goto(base + '/#/', { waitUntil: 'networkidle' })
    return page.evaluate(async () => {
      const { getSampleDeck } = await import('/src/sample.ts')
      const { TEMPLATES, instantiateTemplate } = await import('/src/templates.ts')
      const out = { sample: getSampleDeck() }
      for (const t of TEMPLATES) out[`tpl-${t.slug}`] = instantiateTemplate(t, `eval-${t.slug}`)
      return JSON.parse(JSON.stringify(out))
    })
  }
  // golden: real generation through the app's own quick pipeline.
  const cfg = {
    base: process.env.EVAL_LLM_BASE || 'https://api.deepseek.com',
    key: process.env.EVAL_LLM_KEY || '',
    model: process.env.EVAL_LLM_MODEL || 'deepseek-chat',
  }
  if (!cfg.key) throw new Error('golden 模式需要 EVAL_LLM_KEY（以及可选 EVAL_LLM_BASE / EVAL_LLM_MODEL）')
  await page.goto(base + '/#/', { waitUntil: 'networkidle' })
  await page.evaluate((c) => {
    localStorage.setItem('ppt2html.settings.v1', JSON.stringify({
      provider: 'openai',
      anthropic: { baseUrl: 'https://api.anthropic.com', apiKey: '', model: 'claude-opus-4-8' },
      openai: { baseUrl: c.base, apiKey: c.key, model: c.model },
      thinking: false,
      images: { enabled: false, mode: 'abstract', abstractStyle: 'auto', unsplashKey: '', pexelsKey: '', pixabayKey: '' },
    }))
  }, cfg)
  const topics = TOPICS.filter((t) => !ONLY || ONLY.includes(t.id))
  const decks = {}
  for (const t of topics) {
    process.stdout.write(`  生成 ${t.id} … `)
    try {
      decks[t.id] = await page.evaluate(async ({ topic, opts }) => {
        const { generateDeckSpec } = await import('/src/llm/client.ts')
        const { loadSettings } = await import('/src/llm/settings.ts')
        const { normalizeDeck } = await import('/src/render/normalize.ts')
        const spec = await generateDeckSpec(topic, opts, loadSettings())
        return JSON.parse(JSON.stringify(normalizeDeck(spec, { prompt: topic })))
      }, t)
      console.log(`${decks[t.id].slides.length} 页`)
    } catch (e) {
      console.log(`失败：${String(e).slice(0, 120)}`)
    }
  }
  return decks
}

/* ---------------------- overflow render pass (browser) ----------------- */
// Renders every page at the logical 1280×720 canvas and runs the app's own
// fitSlide: pages that needed shrinking are real overflow pressure the
// capacity limits failed to prevent.
async function renderPass(page, decks) {
  return page.evaluate(async (all) => {
    const { renderSlideInner } = await import('/src/render/layouts.ts')
    const { fitSlide } = await import('/src/render/fit.ts')
    await import('/src/render/preview.ts') // side effect: themes.css + slides.css
    await document.fonts.ready
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;left:-99999px;top:0;'
    document.body.appendChild(host)
    const out = {}
    for (const [id, deck] of Object.entries(all)) {
      let shrunk = 0
      let floored = 0
      for (const slide of deck.slides) {
        host.innerHTML = `<div class="player theme-${deck.theme}" style="width:1280px;height:720px;position:relative">` +
          `<div class="reveal deck"><div class="slides" style="width:1280px;height:720px">` +
          `<section class="deck-slide" style="position:absolute;inset:0;display:block;width:1280px;height:720px">${renderSlideInner(slide)}</section>` +
          `</div></div></div>`
        const sec = host.querySelector('section')
        fitSlide(sec)
        const tf = sec.querySelector('.s')?.style.transform ?? ''
        const m = /scale\(([\d.]+)\)/.exec(tf)
        if (m) {
          shrunk++
          if (Number(m[1]) <= 0.41) floored++
        }
      }
      out[id] = { pagesShrunk: shrunk, pagesAtFloor: floored, pages: deck.slides.length }
    }
    host.remove()
    return out
  }, decks)
}

/* ------------------------------- report -------------------------------- */
function buildReport(meta, scored, summary, renderStats, baseline) {
  const L = []
  L.push(`# 课件质量评测报告`, '', `- 模式：${meta.mode}${meta.model ? ` · 模型：${meta.model}` : ''}`, `- 时间：${meta.at}`, `- 课件数：${summary.decks}`, '')
  L.push('## 总览', '', '| 指标 | 值 |', '|---|---|')
  const S = [
    ['平均页数', summary.meanPages], ['结构问题总数', summary.structureIssueTotal],
    ['容量违规总数', summary.capViolationTotal], ['具体性锚点率(均值)', summary.meanAnchorRate],
    ['观点句率-代理(均值)', summary.meanSentenceBulletRate], ['版式多样性(均值)', summary.meanDistinctLayouts],
    ['bullets 页占比(均值)', summary.meanBulletsShare], ['缺 imageQuery 总数', summary.missingQueryTotal],
    ['重复 imageQuery 总数', summary.dupQueryTotal], ['讲稿覆盖率(均值)', summary.meanNoteCoverage],
    ['不配平 ** 总数', summary.unbalancedBoldTotal], ['语言错配总数', summary.langMismatchTotal],
  ]
  for (const [k, v] of S) L.push(`| ${k} | ${v} |`)
  if (renderStats) {
    const shrunk = Object.values(renderStats).reduce((a, r) => a + r.pagesShrunk, 0)
    const floor = Object.values(renderStats).reduce((a, r) => a + r.pagesAtFloor, 0)
    const total = Object.values(renderStats).reduce((a, r) => a + r.pages, 0)
    L.push(`| 实测需缩放页 | ${shrunk}/${total} |`, `| 缩到 0.4 下限页 | ${floor} |`)
  }
  if (baseline) {
    L.push('', '## 对比基线', '', '| 指标 | 基线 | 本次 | Δ |', '|---|---|---|---|')
    for (const [k, v] of S) {
      const key = { '平均页数': 'meanPages', '结构问题总数': 'structureIssueTotal', '容量违规总数': 'capViolationTotal', '具体性锚点率(均值)': 'meanAnchorRate', '观点句率-代理(均值)': 'meanSentenceBulletRate', '版式多样性(均值)': 'meanDistinctLayouts', 'bullets 页占比(均值)': 'meanBulletsShare', '缺 imageQuery 总数': 'missingQueryTotal', '重复 imageQuery 总数': 'dupQueryTotal', '讲稿覆盖率(均值)': 'meanNoteCoverage', '不配平 ** 总数': 'unbalancedBoldTotal', '语言错配总数': 'langMismatchTotal' }[k]
      const b = baseline.summary?.[key]
      if (b === undefined) continue
      const d = +(v - b).toFixed(2)
      L.push(`| ${k} | ${b} | ${v} | ${d > 0 ? '+' : ''}${d} |`)
    }
  }
  L.push('', '## 逐课件', '', '| 课件 | 页数 | 结构 | 容量违规 | 锚点率 | 观点句率 | 版式数 | 讲稿覆盖 |' + (renderStats ? ' 需缩放 |' : ''), '|---|---|---|---|---|---|---|---|' + (renderStats ? '---|' : ''))
  for (const [id, r] of Object.entries(scored)) {
    L.push(`| ${id} | ${r.pages} | ${r.structureIssues.length ? '⚠' + r.structureIssues.length : '✓'} | ${r.capViolationCount} | ${r.anchorRate} | ${r.sentenceBulletRate} | ${r.distinctLayouts} | ${r.noteCoverage} |` + (renderStats ? ` ${renderStats[id]?.pagesShrunk ?? '-'}/${r.pages} |` : ''))
  }
  const issues = Object.entries(scored).flatMap(([id, r]) => [
    ...r.structureIssues.map((x) => `- ${id}: ${x}`),
    ...r.capViolations.map((x) => `- ${id}: ${x}`),
  ])
  if (issues.length) L.push('', '## 违规明细', '', ...issues)
  return L.join('\n')
}

/* --------------------------------- main -------------------------------- */
async function main() {
  const at = new Date().toISOString()
  if (MODE === 'mock') {
    // The good fixture is a deliberate 7-pager — score it against its own
    // target so the 8~14 default-range rule doesn't flag the fixture itself.
    const scored = { good: scoreDeck(GOOD_DECK, { expectPages: 7 }), bad: scoreDeck(BAD_DECK) }
    let fail = 0
    for (const [name, check] of MOCK_EXPECT) {
      const okk = check(scored)
      console.log(`  ${okk ? '✓' : '✗'} ${name}`)
      if (!okk) fail++
    }
    console.log(`\nmock 自测：${MOCK_EXPECT.length - fail}/${MOCK_EXPECT.length} 通过`)
    process.exit(fail ? 1 : 0)
  }

  const pw = await resolvePlaywright()
  const decks = {}
  let renderStats = null
  await withServer(async (base) => {
    const browser = await pw.chromium.launch({ executablePath: chromiumPath(), args: ['--no-proxy-server'] })
    const page = await (await browser.newContext()).newPage()
    Object.assign(decks, await collectDecks(page, base))
    if (RENDER && Object.keys(decks).length) renderStats = await renderPass(page, decks)
    await browser.close()
  })

  const expect = MODE === 'golden' ? Object.fromEntries(TOPICS.map((t) => [t.id, t.opts.slideCount])) : {}
  const scored = Object.fromEntries(Object.entries(decks).map(([id, d]) => [id, scoreDeck(d, { expectPages: expect[id] })]))
  const summary = summarize(scored)
  const baselinePath = val('--baseline')
  const baseline = baselinePath && existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null
  const meta = { mode: MODE, at, model: MODE === 'golden' ? (process.env.EVAL_LLM_MODEL || 'deepseek-chat') : undefined }

  const dir = path.join(ROOT, 'scripts/eval/results', `${at.replace(/[:.]/g, '-')}-${MODE}`)
  mkdirSync(path.join(dir, 'decks'), { recursive: true })
  for (const [id, d] of Object.entries(decks)) writeFileSync(path.join(dir, 'decks', `${id}.json`), JSON.stringify(d, null, 2))
  writeFileSync(path.join(dir, 'scores.json'), JSON.stringify({ meta, summary, scored, renderStats }, null, 2))
  const report = buildReport(meta, scored, summary, renderStats, baseline)
  writeFileSync(path.join(dir, 'report.md'), report)
  console.log(report)
  console.log(`\n结果目录：${path.relative(ROOT, dir)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
