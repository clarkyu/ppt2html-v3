import type { ClarifyQuestion, GenerateOptions } from '../types'
import type { LlmSettings } from './settings'
import { requestText } from './client'
import { extractJson } from './extractJson'
import { getLang } from '../i18n'

const CLARIFY_SYSTEM = `你是课件需求分析助手。用户给出一个较粗略的主题，你只提出 **1~2 个最关键**的问题——问那些最能改变课件方向、缺了就没法动笔的点，其余一律不问。

要求：
- 最多 2 个问题；能用 1 个问清就只问 1 个。
- 每个问题给 3~4 个**简短**的建议选项，方便一键点选；用户也可自行补充或跳过。
- 通常最该问的是：**目标受众/基础水平** 与 **切入角度或用途**（二选一或合并）。
- 不要问配色、页数、语气（已单独设置），也不要问宽泛无用的问题。
- 问题与选项使用与主题相同的语言，口语化、简短。

严格只输出一个 JSON 对象，不要任何解释或代码块标记：
{ "questions": [ { "question": "问题文本", "options": ["选项1", "选项2", "选项3"] } ] }`

function buildClarifyUser(topic: string, opts: GenerateOptions): string {
  const lines = [`主题：${topic}`]
  if (opts.audience) lines.push(`已知受众：${opts.audience}`)
  lines.push('', '请输出 1~2 个最关键澄清问题的 JSON。只输出 JSON。')
  return lines.join('\n')
}

/**
 * Instant, generic fallback questions shown while the AI-tailored ones load
 * (or if that call is slow / fails). Keeps the guided step feeling immediate.
 */
export function defaultQuestions(): ClarifyQuestion[] {
  if (getLang() === 'en') {
    return [
      { question: 'Who is this deck mainly for?', options: ['Complete beginners', 'Some background', 'Advanced / pro', 'Managers / decision-makers'] },
      { question: 'What should the deck focus on?', options: ['Explaining concepts', 'Hands-on steps', 'Case studies', 'Making an argument'] },
    ]
  }
  return [
    { question: '这份课件主要讲给谁听？', options: ['零基础新人', '有一定基础', '专业 / 进阶', '管理者 / 决策者'] },
    { question: '你更希望课件侧重什么？', options: ['讲清概念', '实操步骤', '案例分析', '观点说服'] },
  ]
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
    maxTokens: 640,
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
    if (questions.length >= 2) break
  }
  return questions
}
