// Full speaker-script generation: turn a finished deck's per-slide notes into
// a read-aloud-ready transcript (逐字稿), written AFTER the deck exists so the
// model sees the whole storyline — openings, per-page transitions, closings —
// without competing with slide JSON for the deck-generation token budget.
//
// Slides are scripted in small batches (whole-deck outline + full content of
// the batch pages per call), each batch applied to the deck as it lands, so a
// mid-run failure keeps everything already written.

import type { Deck, Slide } from '../types'
import type { LlmSettings } from './settings'
import { streamText } from './client'
import { extractJson } from './extractJson'
import { deckIsCjk } from '../lib/lang'
import { t } from '../i18n'

/** Pages per LLM call — big enough to keep flow, small enough to never truncate. */
const BATCH = 6

export interface SpeakerNotesHandlers {
  /** After each batch is applied (deck mutated in place): pages done / total. */
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}

const NOTES_SYSTEM = `你是资深演讲撰稿人。任务：为一套已完成的课件撰写**可直接照读的完整讲稿**（逐字稿）——演讲者拿起就能一字不改地讲，而不是提纲、提示或备忘。

严格只输出一个 JSON 对象，不要解释、不要代码块标记：
{ "notes": [ { "page": 3, "script": "第 3 页的完整讲稿…" } ] }

写作要求：
1. 【逐字稿】口语化、完整句子、自然的演讲口吻。禁止写"介绍一下…/强调…/提醒听众…"这类对演讲者的指令，禁止"这一页/这张幻灯片/如图所示"之类的舞台说明。
2. 【衔接成篇】除全篇第 1 页外，每页开头先用一句话从上一页自然承接；除最后一页外，结尾埋一句引向下一页的钩子。整套讲稿连起来读，应该是一场连贯的演讲。
3. 【展开而非复读】不要照念页面文字：数字要给读法和含义（如"87%——差不多每 10 个人里有 9 个"）；要点给理由、例子或小场景；对比页给出立场与取舍建议；引用页讲背景与共鸣点；代码页讲这段代码解决什么问题、看哪一行。
4. 【首尾出彩】封面页：问候 + 一个抓注意力的开场钩子（提问 / 反常识事实 / 小场景）+ 一句今天要带大家收获什么。章节页：一句小结上文 + 一句预告本章。结束页：回顾全篇最重要的 1~2 个观点 + 行动号召 + 致谢。
5. 【长度】内容页每页约 120~220 字（英文 80~150 词）；封面 / 章节 / 结束页约 60~120 字。信息密集的页可到 250 字，不要更长。
6. 【语言】与课件内容语言一致。输出纯文本讲稿：不用 Markdown、不用列表符号、不要用引号把讲稿包起来。
7. 必须覆盖【本次撰写】列出的每一页：page 用列出的页码，不要漏页，也不要写列表之外的页。`

function stripMd(s: string | undefined): string {
  return (s ?? '').replace(/\*\*(.+?)\*\*/g, '$1')
}

/** One line per page, so every batch sees the whole storyline. */
function slideBrief(s: Slide, i: number): string {
  const head = stripMd(s.title || s.value || s.text || '') || '(无标题)'
  const sub = stripMd(s.subtitle || s.caption || '')
  return `${i + 1}. [${s.layout}] ${head}${sub ? ` — ${sub}` : ''}`
}

/** Full content of one page, fed to the model for the pages being scripted. */
function slideDigest(s: Slide, i: number): string {
  const parts: string[] = [`=== 第 ${i + 1} 页 [${s.layout}] ${stripMd(s.title) || ''} ===`]
  if (s.eyebrow) parts.push(`眉标：${stripMd(s.eyebrow)}`)
  if (s.subtitle) parts.push(`副标题：${stripMd(s.subtitle)}`)
  if (s.bullets?.length) parts.push(`要点：\n${s.bullets.map((b) => `- ${stripMd(b)}`).join('\n')}`)
  if (s.stats?.length) parts.push(`数据：${s.stats.map((x) => `${x.value}（${x.label}）`).join('；')}`)
  if (s.left || s.right) {
    const col = (c: Slide['left'], name: string): string =>
      c ? `${name}「${stripMd(c.heading) || ''}」：${(c.bullets ?? (c.body ? [c.body] : [])).map(stripMd).join('；')}` : ''
    parts.push([col(s.left, '左栏'), col(s.right, '右栏')].filter(Boolean).join('\n'))
  }
  if (s.value) parts.push(`大数字：${stripMd(s.value)}${s.caption ? `（${stripMd(s.caption)}）` : ''}`)
  if (s.text) parts.push(`引文：${stripMd(s.text)}${s.author ? ` —— ${stripMd(s.author)}` : ''}`)
  if (s.items?.length)
    parts.push(
      s.items
        .map((it) => `对比项「${stripMd(it.heading)}」(${it.tone ?? 'neutral'})：${(it.points ?? []).map(stripMd).join('；')}`)
        .join('\n'),
    )
  if (s.steps?.length) parts.push(`步骤：${s.steps.map((st, k) => `${k + 1}.${stripMd(st.label)}${st.text ? `（${stripMd(st.text)}）` : ''}`).join(' → ')}`)
  if (s.code) parts.push(`代码（${s.language ?? 'code'}）：\n${s.code.slice(0, 400)}`)
  if (s.body) parts.push(`正文：${stripMd(s.body)}`)
  return parts.filter(Boolean).join('\n')
}

function batchPrompt(deck: Deck, from: number, to: number): string {
  const overview = deck.slides.map((s, i) => slideBrief(s, i)).join('\n')
  const details = deck.slides.slice(from, to).map((s, i) => slideDigest(s, from + i)).join('\n\n')
  const lang = deckIsCjk(deck) ? '中文' : 'English'
  return `课件《${deck.title}》，共 ${deck.slides.length} 页，讲稿语言：${lang}。

全篇页面一览：
${overview}

【本次撰写】第 ${from + 1} ~ ${to} 页。这些页的完整内容：

${details}`
}

/** Parse one batch's response and write scripts into the deck. Returns pages applied. */
function applyBatch(deck: Deck, raw: unknown, from: number, to: number): number {
  const notes = (raw as { notes?: unknown })?.notes
  if (!Array.isArray(notes)) throw new Error('no notes array')
  let applied = 0
  for (const item of notes) {
    const page = Number((item as { page?: unknown })?.page)
    const script = (item as { script?: unknown })?.script
    if (!Number.isInteger(page) || page < from + 1 || page > to) continue
    if (typeof script !== 'string' || !script.trim()) continue
    deck.slides[page - 1].note = script.trim()
    applied++
  }
  if (!applied) throw new Error('no scripts in response')
  return applied
}

/**
 * Write a full speaker script into `deck.slides[*].note` (mutates the deck).
 * Batches are sequential; each is applied as soon as it parses, so callers can
 * persist incrementally via `onProgress`. Resolves to the number of pages
 * scripted; rejects on an unrecoverable batch (earlier batches stay applied).
 */
export async function generateSpeakerNotes(
  deck: Deck,
  settings: LlmSettings,
  handlers: SpeakerNotesHandlers = {},
): Promise<number> {
  const total = deck.slides.length
  let done = 0
  for (let from = 0; from < total; from += BATCH) {
    const to = Math.min(from + BATCH, total)
    const user = batchPrompt(deck, from, to)
    // Retry covers both JSON-parse failures and shape mismatches (empty answer,
    // scripts keyed to wrong pages) — a fresh sample almost always recovers.
    // Transport/HTTP errors keep their (localized) message; parse failures get
    // a dedicated one so the user never sees an internal string.
    let lastErr: unknown
    let ok = false
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      if (handlers.signal?.aborted) throw new DOMException('aborted', 'AbortError')
      let text: string
      try {
        text = await streamText(NOTES_SYSTEM, user, settings, { signal: handlers.signal })
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') throw e
        lastErr = e
        continue
      }
      try {
        done += applyBatch(deck, extractJson(text), from, to)
        ok = true
      } catch {
        lastErr = new Error(t('err.invalidNotes'))
      }
    }
    if (!ok) throw lastErr
    handlers.onProgress?.(Math.min(done, total), total)
  }
  return done
}
