// Procedural background: a themed, per-slide abstract pattern encoded as an SVG
// data URI. Zero network, zero licensing, deterministic from the slide's text —
// an alternative to stock photos. The base color matches the theme backdrop, so
// it stays subtle and text-safe on every theme (no darkening scrim needed).
//
// Several pattern *styles* are offered (soft blobs, gradient mesh, grid, dots,
// waves, diagonal rays). 'auto' picks one for the whole deck (seeded), so every
// slide shares a look while its shapes still vary page to page.

import type { SlideBg, ThemeName } from '../types'

export const ABSTRACT_STYLES = ['auto', 'blobs', 'mesh', 'grid', 'dots', 'waves', 'rays'] as const
export type AbstractStyle = (typeof ABSTRACT_STYLES)[number]
type Concrete = Exclude<AbstractStyle, 'auto'>
const CONCRETE: Concrete[] = ['blobs', 'mesh', 'grid', 'dots', 'waves', 'rays']

interface Pal {
  base: string
  a1: string
  a2: string
  light: boolean
}

/** {base backdrop, accent A, accent B, isLight} per theme — mirrors themes.css. */
const PALETTE: Record<ThemeName, Pal> = {
  aurora: { base: '#0b1020', a1: '#8b7cff', a2: '#22d3ee', light: false },
  ink: { base: '#eef1f8', a1: '#3b5bdb', a2: '#7048e8', light: true },
  sunrise: { base: '#160c1e', a1: '#ff7a5c', a2: '#ffc247', light: false },
  forest: { base: '#06231f', a1: '#2dd4a7', a2: '#a3e635', light: false },
  noir: { base: '#0a0a0b', a1: '#fbbf24', a2: '#f59e0b', light: false },
  sand: { base: '#faf5ec', a1: '#c2683c', a2: '#8a8b3d', light: true },
  rose: { base: '#1a0a1c', a1: '#ff5da2', a2: '#b06bff', light: false },
}

const W = 1280
const H = 720

/** Small deterministic string hash → 32-bit seed. */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Seeded PRNG (mulberry32) → () => [0,1). */
function rng(seed: number): () => number {
  let a = seed || 1
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const n1 = (v: number) => Math.round(v * 10) / 10 // 1-decimal, keeps the URI short

// Each generator returns the SVG inner markup (defs + shapes) drawn over the
// theme base rect. Opacities are tuned per style to stay text-safe (lighter on
// light themes, since there's no darkening scrim).

/** Soft, heavily-blurred accent blobs — the original look. */
function blobs(p: Pal, r: () => number): string {
  let shapes = ''
  for (let i = 0; i < 4; i++) {
    const cx = Math.round(r() * W)
    const cy = Math.round(r() * H)
    const rr = Math.round(220 + r() * 220)
    shapes += `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="${i % 2 ? p.a2 : p.a1}"/>`
  }
  const op = p.light ? 0.22 : 0.44
  return (
    `<defs><filter id="b" x="-40%" y="-40%" width="180%" height="180%">` +
    `<feGaussianBlur stdDeviation="150"/></filter></defs>` +
    `<g filter="url(#b)" opacity="${op}">${shapes}</g>`
  )
}

/** Smooth radial-gradient mesh — overlapping accent glows fading to transparent. */
function mesh(p: Pal, r: () => number): string {
  const op = p.light ? 0.5 : 0.85
  const spots: Array<[number, number]> = [
    [0, 0],
    [W, 0],
    [0, H],
    [W, H],
    [W / 2, H / 2],
  ]
  let defs = ''
  let body = ''
  for (let i = 0; i < 3; i++) {
    const col = i === 1 ? p.a2 : p.a1
    const [cx, cy] = spots[Math.floor(r() * spots.length)]
    const rr = Math.round(520 + r() * 280)
    defs +=
      `<radialGradient id="m${i}" cx="${cx}" cy="${cy}" r="${rr}" gradientUnits="userSpaceOnUse">` +
      `<stop offset="0" stop-color="${col}" stop-opacity="${op}"/>` +
      `<stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>`
    body += `<rect width="${W}" height="${H}" fill="url(#m${i})"/>`
  }
  return `<defs>${defs}</defs>${body}`
}

/** A soft accent glow anchored to one corner — shared depth cue for line patterns. */
function cornerGlow(p: Pal, r: () => number): string {
  const cx = r() > 0.5 ? W : 0
  const cy = r() > 0.5 ? H : 0
  const op = p.light ? 0.16 : 0.3
  return (
    `<radialGradient id="cg" cx="${cx}" cy="${cy}" r="760" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="${p.a2}" stop-opacity="${op}"/>` +
    `<stop offset="1" stop-color="${p.a2}" stop-opacity="0"/></radialGradient>`
  )
}

/** Fine engineering grid. */
function grid(p: Pal, r: () => number): string {
  const sp = Math.round(46 + r() * 26)
  const op = p.light ? 0.16 : 0.22
  return (
    `<defs>` +
    `<pattern id="g" width="${sp}" height="${sp}" patternUnits="userSpaceOnUse">` +
    `<path d="M ${sp} 0 L 0 0 0 ${sp}" fill="none" stroke="${p.a1}" stroke-width="1.2" opacity="${op}"/>` +
    `</pattern>${cornerGlow(p, r)}</defs>` +
    `<rect width="${W}" height="${H}" fill="url(#g)"/>` +
    `<rect width="${W}" height="${H}" fill="url(#cg)"/>`
  )
}

/** Dot matrix. */
function dots(p: Pal, r: () => number): string {
  const sp = Math.round(32 + r() * 18)
  const op = p.light ? 0.2 : 0.28
  return (
    `<defs>` +
    `<pattern id="d" width="${sp}" height="${sp}" patternUnits="userSpaceOnUse">` +
    `<circle cx="${n1(sp / 2)}" cy="${n1(sp / 2)}" r="2.4" fill="${p.a1}" opacity="${op}"/>` +
    `</pattern>${cornerGlow(p, r)}</defs>` +
    `<rect width="${W}" height="${H}" fill="url(#d)"/>` +
    `<rect width="${W}" height="${H}" fill="url(#cg)"/>`
  )
}

/** Layered smooth waves rising from the bottom. */
function waves(p: Pal, r: () => number): string {
  const op = p.light ? 0.1 : 0.16
  const layers = 4
  let body = ''
  for (let i = 0; i < layers; i++) {
    const baseY = H * 0.34 + i * H * 0.16
    const amp = 34 + r() * 60
    const phase = r() * Math.PI * 2
    const freq = 1 + Math.floor(r() * 2) // 1 or 2 humps
    const N = 24
    let d = `M 0 ${n1(baseY)}`
    for (let k = 1; k <= N; k++) {
      const x = (W / N) * k
      const y = baseY + Math.sin(phase + (k / N) * Math.PI * 2 * freq) * amp
      d += ` L ${n1(x)} ${n1(y)}`
    }
    d += ` L ${W} ${H} L 0 ${H} Z`
    body += `<path d="${d}" fill="${i % 2 ? p.a2 : p.a1}" opacity="${op}"/>`
  }
  return body
}

/** Diagonal light rays / stripes with a gentle accent wash. */
function rays(p: Pal, r: () => number): string {
  const sp = Math.round(70 + r() * 44)
  const angle = Math.round(-28 + r() * 56)
  const op = p.light ? 0.1 : 0.16
  const washOp = p.light ? 0.14 : 0.22
  return (
    `<defs>` +
    `<pattern id="r" width="${sp}" height="${sp}" patternUnits="userSpaceOnUse" patternTransform="rotate(${angle})">` +
    `<rect width="${n1(sp / 2)}" height="${sp}" fill="${p.a1}" opacity="${op}"/>` +
    `</pattern>` +
    `<linearGradient id="rw" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${p.a2}" stop-opacity="${washOp}"/>` +
    `<stop offset="1" stop-color="${p.a2}" stop-opacity="0"/></linearGradient></defs>` +
    `<rect width="${W}" height="${H}" fill="url(#r)"/>` +
    `<rect width="${W}" height="${H}" fill="url(#rw)"/>`
  )
}

const GENS: Record<Concrete, (p: Pal, r: () => number) => string> = {
  blobs,
  mesh,
  grid,
  dots,
  waves,
  rays,
}

/** Resolve 'auto' to a concrete style, deterministically from `seed`. */
export function resolveAbstractStyle(style: AbstractStyle, seed: string): Concrete {
  if (style !== 'auto') return style
  return CONCRETE[hash(seed) % CONCRETE.length]
}

/**
 * A themed abstract background for a slide, seeded by `seed` (its title/query)
 * so it's stable across re-renders. `style` selects the pattern family; pass a
 * concrete style (resolve 'auto' once per deck with `resolveAbstractStyle` for a
 * consistent look). Returns a `SlideBg` whose `url` is an inline SVG data URI;
 * `source: 'abstract'` (no attribution needed).
 */
export function abstractBg(seed: string, theme: ThemeName, style: AbstractStyle = 'auto'): SlideBg {
  const p = PALETTE[theme] ?? PALETTE.aurora
  const concrete = resolveAbstractStyle(style, seed || theme)
  const r = rng(hash(seed || theme))
  const gen = GENS[concrete] ?? blobs
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">` +
    `<rect width="${W}" height="${H}" fill="${p.base}"/>` +
    gen(p, r) +
    `</svg>`
  return { url: `data:image/svg+xml,${encodeURIComponent(svg)}`, source: 'abstract' }
}
