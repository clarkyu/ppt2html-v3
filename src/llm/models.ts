// Shared catalog of known providers/endpoints and their common model IDs.
// Used by both the Settings page and the pre-generation model picker so the
// user can *choose* a model instead of typing one (custom entry still allowed).

import type { Provider } from './settings'

export interface ModelPreset {
  label: string
  provider: Provider
  baseUrl: string
  /** Suggested model IDs for this endpoint; first is the sensible default. */
  models: string[]
}

// A broad catalog of popular providers. Every non-Anthropic service speaks the
// OpenAI-compatible protocol, so they all use provider 'openai' with their own
// base URL. Any endpoint not listed here still works via 设置 → 自定义.
// Note: some third-party endpoints block browser (CORS) calls — see README.
export const MODEL_PRESETS: ModelPreset[] = [
  {
    label: 'Claude',
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: [
      'claude-opus-4-8',
      'claude-opus-4-7',
      'claude-opus-4-6',
      'claude-sonnet-5',
      'claude-sonnet-4-6',
      'claude-haiku-4-5',
      'claude-fable-5',
      'claude-opus-4-5',
      'claude-sonnet-4-5',
    ],
  },
  {
    label: 'OpenAI',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      'gpt-5.5',
      'gpt-5.5-pro',
      'gpt-5.4',
      'gpt-5.4-mini',
      'gpt-5.4-nano',
      'gpt-5.2',
      'gpt-5.1',
      'gpt-5',
      'gpt-5-mini',
      'gpt-5-nano',
      'gpt-5.3-codex',
      'gpt-4.1',
      'gpt-4.1-mini',
      'gpt-4.1-nano',
      'gpt-4o',
      'gpt-4o-mini',
      'chatgpt-4o-latest',
      'o3-pro',
      'o3',
    ],
  },
  {
    label: 'Google Gemini',
    provider: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: [
      'gemini-3.5-flash',
      'gemini-3.1-pro-preview',
      'gemini-3.1-flash-lite',
      'gemini-3-flash-preview',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
    ],
  },
  {
    label: 'DeepSeek',
    provider: 'openai',
    baseUrl: 'https://api.deepseek.com',
    models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
  },
  {
    label: '通义千问',
    provider: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-long', 'qwen2.5-72b-instruct', 'qwen2.5-32b-instruct', 'qwen2.5-14b-instruct'],
  },
  {
    label: 'Kimi',
    provider: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['kimi-latest', 'moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  },
  {
    label: '智谱 GLM',
    provider: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4.5', 'glm-4-plus', 'glm-4-air', 'glm-4-airx', 'glm-4-flash', 'glm-4-long'],
  },
  {
    label: '文心一言',
    provider: 'openai',
    baseUrl: 'https://qianfan.baidubce.com/v2',
    models: ['ernie-4.5-turbo-8k', 'ernie-4.0-8k', 'ernie-4.0-turbo-8k', 'ernie-3.5-8k', 'ernie-speed-128k'],
  },
  {
    label: 'xAI Grok',
    provider: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    models: ['grok-4', 'grok-3', 'grok-3-mini', 'grok-2-latest'],
  },
  {
    label: 'Mistral',
    provider: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    models: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest', 'open-mistral-nemo', 'codestral-latest'],
  },
  {
    label: 'Groq',
    provider: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'deepseek-r1-distill-llama-70b', 'gemma2-9b-it'],
  },
  {
    label: 'OpenRouter',
    provider: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      'openai/gpt-5.5',
      'anthropic/claude-opus-4-8',
      'google/gemini-3.5-flash',
      'deepseek/deepseek-chat',
      'meta-llama/llama-3.3-70b-instruct',
      'qwen/qwen-2.5-72b-instruct',
    ],
  },
]

/**
 * Short, friendly one-word-ish tags for well-known models, shown next to the id
 * in the picker so newcomers can tell "strongest" from "cheapest / fastest".
 * Models not listed here simply show their id with no tag.
 */
export const MODEL_NOTES: Record<string, string> = {
  // Claude
  'claude-opus-4-8': '推荐 · 最强',
  'claude-sonnet-5': '性价比',
  'claude-haiku-4-5': '最快最省',
  'claude-fable-5': '最强 · 较贵',
  // OpenAI
  'gpt-5.5': '推荐 · 最强',
  'gpt-5.4': '较强',
  'gpt-5.4-mini': '性价比',
  'gpt-5.4-nano': '最快最省',
  'gpt-4o-mini': '便宜',
  // Gemini
  'gemini-3.5-flash': '推荐 · 性价比',
  'gemini-3.1-pro-preview': '最强 · 预览',
  'gemini-2.5-flash': '快',
  // DeepSeek
  'deepseek-v4-pro': '推荐 · 系统已提供',
  'deepseek-v4-flash': '更快',
}

/** The friendly tag for a model id, if any. */
export function modelNote(id: string): string {
  return MODEL_NOTES[id.trim()] ?? ''
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase()
  } catch {
    return url.trim().toLowerCase()
  }
}

/** Best-matching preset for a provider + base URL (matched by host). */
export function presetFor(provider: Provider, baseUrl: string): ModelPreset | undefined {
  const host = hostOf(baseUrl)
  return MODEL_PRESETS.find((p) => p.provider === provider && hostOf(p.baseUrl) === host)
}

/**
 * The model options to offer for a given provider + base URL. Always includes
 * the currently-selected model (so a custom value is never silently dropped).
 */
export function modelChoicesFor(provider: Provider, baseUrl: string, current: string): string[] {
  const preset = presetFor(provider, baseUrl)
  const base = preset?.models ?? (provider === 'anthropic' ? ['claude-opus-4-8'] : ['gpt-4o-mini'])
  const cur = current.trim()
  return cur && !base.includes(cur) ? [cur, ...base] : base
}
