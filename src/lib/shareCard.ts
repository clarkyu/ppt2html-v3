// Share card: a portrait PNG (1080×1440) drawn on canvas — deck-palette cover
// art, title/branding, and a scannable QR of the share link. Built for mobile
// messengers, where an image travels much farther than a bare link: the
// hash-fragment share URL never reaches a server, so a static host can't give
// it a rich link preview — the card IS the preview, and the QR rides along.
//
// Baked-in captions follow the deck's language (deckIsCjk), not the UI locale,
// same as the rendered slides.

import type { Deck } from '../types'
import { themePalette, type Pal } from '../images/abstract'
import { customAbstractPalette } from '../render/customTheme'
import { deckIsCjk } from './lang'

const W = 1080
const H = 1440
const PAD = 84
const SANS = "-apple-system, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', system-ui, sans-serif"

// Seeded randomness (FNV-1a + mulberry32), local mirror of images/abstract.ts.
// The SVG generators there carry no intrinsic size, which makes canvas
// rasterization unreliable across browsers — so the card paints its own art.
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

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

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

const stripMd = (s: string): string => s.replace(/\*\*/g, '')

/** Greedy wrap; prefers breaking at spaces, falls back to per-char (CJK). */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = []
  let line = ''
  let lastSpace = -1
  for (const ch of text) {
    if (ch === '\n') {
      lines.push(line)
      line = ''
      lastSpace = -1
      continue
    }
    const next = line + ch
    if (ctx.measureText(next).width > maxWidth && line) {
      if (ch === ' ') {
        lines.push(line)
        line = ''
        lastSpace = -1
        continue
      }
      if (lastSpace > 0) {
        lines.push(line.slice(0, lastSpace))
        line = line.slice(lastSpace + 1) + ch
        lastSpace = line.lastIndexOf(' ')
      } else {
        lines.push(line)
        line = ch
      }
    } else {
      line = next
      if (ch === ' ') lastSpace = line.length - 1
    }
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    kept[maxLines - 1] = kept[maxLines - 1].replace(/\s*$/, '') + '…'
    return kept
  }
  return lines
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Backdrop: theme base + seeded accent glows + a readability scrim. */
function drawBackdrop(ctx: CanvasRenderingContext2D, p: Pal, seed: string): void {
  ctx.fillStyle = p.base
  ctx.fillRect(0, 0, W, H)
  const r = rng(hash(seed))
  // Lighter glows on light themes — no darkening scrim to hide behind.
  const glow = p.light ? 0.28 : 0.5
  const colors = [p.a1, p.a2, p.a1]
  for (const c of colors) {
    const cx = r() * W
    const cy = r() * H * 0.9
    const rr = 420 + r() * 420
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr)
    g.addColorStop(0, rgba(c, glow))
    g.addColorStop(1, rgba(c, 0))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }
  const s = ctx.createLinearGradient(0, 0, 0, H)
  s.addColorStop(0, rgba(p.base, 0.16))
  s.addColorStop(0.45, rgba(p.base, 0.55))
  s.addColorStop(1, rgba(p.base, 0.86))
  ctx.fillStyle = s
  ctx.fillRect(0, 0, W, H)
}

function drawQr(ctx: CanvasRenderingContext2D, qr: { getModuleCount(): number; isDark(r: number, c: number): boolean }, x: number, y: number, box: number): void {
  const count = qr.getModuleCount()
  const cell = Math.floor((box - 48) / count) // ≥24px quiet zone on every side
  const size = cell * count
  const ox = x + Math.round((box - size) / 2)
  const oy = y + Math.round((box - size) / 2)
  ctx.fillStyle = '#111318'
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) ctx.fillRect(ox + col * cell, oy + row * cell, cell, cell)
    }
  }
}

/** Draw the card and return it as a PNG blob. Throws if canvas export fails. */
export async function buildShareCard(deck: Deck, url: string): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas 2d context')

  const p: Pal = deck.customTheme ? customAbstractPalette(deck.customTheme) : themePalette(deck.theme)
  const cjk = deckIsCjk(deck)
  const fg = p.light ? '#1a1a22' : '#ffffff'
  const mutedBase = p.light ? '#000000' : '#ffffff'
  const title = stripMd(deck.title || (cjk ? '未命名课件' : 'Untitled deck'))

  drawBackdrop(ctx, p, title)
  ctx.textBaseline = 'alphabetic'

  // Top chip: "AI 课件 · N 页"
  const chipText = cjk ? `AI 课件 · ${deck.slides.length} 页` : `AI DECK · ${deck.slides.length} SLIDES`
  ctx.font = `600 30px ${SANS}`
  const chipW = Math.ceil(ctx.measureText(chipText).width) + 56
  roundRect(ctx, PAD, PAD, chipW, 64, 32)
  ctx.fillStyle = rgba(p.a1, p.light ? 0.14 : 0.22)
  ctx.fill()
  ctx.strokeStyle = rgba(p.a1, 0.55)
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = p.light ? p.a1 : rgba('#ffffff', 0.92)
  ctx.fillText(chipText, PAD + 28, PAD + 42)

  // Title: shrink until it fits 4 lines.
  const textW = W - PAD * 2
  let size = 92
  let lines: string[] = []
  for (; size >= 56; size -= 4) {
    ctx.font = `700 ${size}px ${SANS}`
    lines = wrapLines(ctx, title, textW, 4)
    if (lines.length <= 4 && !(lines.length === 4 && size > 76)) break
  }
  ctx.font = `700 ${size}px ${SANS}`
  ctx.fillStyle = fg
  let y = PAD + 170 + size
  for (const ln of lines) {
    ctx.fillText(ln, PAD, y)
    y += Math.round(size * 1.24)
  }
  y -= Math.round(size * 1.24)

  // Accent bar under the title.
  const bar = ctx.createLinearGradient(PAD, 0, PAD + 150, 0)
  bar.addColorStop(0, p.a1)
  bar.addColorStop(1, p.a2)
  roundRect(ctx, PAD, y + 44, 150, 10, 5)
  ctx.fillStyle = bar
  ctx.fill()
  y += 54

  // Subtitle (2 lines max).
  if (deck.subtitle?.trim()) {
    ctx.font = `400 42px ${SANS}`
    ctx.fillStyle = rgba(mutedBase, 0.72)
    let sy = y + 78
    for (const ln of wrapLines(ctx, stripMd(deck.subtitle.trim()), textW, 2)) {
      ctx.fillText(ln, PAD, sy)
      sy += 58
    }
    y = sy - 58
  }

  // Branding line: presenter · org · date.
  const b = deck.branding
  const brand = [b?.presenter, b?.org, b?.date].map((v) => v?.trim()).filter(Boolean).join(' · ')
  if (brand) {
    ctx.font = `400 34px ${SANS}`
    ctx.fillStyle = rgba(mutedBase, 0.62)
    ctx.fillText(wrapLines(ctx, brand, textW, 1)[0] ?? '', PAD, y + 86)
  }

  // Bottom: white QR plate + call-to-scan copy.
  const box = 380
  const qy = H - PAD - box
  const { default: qrcode } = await import('qrcode-generator')
  const qr = qrcode(0, 'L')
  qr.addData(url, 'Byte')
  qr.make()
  roundRect(ctx, PAD, qy, box, box, 28)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  if (p.light) {
    // On light themes the white plate would melt into the backdrop.
    ctx.strokeStyle = 'rgba(0,0,0,0.14)'
    ctx.lineWidth = 2
    ctx.stroke()
  }
  drawQr(ctx, qr, PAD, qy, box)

  const tx = PAD + box + 52
  ctx.fillStyle = fg
  ctx.font = `700 48px ${SANS}`
  ctx.fillText(cjk ? '扫码立即观看' : 'Scan to watch', tx, qy + 118)
  ctx.font = `400 34px ${SANS}`
  ctx.fillStyle = rgba(mutedBase, 0.66)
  ctx.fillText(cjk ? '长按识别二维码' : 'Long-press the QR code', tx, qy + 182)
  ctx.fillText(cjk ? '一句话生成的课件' : 'Generated from one line', tx, qy + 300)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('canvas toBlob failed')
  return blob
}

/** Download filename for the card, mirroring the standalone-export rules. */
export function cardFilename(deck: Deck): string {
  const safe = (deck.title || 'deck').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 60) || 'deck'
  return `${safe}.png`
}
