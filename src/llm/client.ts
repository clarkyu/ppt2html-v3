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
  const cfg = activeConfig(settings)
  if (!cfg.apiKey.trim()) {
    throw new Error('尚未配置 API Key，请先在「设置」中填写。')
  }

  const system = buildSystemPrompt()
  const user = buildUserPrompt(topic, opts)

  const text =
    settings.provider === 'anthropic'
      ? await streamAnthropic(cfg, system, user, handlers)
      : await streamOpenAI(cfg, system, user, handlers)

  const spec = extractJson(text) as DeckSpec
  if (!spec || typeof spec !== 'object' || !Array.isArray(spec.slides) || !spec.slides.length) {
    throw new Error('模型返回的内容不是有效的课件结构，请重试。')
  }
  return spec
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
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.apiKey.trim(),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
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
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${cfg.apiKey.trim()}`,
    },
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
