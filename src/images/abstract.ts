// Procedural background: a themed, per-slide abstract pattern encoded as an SVG
// data URI. Zero network, zero licensing, deterministic from the slide's text —
// an alternative to stock photos. The base color matches the theme backdrop, so
// it stays subtle and text-safe on every theme (no darkening scrim needed).

import type { SlideBg, ThemeName } from '../types'

/** [base backdrop, accent A, accent B, isLight] per theme — mirrors themes.css. */
const PALETTE: Record<ThemeName, [string, string, string, boolean]> = {
  aurora: ['#0b1020', '#8b7cff', '#22d3ee', false],
  ink: ['#eef1f8', '#3b5bdb', '#7048e8', true],
  sunrise: ['#160c1e', '#ff7a5c', '#ffc247', false],
  forest: ['#06231f', '#2dd4a7', '#a3e635', false],
  noir: ['#0a0a0b', '#fbbf24', '#f59e0b', false],
  sand: ['#faf5ec', '#c2683c', '#8a8b3d', true],
  rose: ['#1a0a1c', '#ff5da2', '#b06bff', false],
}

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

/**
 * A themed abstract background for a slide, seeded by `seed` (its title/query)
 * so it's stable across re-renders. Returns a `SlideBg` whose `url` is an inline
 * SVG data URI; `source: 'abstract'` (no attribution needed).
 */
export function abstractBg(seed: string, theme: ThemeName): SlideBg {
  const [base, a1, a2, light] = PALETTE[theme] ?? PALETTE.aurora
  const r = rng(hash(seed || theme))
  const op = light ? 0.22 : 0.44
  const W = 1280
  const H = 720

  // 4 soft blurred blobs; alternate the two accents; seeded position + size.
  let blobs = ''
  for (let i = 0; i < 4; i++) {
    const cx = Math.round(r() * W)
    const cy = Math.round(r() * H)
    const rr = Math.round(220 + r() * 220)
    const fill = i % 2 ? a2 : a1
    blobs += `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="${fill}"/>`
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">` +
    `<defs><filter id="b" x="-40%" y="-40%" width="180%" height="180%">` +
    `<feGaussianBlur stdDeviation="150"/></filter></defs>` +
    `<rect width="${W}" height="${H}" fill="${base}"/>` +
    `<g filter="url(#b)" opacity="${op}">${blobs}</g>` +
    `</svg>`

  return { url: `data:image/svg+xml,${encodeURIComponent(svg)}`, source: 'abstract' }
}
