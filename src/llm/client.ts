import type { DeckSpec, GenerateOptions } from '../types'
import { buildSystemPrompt, buildUserPrompt } from './prompt'
import { extractJson } from './extractJson'
import {
  activeConfig,
  baseUrlProblem,
  effectiveApiKey,
  isConfigured,
  isDeepSeekEndpoint,
  systemKeyApplies,
  type LlmSettings,
  type ProviderConfig,
} from './settings'
import { outputCap } from './models'
import { LlmError } from './errors'
import { getLang, t } from '../i18n'

export interface GenerateHandlers {
  /** Called on every streamed chunk with the full text so far and the new delta. */
  onToken?: (fullText: string, delta: string) => void
  /** Reasoning ("thinking") text streamed before the answer, as a cumulative
   * character count — so a live panel can show the model is working instead
   * of "connecting…" for the whole reasoning phase. */
  onReasoning?: (chars: number) => void
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
  const text = await streamText(buildSystemPrompt(), buildUserPrompt(topic, opts), settings, handlers)

  const spec = extractJson(text) as DeckSpec
  if (!spec || typeof spec !== 'object' || !Array.isArray(spec.slides) || !spec.slides.length) {
    throw new LlmError(t('err.invalidDeck'), 'parse')
  }
  return spec
}

function requireKey(settings: LlmSettings): void {
  if (!isConfigured(settings)) {
    throw new LlmError(t('err.notConfigured'), 'config')
  }
}

interface ResolvedConfig extends ProviderConfig {
  /** The request rides on the built-in DeepSeek key, not one the user typed —
   * auth/quota errors must not send them to "check your key". */
  systemKey: boolean
}

/**
 * The active provider config with the *effective* key resolved (the user's own
 * key, or the system DeepSeek fallback). A stored base URL that can't be used
 * (not a URL, or plain http to a public host) is refused here as well as on
 * the settings form — old localStorage state never went through the form.
 */
function resolvedConfig(settings: LlmSettings): ResolvedConfig {
  const cfg = activeConfig(settings)
  if (baseUrlProblem(cfg.baseUrl)) throw new LlmError(t('err.badBaseUrl'), 'config')
  const own = cfg.apiKey.trim().length > 0
  return { ...cfg, apiKey: effectiveApiKey(settings), systemKey: !own && systemKeyApplies(settings) }
}

/* ----------------------------- streaming ----------------------------- */

/** Stream a chat completion and return the full accumulated text. */
export async function streamText(
  system: string,
  user: string,
  settings: LlmSettings,
  handlers: GenerateHandlers = {},
): Promise<string> {
  requireKey(settings)
  const cfg = resolvedConfig(settings)
  const extras = providerExtras(settings)
  return settings.provider === 'anthropic'
    ? streamAnthropic(cfg, system, user, handlers)
    : streamOpenAI(cfg, system, user, handlers, extras, !thinkingActive(extras))
}

/**
 * DeepSeek's reasoning ("thinking") mode does NOT support `response_format:
 * json_object` — forcing it can make the model return an empty answer (all
 * output goes to reasoning), yielding no JSON. So we drop JSON mode when
 * thinking is on; the prompt already demands pure JSON.
 */
function thinkingActive(extras: Record<string, unknown>): boolean {
  const t = extras.thinking as { type?: string } | undefined
  return t?.type === 'enabled'
}

/**
 * Explicit output-token limit for OpenAI-compatible endpoints. Without one,
 * providers apply a small default that silently truncates a long deck's JSON
 * mid-stream — the whole generation then fails. Known ceilings (models.ts
 * OUTPUT_CAPS) clamp the ask; an unknown endpoint that rejects the field with
 * HTTP 400 gets one retry without it (postWithLimitFallback). Newer OpenAI
 * models (o-series, gpt-5 family) reject `max_tokens` and want
 * `max_completion_tokens` instead.
 */
function tokenLimit(cfg: ProviderConfig, want: number): Record<string, number> {
  const cap = outputCap(cfg.baseUrl, cfg.model)
  const n = cap ? Math.min(want, cap) : want
  if (/^(o\d|gpt-5)/i.test(cfg.model.trim())) return { max_completion_tokens: n }
  return { max_tokens: n }
}

/**
 * Provider-specific extra request-body fields. Currently: DeepSeek V4 thinking
 * mode (`thinking: {type}`, plus reasoning_effort when enabled). Only sent to
 * DeepSeek endpoints so other OpenAI-compatible services don't reject it.
 */
function providerExtras(settings: LlmSettings): Record<string, unknown> {
  if (settings.provider !== 'openai') return {}
  if (!isDeepSeekEndpoint(settings.openai.baseUrl)) return {}
  return settings.thinking
    ? { thinking: { type: 'enabled' }, reasoning_effort: 'high' }
    : { thinking: { type: 'disabled' } }
}

async function streamAnthropic(
  cfg: ResolvedConfig,
  system: string,
  user: string,
  handlers: GenerateHandlers,
): Promise<string> {
  const res = await doFetch(joinUrl(cfg.baseUrl, '/v1/messages'), {
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
  if (!res.ok) throw await httpError(res, cfg)
  if (!res.body) throw new LlmError(t('err.badResponse'), 'model')
  return readSSE(res.body, handlers, anthropicEvent)
}

async function streamOpenAI(
  cfg: ResolvedConfig,
  system: string,
  user: string,
  handlers: GenerateHandlers,
  extras: Record<string, unknown> = {},
  jsonMode = true,
): Promise<string> {
  const body = (withLimit: boolean): string =>
    JSON.stringify({
      model: cfg.model,
      stream: true,
      ...(withLimit ? tokenLimit(cfg, MAX_TOKENS) : {}),
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      ...extras,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    })
  const res = await postWithLimitFallback(joinUrl(cfg.baseUrl, '/chat/completions'), cfg, body, handlers.signal)
  if (!res.body) throw new LlmError(t('err.badResponse'), 'model')
  return readSSE(res.body, handlers, openaiEvent)
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
  const cfg = resolvedConfig(settings)
  const extras = providerExtras(settings)
  const maxTokens = opts.maxTokens ?? 1024
  return settings.provider === 'anthropic'
    ? requestAnthropic(cfg, system, user, maxTokens, opts.signal)
    : requestOpenAI(cfg, system, user, maxTokens, (opts.json ?? true) && !thinkingActive(extras), opts.signal, extras)
}

async function requestAnthropic(
  cfg: ResolvedConfig,
  system: string,
  user: string,
  maxTokens: number,
  signal?: AbortSignal,
): Promise<string> {
  const res = await doFetch(joinUrl(cfg.baseUrl, '/v1/messages'), {
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
  if (!res.ok) throw await httpError(res, cfg)
  const data = await parseBody<{
    content?: Array<{ type?: string; text?: string }>
    stop_reason?: unknown
    error?: { message?: unknown } | null
  }>(res)
  if (data.error && typeof data.error === 'object') throw modelError(data.error.message)
  checkFinish(data.stop_reason)
  return (data.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')
}

async function requestOpenAI(
  cfg: ResolvedConfig,
  system: string,
  user: string,
  maxTokens: number,
  json: boolean,
  signal?: AbortSignal,
  extras: Record<string, unknown> = {},
): Promise<string> {
  const body = (withLimit: boolean): string =>
    JSON.stringify({
      model: cfg.model,
      // Floor at 2K: these one-shot calls previously ran on the provider default
      // (≥4K) — a lower explicit cap must not introduce new truncation.
      ...(withLimit ? tokenLimit(cfg, Math.max(maxTokens, 2048)) : {}),
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      ...extras,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    })
  const res = await postWithLimitFallback(joinUrl(cfg.baseUrl, '/chat/completions'), cfg, body, signal)
  const data = await parseBody<{
    choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }>
    error?: { message?: unknown } | null
  }>(res)
  if (data.error && typeof data.error === 'object') throw modelError(data.error.message)
  const choice = data.choices?.[0]
  checkFinish(choice?.finish_reason)
  return typeof choice?.message?.content === 'string' ? choice.message.content : ''
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

/**
 * POST an OpenAI-style body. When the provider answers 400 complaining about
 * our output-token field (its ceiling is lower than the ask), retry ONCE with
 * the field left out so its default applies — instead of failing every call
 * on that endpoint. Any other non-OK response becomes a localized error.
 */
async function postWithLimitFallback(
  url: string,
  cfg: ResolvedConfig,
  body: (withLimit: boolean) => string,
  signal?: AbortSignal,
): Promise<Response> {
  const headers = openaiHeaders(cfg)
  const res = await doFetch(url, { method: 'POST', signal, headers, body: body(true) })
  if (res.ok) return res
  if (res.status === 400) {
    const text = await safeText(res)
    if (/max_tokens|max_completion_tokens/i.test(text)) {
      const again = await doFetch(url, { method: 'POST', signal, headers, body: body(false) })
      if (again.ok) return again
      throw await httpError(again, cfg)
    }
    throw httpErrorFrom(res.status, res.statusText, text, cfg)
  }
  throw await httpError(res, cfg)
}

/** What one SSE data event contributes. `error` set (even '') = fatal. */
interface SseEvent {
  text?: string
  reasoning?: string
  finish?: string
  error?: string
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

const openaiEvent = (data: unknown): SseEvent => {
  const d = data as {
    error?: { message?: unknown } | null
    choices?: Array<{ delta?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown }; finish_reason?: unknown }>
  }
  // OpenAI-style mid-stream errors arrive as {"error":{…}} over HTTP 200 —
  // without a `type` field. Swallowing them used to end in "no JSON" ×3.
  if (d.error && typeof d.error === 'object') return { error: str(d.error.message) }
  const choice = d.choices?.[0]
  const delta = choice?.delta
  return {
    text: str(delta?.content),
    reasoning: str(delta?.reasoning_content) || str(delta?.reasoning),
    finish: str(choice?.finish_reason),
  }
}

const anthropicEvent = (data: unknown): SseEvent => {
  const d = data as {
    type?: string
    error?: { message?: unknown }
    delta?: { type?: string; text?: unknown; thinking?: unknown; stop_reason?: unknown }
  }
  if (d.type === 'error') return { error: str(d.error?.message) }
  if (d.type === 'content_block_delta') {
    if (d.delta?.type === 'text_delta') return { text: str(d.delta.text) }
    if (d.delta?.type === 'thinking_delta') return { reasoning: str(d.delta.thinking) }
    return {}
  }
  if (d.type === 'message_delta') return { finish: str(d.delta?.stop_reason) }
  return {}
}

/** Parse an SSE byte stream, accumulating text via `extract` per data event. */
async function readSSE(
  body: ReadableStream<Uint8Array>,
  handlers: GenerateHandlers,
  extract: (data: unknown) => SseEvent,
): Promise<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  let reasoning = 0
  let finish = ''
  let done = false

  const handleLine = (raw: string): void => {
    const line = raw.trim()
    if (!line.startsWith('data:')) return
    const payload = line.slice(5).trim()
    if (!payload) return
    if (payload === '[DONE]') {
      done = true
      return
    }
    let data: unknown
    try {
      data = JSON.parse(payload)
    } catch {
      return
    }
    const ev = extract(data)
    if (ev.error !== undefined) throw modelError(ev.error)
    if (ev.finish) finish = ev.finish
    if (ev.reasoning) {
      reasoning += ev.reasoning.length
      handlers.onReasoning?.(reasoning)
    }
    if (ev.text) {
      full += ev.text
      handlers.onToken?.(full, ev.text)
    }
  }

  try {
    for (;;) {
      const { done: eof, value } = await reader.read()
      if (eof) break
      buffer += decoder.decode(value, { stream: true })

      let nl: number
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl)
        buffer = buffer.slice(nl + 1)
        handleLine(line)
        if (done) break
      }
      if (done) break
    }
    // A stream that ends without a trailing newline (or a [DONE]) still has
    // its last event sitting in the buffer — and the decoder may hold a
    // partial multi-byte character. Flush both through the same handler.
    if (!done) {
      buffer += decoder.decode()
      if (buffer.trim()) handleLine(buffer)
    }
  } finally {
    reader.releaseLock()
  }

  checkFinish(finish)
  return full
}

/**
 * The provider's stop reason decides whether the text is usable at all: a
 * length stop means the JSON was cut off (retrying identically just pays
 * again), a filter stop means it was refused. Both used to surface as a raw
 * SyntaxError from the JSON parser.
 */
function checkFinish(finish: unknown): void {
  const f = str(finish)
  if (f === 'length' || f === 'max_tokens') throw new LlmError(t('err.truncated'), 'truncated')
  if (f === 'content_filter' || f === 'refusal') throw new LlmError(t('err.contentFilter'), 'filter')
}

function modelError(message: unknown): LlmError {
  return new LlmError(withDetail(t('err.modelError'), str(message)), 'model')
}

/** "base（detail）" in the Chinese UI, "base (detail)" in English. */
function withDetail(base: string, detail: string): string {
  const d = detail.trim()
  if (!d) return base
  return getLang() === 'zh' ? `${base}（${d}）` : `${base} (${d})`
}

/**
 * A 200 whose body isn't JSON — a captive portal, a proxy's HTML page, the
 * HTML 404 of a wrong base URL — used to surface the browser's raw
 * SyntaxError in the editor / rewrite / global-edit panels.
 */
async function parseBody<T>(res: Response): Promise<T> {
  const text = await safeText(res)
  try {
    return JSON.parse(text) as T
  } catch {
    throw new LlmError(t('err.badResponse'), 'model')
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}

function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, '') + path
}

/**
 * `fetch` that turns a network-level failure ("Failed to fetch" TypeError) into
 * an actionable message. This fires when the request never gets an HTTP response
 * — flaky network, a blocked endpoint, or (commonly) a very slow model whose
 * non-streaming request outlasts the connection timeout. AbortErrors (user
 * cancel) are re-thrown untouched so callers can detect them.
 */
async function doFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    // Being offline is a different problem from "the endpoint rejected us" —
    // don't send the user off to re-enter keys or find a VPN.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new LlmError(t('err.offline'), 'offline')
    throw new LlmError(t('err.network'), 'network')
  }
}

async function httpError(res: Response, cfg: ResolvedConfig): Promise<LlmError> {
  return httpErrorFrom(res.status, res.statusText, await safeText(res), cfg)
}

function httpErrorFrom(status: number, statusText: string, text: string, cfg: ResolvedConfig): LlmError {
  // Raw detail: the provider's error message when the body is JSON, the body
  // itself when it's short text — never an HTML page (a wrong base URL
  // commonly answers with one; markup in a toast helps nobody).
  let detail = statusText
  if (text.trim()) {
    if (/^\s*<(!doctype|html|head|body)\b/i.test(text)) detail = ''
    else {
      try {
        const j = JSON.parse(text) as { error?: { message?: unknown } | string | null; message?: unknown }
        detail =
          typeof j.error === 'string'
            ? j.error
            : typeof j.error?.message === 'string'
              ? j.error.message
              : typeof j.message === 'string'
                ? j.message
                : text
      } catch {
        detail = text
      }
    }
  }
  const s = status
  // Lead with what the user can DO about it; the raw detail follows, shortened.
  // On the built-in key, "check your key in Settings" points at a field the
  // user never filled — say what actually happened and offer the way out.
  const authLike = s === 401 || s === 402 || s === 403 || s === 429
  const advice =
    authLike && cfg.systemKey
      ? t('err.systemKeyUnavailable')
      : s === 401 || s === 403
        ? t('err.http401')
        : s === 402
          ? t('err.http402')
          : s === 404
            ? t('err.http404')
            : s === 429
              ? t('err.http429')
              : s >= 500
                ? t('err.http5xx')
                : ''
  const raw = detail.trim().slice(0, 160)
  const prefix = t('err.httpPrefix').replace('{status}', String(s))
  return new LlmError(prefix + (advice ? withDetail(advice, raw) : detail.trim().slice(0, 300)), 'http', s)
}
