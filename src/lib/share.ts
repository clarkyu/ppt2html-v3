// No-backend deck sharing: the whole deck rides inside the URL fragment
// (deflate-compressed, base64url). Nothing is uploaded anywhere — the fragment
// never even reaches a server — and the receiver needs only the static site.
//
// Data-URL backgrounds (generated SVGs / AI illustrations) are stripped before
// encoding: they'd blow the URL up by orders of magnitude, and the receiving
// side regenerates or re-searches backgrounds automatically from `imageQuery`
// via the existing lazy image fill. http(s) photo URLs are small and kept.

import type { Deck } from '../types'
import { sanitizeDeck } from '../render/normalize'

/** A data: logo above this many chars is dropped from share payloads — a 300 KB
 * uploaded logo would otherwise turn the link into a 400K-char URL. Typical
 * logos (20–150 KB → up to ~200K chars base64) still travel; the QR code has
 * its own, much tighter, gate (QR_MAX_CHARS). */
const SHARE_LOGO_MAX_CHARS = 200_000
/** Reject absurd fragments before touching them, and bound the INFLATED size:
 * deflate packs 100k identical slides into a ~20K-char link that would freeze
 * the receiver's tab for minutes. */
const SHARE_MAX_HASH_CHARS = 400_000
const SHARE_MAX_INFLATED_BYTES = 4_000_000

const B64 = { '+': '-', '/': '_', '=': '' } as const

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin).replace(/[+/=]/g, (c) => B64[c as keyof typeof B64])
}

function fromBase64Url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream))
  return new Uint8Array(await out.arrayBuffer())
}

/** Inflate with a byte budget: stop (and throw) as soon as the output exceeds
 * `max`, instead of materializing a decompression bomb first. */
async function inflateBounded(bytes: Uint8Array, max: number): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel()
      throw new Error('bad share payload')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.byteLength
  }
  return out
}

export function shareSupported(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'
}

/** The deck, minus what must not travel (ids, timestamps, bulky data URLs).
 * NOTE: this is an ALLOWLIST — `deck.material` (the user's pasted source
 * material) is deliberately absent and must never be added here. */
function portable(deck: Deck): Record<string, unknown> {
  const logo = deck.branding?.logo
  const branding =
    logo && logo.startsWith('data:') && logo.length > SHARE_LOGO_MAX_CHARS
      ? { ...deck.branding, logo: undefined }
      : deck.branding
  return {
    title: deck.title,
    subtitle: deck.subtitle,
    theme: deck.theme,
    customTheme: deck.customTheme,
    prompt: deck.prompt,
    branding,
    slides: deck.slides.map((s) => {
      const { bg, ...rest } = s
      return bg && !bg.url.startsWith('data:') ? { ...rest, bg } : rest
    }),
  }
}

export async function encodeDeckToHash(deck: Deck): Promise<string> {
  const json = JSON.stringify(portable(deck))
  const packed = await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw'))
  return toBase64Url(packed)
}

export async function decodeDeckFromHash(data: string): Promise<Deck> {
  if (data.length > SHARE_MAX_HASH_CHARS) throw new Error('bad share payload')
  const bytes = await inflateBounded(fromBase64Url(data), SHARE_MAX_INFLATED_BYTES)
  const spec: unknown = JSON.parse(new TextDecoder().decode(bytes))
  // Untrusted (attacker-controllable) payload: EVERYTHING goes through the
  // deck sanitizer before it can reach an attribute/innerHTML sink or be saved
  // as a copy — an unvalidated `layout`/`theme`/`tone` string was a stored XSS.
  // `material` is never accepted from a link (local-only contract).
  const deck = sanitizeDeck(spec, { id: 'shared', allowMaterial: false, now: Date.now() })
  if (!deck) throw new Error('bad share payload')
  return deck
}

/** Full share URL for the current origin/path. */
export async function shareUrl(deck: Deck): Promise<string> {
  const data = await encodeDeckToHash(deck)
  return `${location.origin}${location.pathname}#/s/${data}`
}

/** QR byte-mode capacity at version 40-L — links beyond this get no QR code. */
export const QR_MAX_CHARS = 2900
