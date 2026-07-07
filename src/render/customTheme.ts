// Derive a full palette from a user's minimal "我的风格" choices (a base
// background color + two accents + serif toggle). Everything the themes.css
// `.theme-*` rules hand-author — text, muted, card, borders, code colors, the
// backdrop gradient — is computed here by luminance, then applied as INLINE CSS
// custom properties on the deck root so a custom theme works everywhere a named
// theme does (player, previews, standalone export) with no `.theme-*` class.

import type { CustomTheme } from '../types'

const SERIF_STACK = 'Georgia, "Songti SC", "Noto Serif SC", "SimSun", "Times New Roman", serif'
const SANS_STACK =
  '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

/** All CSS custom properties a custom theme overrides. */
const VAR_KEYS = [
  '--bg',
  '--fg',
  '--fg-strong',
  '--muted',
  '--accent',
  '--accent2',
  '--accent-grad',
  '--card',
  '--card-border',
  '--rule',
  '--code-bg',
  '--code-fg',
  '--code-inline-bg',
  '--font-display',
] as const

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0) as [number, number, number]
}

/** Canonicalize any hex-ish string to `#rrggbb` lowercase; null if unusable. */
export function normalizeHex(hex: unknown): string | null {
  if (typeof hex !== 'string') return null
  const h = hex.trim().replace(/^#/, '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return /^[0-9a-fA-F]{6}$/.test(full) ? `#${full.toLowerCase()}` : null
}

/**
 * Validate a possibly-untrusted custom theme (from a share link or localStorage)
 * into one with canonical `#rrggbb` colors — or undefined if any color is bad,
 * so a malformed palette silently falls back to the named theme instead of
 * emitting invalid CSS / NaN export colors.
 */
export function sanitizeCustomTheme(ct: unknown): CustomTheme | undefined {
  if (!ct || typeof ct !== 'object') return undefined
  const c = ct as Record<string, unknown>
  const bg = normalizeHex(c.bg)
  const accent = normalizeHex(c.accent)
  const accent2 = normalizeHex(c.accent2)
  if (!bg || !accent || !accent2) return undefined
  return { bg, accent, accent2, serif: c.serif === true }
}
function toHex(rgb: [number, number, number]): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`
}
/** Linear mix; `t` = weight of `a`. */
function mix(a: string, b: string, t: number): string {
  const pa = parseHex(a)
  const pb = parseHex(b)
  return toHex([0, 1, 2].map((i) => pa[i] * t + pb[i] * (1 - t)) as [number, number, number])
}
function rgba(hex: string, a: number): string {
  const [r, g, b] = parseHex(hex)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

/** WCAG relative luminance (gamma-corrected), 0 (black) → 1 (white). */
function relLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(l1: number, l2: number): number {
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

/**
 * Should this background use a light (dark-text) UI? Decided by which of pure
 * black vs white text actually contrasts better — robust for saturated
 * mid-luminance colors where a fixed luminance threshold picks unreadable text.
 * Shared by the CSS and PPTX derivations so they never disagree.
 */
export function isLightBg(hex: string): boolean {
  const L = relLuminance(normalizeHex(hex) ?? '#000000')
  return contrast(L, 0) >= contrast(L, 1) // black text wins → treat bg as light
}

/** Is the custom theme a light (bright-background) one? */
export function isLightCustom(ct: CustomTheme): boolean {
  return isLightBg(ct.bg)
}

/** The `{base,a1,a2,light}` shape abstract.ts wants, from a custom theme. */
export function customAbstractPalette(ct: CustomTheme): { base: string; a1: string; a2: string; light: boolean } {
  return {
    base: normalizeHex(ct.bg) ?? '#0b1020',
    a1: normalizeHex(ct.accent) ?? '#8b7cff',
    a2: normalizeHex(ct.accent2) ?? '#22d3ee',
    light: isLightCustom(ct),
  }
}

/** The derived CSS custom properties for a custom theme. */
export function customThemeVars(ct: CustomTheme): Record<string, string> {
  // Normalize first so a `#`-less or 3-digit color can't emit invalid CSS.
  const bg = normalizeHex(ct.bg) ?? '#0b1020'
  const accent = normalizeHex(ct.accent) ?? '#8b7cff'
  const accent2 = normalizeHex(ct.accent2) ?? '#22d3ee'
  const light = isLightBg(bg)

  const fg = light ? mix('#000000', bg, 0.82) : mix('#ffffff', bg, 0.9)
  const fgStrong = light ? mix('#000000', bg, 0.92) : '#ffffff'
  const muted = light ? mix('#000000', bg, 0.5) : mix('#ffffff', bg, 0.56)
  const card = light ? mix('#ffffff', bg, 0.55) : rgba('#ffffff', 0.05)
  const cardBorder = light ? mix('#000000', bg, 0.12) : rgba('#ffffff', 0.12)
  const rule = light ? mix('#000000', bg, 0.1) : rgba('#ffffff', 0.12)
  const codeBg = light ? '#1b2130' : mix('#000000', bg, 0.45)
  const deep = light ? mix('#000000', bg, 0.04) : mix('#000000', bg, 0.28)

  return {
    '--bg':
      `radial-gradient(1150px 820px at 12% -5%, ${rgba(accent, light ? 0.1 : 0.2)} 0%, transparent 58%), ` +
      `radial-gradient(880px 680px at 100% 100%, ${rgba(accent2, light ? 0.08 : 0.16)} 0%, transparent 55%), ` +
      `linear-gradient(160deg, ${bg}, ${deep})`,
    '--fg': fg,
    '--fg-strong': fgStrong,
    '--muted': muted,
    '--accent': accent,
    '--accent2': accent2,
    '--accent-grad': `linear-gradient(120deg, ${accent}, ${accent2})`,
    '--card': card,
    '--card-border': cardBorder,
    '--rule': rule,
    '--code-bg': codeBg,
    '--code-fg': '#e6e9f5',
    '--code-inline-bg': rgba(accent, light ? 0.12 : 0.16),
    '--font-display': ct.serif ? SERIF_STACK : SANS_STACK,
  }
}

/** Apply (or clear, when `ct` is undefined) a custom theme's inline vars on `el`. */
export function applyCustomTheme(el: HTMLElement, ct: CustomTheme | undefined): void {
  if (!ct) {
    VAR_KEYS.forEach((k) => el.style.removeProperty(k))
    return
  }
  const vars = customThemeVars(ct)
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v)
}

/** A `style="..."` attribute value for a custom theme (for server-side/export HTML). */
export function customThemeStyleAttr(ct: CustomTheme): string {
  return Object.entries(customThemeVars(ct))
    .map(([k, v]) => `${k}:${v}`)
    .join(';')
}
