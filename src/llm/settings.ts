// BYOK settings, persisted in localStorage (this is a static PWA — keys stay
// on the user's device and are sent only to the endpoint they configure).
//
// Exception: a *system* DeepSeek key may be baked into the build (from the
// VITE_DEEPSEEK_API_KEY env var) so users can generate out-of-the-box without
// filling anything in. NOTE: in a static site this key ships in the public
// bundle and is therefore world-readable — an accepted tradeoff for a painless
// default. Any other model still requires the user's own key.

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

/** System-provided DeepSeek fallback (see file header). */
export const SYSTEM_DEEPSEEK = {
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-pro',
  apiKey: ((import.meta.env.VITE_DEEPSEEK_API_KEY as string | undefined) ?? '').trim(),
}
export const hasSystemKey = SYSTEM_DEEPSEEK.apiKey.length > 0

function isDeepSeekHost(url: string): boolean {
  try {
    return new URL(url).host.toLowerCase().includes('deepseek')
  } catch {
    return url.toLowerCase().includes('deepseek')
  }
}

/** True when the active endpoint is DeepSeek and can ride on the system key. */
export function systemKeyApplies(settings: LlmSettings): boolean {
  return hasSystemKey && settings.provider === 'openai' && isDeepSeekHost(settings.openai.baseUrl)
}

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

/** Fresh defaults. With a system key, default to system DeepSeek (thinking on). */
function freshDefaults(): LlmSettings {
  const d = structuredClone(DEFAULT_SETTINGS)
  if (hasSystemKey) {
    d.provider = 'openai'
    d.openai.baseUrl = SYSTEM_DEEPSEEK.baseUrl
    d.openai.model = SYSTEM_DEEPSEEK.model
    d.thinking = true
  }
  return d
}

export function loadSettings(): LlmSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return freshDefaults()
    const parsed = JSON.parse(raw) as Partial<LlmSettings>
    return {
      provider: parsed.provider === 'openai' ? 'openai' : 'anthropic',
      anthropic: { ...DEFAULT_SETTINGS.anthropic, ...parsed.anthropic },
      openai: { ...DEFAULT_SETTINGS.openai, ...parsed.openai },
      thinking: parsed.thinking === true,
    }
  } catch {
    return freshDefaults()
  }
}

export function saveSettings(settings: LlmSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function activeConfig(settings: LlmSettings): ProviderConfig {
  return settings.provider === 'openai' ? settings.openai : settings.anthropic
}

/** The API key to actually send: the user's, or the system DeepSeek key. */
export function effectiveApiKey(settings: LlmSettings): string {
  const own = activeConfig(settings).apiKey.trim()
  if (own) return own
  return systemKeyApplies(settings) ? SYSTEM_DEEPSEEK.apiKey : ''
}

/** Configured = the user has a key, or the system DeepSeek fallback covers it. */
export function isConfigured(settings: LlmSettings): boolean {
  return effectiveApiKey(settings).length > 0
}
