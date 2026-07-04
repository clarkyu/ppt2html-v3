import type { DeckSpec, GenerateOptions } from '../types'
import { buildSystemPrompt, buildUserPrompt } from './prompt'
import { extractJson } from './extractJson'
import { activeConfig, type LlmSettings, type ProviderConfig } from './settings'

export interface GenerateHandlers {
  /** Called on every streamed chunk with the full text so far and the new delta. */
  onToken?: (fullText: string, delta: string) => void
  signal?: AbortSignal
}

const MAX_TOKENS = 16000

/** Generate a deck spec from a one-line topic by streaming from the LLM. */
export async function generateDeckSpec(
  topic: string,
  opts: GenerateOptions,
  settings: LlmSettings,
  handlers: GenerateHandlers = {},
): Promise<DeckSpec> {
  requireKey(settings)
  const text = await streamText(buildSystemPrompt(), buildUserPrompt(topic, opts), settings, handlers)

  const spec = extractJson(text) as DeckSpec
  if (!spec || typeof spec !== 'object' || !Array.isArray(spec.slides) || !spec.slides.length) {
    throw new Error('模型返回的内容不是有效的课件结构，请重试。')
  }
  return spec
}

function requireKey(settings: LlmSettings): void {
  if (!activeConfig(settings).apiKey.trim()) {
    throw new Error('尚未配置 API Key，请先在「设置」中填写。')
  }
}

/* ----------------------------- streaming ----------------------------- */

/** Stream a chat completion and return the full accumulated text. */
export async function streamText(
  system: string,
  user: string,
  settings: LlmSettings,
  handlers: GenerateHandlers = {},
): Promise<string> {
  const cfg = activeConfig(settings)
  return settings.provider === 'anthropic'
    ? streamAnthropic(cfg, system, user, handlers)
    : streamOpenAI(cfg, system, user, handlers)
}

async function streamAnthropic(
  cfg: ProviderConfig,
  system: string,
  user: string,
  handlers: GenerateHandlers,
): Promise<string> {
  const res = await fetch(joinUrl(cfg.baseUrl, '/v1/messages'), {
    method: 'POST',
    signal: handlers.signal,
    headers: anthropicHeaders(cfg),
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: MAX_TOKENS,
      stream: true,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  if (!res.ok || !res.body) throw await httpError(res)
  return readSSE(res.body, handlers, (data) => {
    const d = data as { type?: string; delta?: { type?: string; text?: string } }
    if (d.type === 'content_block_delta' && d.delta?.type === 'text_delta') {
      return d.delta.text ?? ''
    }
    return ''
  })
}

async function streamOpenAI(
  cfg: ProviderConfig,
  system: string,
  user: string,
  handlers: GenerateHandlers,
): Promise<string> {
  const res = await fetch(joinUrl(cfg.baseUrl, '/chat/completions'), {
    method: 'POST',
    signal: handlers.signal,
    headers: openaiHeaders(cfg),
    body: JSON.stringify({
      model: cfg.model,
      stream: true,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })
  if (!res.ok || !res.body) throw await httpError(res)
  return readSSE(res.body, handlers, (data) => {
    const d = data as { choices?: Array<{ delta?: { content?: string } }> }
    const delta = d.choices?.[0]?.delta?.content
    return typeof delta === 'string' ? delta : ''
  })
}

/* --------------------------- non-streaming --------------------------- */

/** One-shot chat completion (no streaming). Returns the response text. */
export async function requestText(
  system: string,
  user: string,
  settings: LlmSettings,
  opts: { signal?: AbortSignal; maxTokens?: number; json?: boolean } = {},
): Promise<string> {
  requireKey(settings)
  const cfg = activeConfig(settings)
  const maxTokens = opts.maxTokens ?? 1024
  return settings.provider === 'anthropic'
    ? requestAnthropic(cfg, system, user, maxTokens, opts.signal)
    : requestOpenAI(cfg, system, user, opts.json ?? true, opts.signal)
}

async function requestAnthropic(
  cfg: ProviderConfig,
  system: string,
  user: string,
  maxTokens: number,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(joinUrl(cfg.baseUrl, '/v1/messages'), {
    method: 'POST',
    signal,
    headers: anthropicHeaders(cfg),
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  if (!res.ok) throw await httpError(res)
  const data = (await res.json()) as { content?: Array<{ type?: string; text?: string }> }
  return (data.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')
}

async function requestOpenAI(
  cfg: ProviderConfig,
  system: string,
  user: string,
  json: boolean,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(joinUrl(cfg.baseUrl, '/chat/completions'), {
    method: 'POST',
    signal,
    headers: openaiHeaders(cfg),
    body: JSON.stringify({
      model: cfg.model,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })
  if (!res.ok) throw await httpError(res)
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return data.choices?.[0]?.message?.content ?? ''
}

/* ------------------------------ helpers ------------------------------ */

function anthropicHeaders(cfg: ProviderConfig): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-api-key': cfg.apiKey.trim(),
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }
}

function openaiHeaders(cfg: ProviderConfig): Record<string, string> {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${cfg.apiKey.trim()}`,
  }
}

/** Parse an SSE byte stream, accumulating text via `extract` per data event. */
async function readSSE(
  body: ReadableStream<Uint8Array>,
  handlers: GenerateHandlers,
  extract: (data: unknown) => string,
): Promise<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let nl: number
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (!line.startsWith('data:')) continue

        const payload = line.slice(5).trim()
        if (!payload) continue
        if (payload === '[DONE]') return full

        let data: unknown
        try {
          data = JSON.parse(payload)
        } catch {
          continue
        }

        if ((data as { type?: string }).type === 'error') {
          const msg = (data as { error?: { message?: string } }).error?.message
          throw new Error(msg || '模型返回错误')
        }

        const delta = extract(data)
        if (delta) {
          full += delta
          handlers.onToken?.(full, delta)
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  return full
}

function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, '') + path
}

async function httpError(res: Response): Promise<Error> {
  let detail = res.statusText
  try {
    const text = await res.text()
    try {
      detail = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? text
    } catch {
      detail = text
    }
  } catch {
    /* keep statusText */
  }
  return new Error(`请求失败（HTTP ${res.status}）：${detail.slice(0, 300)}`)
}
