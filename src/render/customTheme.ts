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

/** sRGB relative luminance, 0 (black) → 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => v / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Is the custom theme a light (bright-background) one? */
export function isLightCustom(ct: CustomTheme): boolean {
  return luminance(ct.bg) > 0.5
}

/** The `{base,a1,a2,light}` shape abstract.ts wants, from a custom theme. */
export function customAbstractPalette(ct: CustomTheme): { base: string; a1: string; a2: string; light: boolean } {
  return { base: ct.bg, a1: ct.accent, a2: ct.accent2, light: isLightCustom(ct) }
}

/** The derived CSS custom properties for a custom theme. */
export function customThemeVars(ct: CustomTheme): Record<string, string> {
  const { bg, accent, accent2 } = ct
  const light = luminance(bg) > 0.5

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
