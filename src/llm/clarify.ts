import type { ClarifyQuestion, GenerateOptions } from '../types'
import type { LlmSettings } from './settings'
import { requestText } from './client'
import { extractJson } from './extractJson'

const CLARIFY_SYSTEM = `你是课件需求分析助手。用户给出一个较粗略的主题，你要提出 3~4 个最能澄清需求、显著提升课件质量的**简明**问题，引导用户把需求说清楚。

要求：
- 每个问题给 2~4 个**简短**的建议选项，方便用户快速点选；用户也可自行补充或跳过。
- 聚焦这些维度（择要，不要都问）：目标受众及其基础水平、课件目的/使用场景、切入角度或范围侧重、必须覆盖的重点、期望的深浅。
- 不要问配色、页数、语气（这些已单独设置）。
- 问题与选项使用与主题相同的语言，尽量口语化、简短。

严格只输出一个 JSON 对象，不要任何解释或代码块标记：
{ "questions": [ { "question": "问题文本", "options": ["选项1", "选项2", "选项3"] } ] }`

function buildClarifyUser(topic: string, opts: GenerateOptions): string {
  const lines = [`主题：${topic}`]
  if (opts.audience) lines.push(`已知受众：${opts.audience}`)
  lines.push('', '请输出 3~4 个澄清问题的 JSON。只输出 JSON。')
  return lines.join('\n')
}

/** Ask the model for a few clarifying questions about the topic. */
export async function generateClarifyingQuestions(
  topic: string,
  opts: GenerateOptions,
  settings: LlmSettings,
  signal?: AbortSignal,
): Promise<ClarifyQuestion[]> {
  const text = await requestText(CLARIFY_SYSTEM, buildClarifyUser(topic, opts), settings, {
    signal,
    maxTokens: 1024,
  })
  const parsed = extractJson(text) as { questions?: unknown }
  const raw = Array.isArray(parsed.questions) ? parsed.questions : []

  const questions: ClarifyQuestion[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const question = typeof o.question === 'string' ? o.question.trim() : ''
    if (!question) continue
    const options = Array.isArray(o.options)
      ? o.options.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean).slice(0, 4)
      : undefined
    questions.push({ question, options: options?.length ? options : undefined })
    if (questions.length >= 4) break
  }
  return questions
}
