// BYOK settings, persisted in localStorage (this is a static PWA — keys stay
// on the user's device and are sent only to the endpoint they configure).
//
// Exception: a *system* DeepSeek key may be baked into the build (from the
// VITE_DEEPSEEK_API_KEY env var) so users can generate out-of-the-box without
// filling anything in. NOTE: in a static site this key ships in the public
// bundle and is therefore world-readable — an accepted tradeoff for a painless
// default. Any other model still requires the user's own key.

import type { Branding } from '../types'
import { ABSTRACT_STYLES, type AbstractStyle } from '../images/abstract'

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
  /** 'photo' = search a stock source; 'abstract' = generate a themed pattern (no network). */
  mode: 'photo' | 'abstract'
  /** Abstract pattern family; 'auto' picks one per deck. Only used in abstract mode. */
  abstractStyle: AbstractStyle
  /** Unsplash Access Key (optional; preferred when set). */
  unsplashKey: string
  /** Pexels API Key (optional; used if no Unsplash key). */
  pexelsKey: string
  /** Pixabay API Key (optional; permissive license, no attribution needed). */
  pixabayKey: string
}

export type ImageSource = 'unsplash' | 'pexels' | 'pixabay' | 'openverse'

/** BYOK generative illustrations (any OpenAI-compatible images endpoint). */
export interface ImageGenSettings {
  baseUrl: string
  apiKey: string
  model: string
}

export interface LlmSettings {
  provider: Provider
  anthropic: ProviderConfig
  openai: ProviderConfig
  /** Thinking / reasoning mode. Currently applied to DeepSeek V4 endpoints. */
  thinking: boolean
  /** Auto background images per page. */
  images: ImageSettings
  /** AI-generated slide illustrations (BYOK, editor-triggered). */
  imageGen: ImageGenSettings
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
  pixabayKey: ((import.meta.env.VITE_PIXABAY_KEY as string | undefined) ?? '').trim(),
}
export const hasSystemImageKey =
  SYSTEM_IMAGE.unsplashKey.length > 0 || SYSTEM_IMAGE.pexelsKey.length > 0 || SYSTEM_IMAGE.pixabayKey.length > 0

/** Host of a URL, lowercased; '' when it doesn't parse. A scheme-less or
 * malformed base URL is therefore never "DeepSeek" and never a preset match
 * (five call sites used to each guess differently on the raw string). */
export function hostOf(url: string): string {
  try {
    return new URL(url.trim()).host.toLowerCase()
  } catch {
    return ''
  }
}

/** The one "is this DeepSeek" test: client extras, output cap, the thinking
 * toggle and the system-key fallback all key off it. */
export function isDeepSeekEndpoint(baseUrl: string): boolean {
  return hostOf(baseUrl).includes('deepseek')
}

/** Ensure a scheme: "api.example.com/v1" → "https://api.example.com/v1".
 * Without one, fetch resolved the base against the app's own origin and
 * POSTed the API key to GitHub Pages. */
export function normalizeBaseUrl(url: string): string {
  const s = url.trim().replace(/\/+$/, '')
  if (!s) return ''
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`
}

/**
 * Why a base URL can't be used ('' when it's fine): it isn't a URL, or it's
 * plain http to a non-local host — the API key would cross the network in
 * clear. http stays allowed for localhost / LAN / *.local (Ollama, LM Studio…).
 */
export function baseUrlProblem(url: string): '' | 'invalid' | 'insecure' {
  let u: URL
  try {
    u = new URL(url.trim())
  } catch {
    return 'invalid'
  }
  // Chromium's parser accepts "https://not a url" (spaces and all) where Node
  // and the spec refuse it — check the hostname ourselves.
  if (!plausibleHostname(u.hostname)) return 'invalid'
  if (u.protocol === 'https:') return ''
  if (u.protocol !== 'http:') return 'invalid'
  return isLocalHostname(u.hostname) ? '' : 'insecure'
}

function plausibleHostname(h: string): boolean {
  if (!h || /[\s%]/.test(h)) return false
  if (/^\[[0-9a-f:.]+\]$/i.test(h)) return true // IPv6 literal
  return /^[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?(\.[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?)*$/i.test(h)
}

function isLocalHostname(h: string): boolean {
  const host = h.toLowerCase().replace(/^\[|\]$/g, '')
  return (
    host === 'localhost' ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.lan') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  )
}

/** True when the active endpoint is DeepSeek and can ride on the system key. */
export function systemKeyApplies(settings: LlmSettings): boolean {
  return hasSystemKey && settings.provider === 'openai' && isDeepSeekEndpoint(settings.openai.baseUrl)
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
  images: {
    enabled: true,
    mode: 'photo',
    abstractStyle: 'auto',
    unsplashKey: '',
    pexelsKey: '',
    pixabayKey: '',
  },
  imageGen: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'dall-e-3',
  },
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
    const images = { ...DEFAULT_SETTINGS.images, ...parsed.images }
    if (!ABSTRACT_STYLES.includes(images.abstractStyle)) images.abstractStyle = 'auto'
    // Base URLs saved before the form validated them may lack a scheme.
    const anthropic = { ...DEFAULT_SETTINGS.anthropic, ...parsed.anthropic }
    const openai = { ...DEFAULT_SETTINGS.openai, ...parsed.openai }
    anthropic.baseUrl = normalizeBaseUrl(String(anthropic.baseUrl ?? '')) || DEFAULT_SETTINGS.anthropic.baseUrl
    openai.baseUrl = normalizeBaseUrl(String(openai.baseUrl ?? '')) || DEFAULT_SETTINGS.openai.baseUrl
    return {
      provider: parsed.provider === 'openai' ? 'openai' : 'anthropic',
      anthropic,
      openai,
      thinking: parsed.thinking === true,
      images,
      imageGen: { ...DEFAULT_SETTINGS.imageGen, ...parsed.imageGen },
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
  const img = settings.images
  if (img.unsplashKey.trim()) return { source: 'unsplash', key: img.unsplashKey.trim() }
  if (img.pexelsKey.trim()) return { source: 'pexels', key: img.pexelsKey.trim() }
  if (img.pixabayKey.trim()) return { source: 'pixabay', key: img.pixabayKey.trim() }
  if (SYSTEM_IMAGE.unsplashKey) return { source: 'unsplash', key: SYSTEM_IMAGE.unsplashKey }
  if (SYSTEM_IMAGE.pexelsKey) return { source: 'pexels', key: SYSTEM_IMAGE.pexelsKey }
  if (SYSTEM_IMAGE.pixabayKey) return { source: 'pixabay', key: SYSTEM_IMAGE.pixabayKey }
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
