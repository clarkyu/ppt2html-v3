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
    models: ['claude-opus-4-8', 'claude-sonnet-5', 'claude-fable-5', 'claude-haiku-4-5-20251001'],
  },
  {
    label: 'OpenAI',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      'gpt-5',
      'gpt-5-mini',
      'gpt-5-nano',
      'gpt-4.1',
      'gpt-4.1-mini',
      'gpt-4.1-nano',
      'gpt-4o',
      'gpt-4o-mini',
      'chatgpt-4o-latest',
      'o3',
      'o3-pro',
      'o3-mini',
      'o4-mini',
      'o1',
      'gpt-4-turbo',
    ],
  },
  {
    label: 'Google Gemini',
    provider: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: [
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-1.5-flash-8b',
    ],
  },
  {
    label: 'DeepSeek',
    provider: 'openai',
    baseUrl: 'https://api.deepseek.com',
    models: ['deepseek-chat', 'deepseek-reasoner'],
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
      'openai/gpt-4o',
      'anthropic/claude-sonnet-4',
      'google/gemini-2.5-pro',
      'deepseek/deepseek-chat',
      'meta-llama/llama-3.3-70b-instruct',
      'qwen/qwen-2.5-72b-instruct',
    ],
  },
]

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
