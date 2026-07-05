// BYOK settings, persisted in localStorage (this is a static PWA — keys stay
// on the user's device and are sent only to the endpoint they configure).
//
// Exception: a *system* DeepSeek key may be baked into the build (from the
// VITE_DEEPSEEK_API_KEY env var) so users can generate out-of-the-box without
// filling anything in. NOTE: in a static site this key ships in the public
// bundle and is therefore world-readable — an accepted tradeoff for a painless
// default. Any other model still requires the user's own key.

import type { Branding } from '../types'

export type Provider = 'anthropic' | 'openai'

export interface ProviderConfig {
  apiKey: string
  baseUrl: string
  model: string
}

/** Per-page background image settings (hybrid: free Openverse + optional BYOK). */
export interface ImageSettings {
  /** Master toggle for auto background images. */
  enabled: boolean
  /** Unsplash Access Key (optional; preferred when set). */
  unsplashKey: string
  /** Pexels API Key (optional; used if no Unsplash key). */
  pexelsKey: string
}

export type ImageSource = 'unsplash' | 'pexels' | 'openverse'

export interface LlmSettings {
  provider: Provider
  anthropic: ProviderConfig
  openai: ProviderConfig
  /** Thinking / reasoning mode. Currently applied to DeepSeek V4 endpoints. */
  thinking: boolean
  /** Auto background images per page. */
  images: ImageSettings
  /** Default presenter / org / logo (baked into new decks; editable per deck). */
  branding: Branding
}

const STORAGE_KEY = 'ppt2html.settings.v1'

/** System-provided DeepSeek fallback (see file header). */
export const SYSTEM_DEEPSEEK = {
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-pro',
  apiKey: ((import.meta.env.VITE_DEEPSEEK_API_KEY as string | undefined) ?? '').trim(),
}
export const hasSystemKey = SYSTEM_DEEPSEEK.apiKey.length > 0

/**
 * System-provided image-search keys (baked in from build-time env vars, like
 * the DeepSeek key). When present, all users get high-quality Unsplash / Pexels
 * backgrounds by default without configuring anything. Same public-bundle
 * tradeoff as the DeepSeek key.
 */
export const SYSTEM_IMAGE = {
  unsplashKey: ((import.meta.env.VITE_UNSPLASH_KEY as string | undefined) ?? '').trim(),
  pexelsKey: ((import.meta.env.VITE_PEXELS_KEY as string | undefined) ?? '').trim(),
}
export const hasSystemImageKey = SYSTEM_IMAGE.unsplashKey.length > 0 || SYSTEM_IMAGE.pexelsKey.length > 0

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
  images: { enabled: true, unsplashKey: '', pexelsKey: '' },
  branding: {},
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
      images: { ...DEFAULT_SETTINGS.images, ...parsed.images },
      branding: { ...DEFAULT_SETTINGS.branding, ...parsed.branding },
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

/**
 * The image backend + key to actually use, in priority order:
 * user's Unsplash → user's Pexels → system Unsplash → system Pexels → free Openverse.
 */
export function effectiveImageProvider(settings: LlmSettings): { source: ImageSource; key: string } {
  if (settings.images.unsplashKey.trim()) return { source: 'unsplash', key: settings.images.unsplashKey.trim() }
  if (settings.images.pexelsKey.trim()) return { source: 'pexels', key: settings.images.pexelsKey.trim() }
  if (SYSTEM_IMAGE.unsplashKey) return { source: 'unsplash', key: SYSTEM_IMAGE.unsplashKey }
  if (SYSTEM_IMAGE.pexelsKey) return { source: 'pexels', key: SYSTEM_IMAGE.pexelsKey }
  return { source: 'openverse', key: '' }
}

/** Which image backend applies (source only). */
export function imageSource(settings: LlmSettings): ImageSource {
  return effectiveImageProvider(settings).source
}

/** Branding for a newly generated deck: global defaults + today's date. */
export function newDeckBranding(settings: LlmSettings): Branding {
  const b = settings.branding ?? {}
  const today = new Date().toISOString().slice(0, 10)
  const out: Branding = {
    presenter: b.presenter?.trim() || undefined,
    org: b.org?.trim() || undefined,
    logo: b.logo?.trim() || undefined,
    date: b.date?.trim() || today,
  }
  // Only attach if there's anything to show.
  return out.presenter || out.org || out.logo ? out : { date: out.date }
}
