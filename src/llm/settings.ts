// BYOK settings, persisted in localStorage (this is a static PWA — keys stay
// on the user's device and are sent only to the endpoint they configure).

export type Provider = 'anthropic' | 'openai'

export interface ProviderConfig {
  apiKey: string
  baseUrl: string
  model: string
}

export interface LlmSettings {
  provider: Provider
  anthropic: ProviderConfig
  openai: ProviderConfig
  /** Thinking / reasoning mode. Currently applied to DeepSeek V4 endpoints. */
  thinking: boolean
}

const STORAGE_KEY = 'ppt2html.settings.v1'

export const DEFAULT_SETTINGS: LlmSettings = {
  provider: 'anthropic',
  anthropic: {
    apiKey: '',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-opus-4-8',
  },
  openai: {
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  thinking: false,
}

export function loadSettings(): LlmSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return structuredClone(DEFAULT_SETTINGS)
    const parsed = JSON.parse(raw) as Partial<LlmSettings>
    return {
      provider: parsed.provider === 'openai' ? 'openai' : 'anthropic',
      anthropic: { ...DEFAULT_SETTINGS.anthropic, ...parsed.anthropic },
      openai: { ...DEFAULT_SETTINGS.openai, ...parsed.openai },
      thinking: parsed.thinking === true,
    }
  } catch {
    return structuredClone(DEFAULT_SETTINGS)
  }
}

export function saveSettings(settings: LlmSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function activeConfig(settings: LlmSettings): ProviderConfig {
  return settings.provider === 'openai' ? settings.openai : settings.anthropic
}

export function isConfigured(settings: LlmSettings): boolean {
  return activeConfig(settings).apiKey.trim().length > 0
}
