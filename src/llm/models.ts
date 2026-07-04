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

export const MODEL_PRESETS: ModelPreset[] = [
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
    models: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen-long'],
  },
  {
    label: 'Kimi',
    provider: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['kimi-latest', 'moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  },
  {
    label: 'OpenAI',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1', 'gpt-4.1-mini'],
  },
  {
    label: 'Claude',
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'],
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
