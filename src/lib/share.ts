// No-backend deck sharing: the whole deck rides inside the URL fragment
// (deflate-compressed, base64url). Nothing is uploaded anywhere — the fragment
// never even reaches a server — and the receiver needs only the static site.
//
// Data-URL backgrounds (generated SVGs / AI illustrations) are stripped before
// encoding: they'd blow the URL up by orders of magnitude, and the receiving
// side regenerates or re-searches backgrounds automatically from `imageQuery`
// via the existing lazy image fill. http(s) photo URLs are small and kept.

import type { Deck } from '../types'
import { sanitizeCustomTheme } from '../render/customTheme'

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

export function shareSupported(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'
}

/** The deck, minus what must not travel (ids, timestamps, bulky data URLs). */
function portable(deck: Deck): Record<string, unknown> {
  return {
    title: deck.title,
    subtitle: deck.subtitle,
    theme: deck.theme,
    customTheme: deck.customTheme,
    prompt: deck.prompt,
    branding: deck.branding,
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
  const bytes = await pipe(fromBase64Url(data), new DecompressionStream('deflate-raw'))
  const spec = JSON.parse(new TextDecoder().decode(bytes)) as Partial<Deck>
  if (!spec || !Array.isArray(spec.slides) || !spec.slides.length) throw new Error('bad share payload')
  const now = Date.now()
  return {
    id: 'shared',
    title: spec.title || 'Untitled',
    subtitle: spec.subtitle,
    theme: (spec.theme as Deck['theme']) || 'aurora',
    // Untrusted (attacker-controllable) payload — validate before it reaches
    // rendering, or a malformed palette would crash the deck / poison a copy.
    customTheme: sanitizeCustomTheme(spec.customTheme),
    slides: spec.slides,
    prompt: spec.prompt || '',
    branding: spec.branding,
    createdAt: now,
    updatedAt: now,
  }
}

/** Full share URL for the current origin/path. */
export async function shareUrl(deck: Deck): Promise<string> {
  const data = await encodeDeckToHash(deck)
  return `${location.origin}${location.pathname}#/s/${data}`
}

/** QR byte-mode capacity at version 40-L — links beyond this get no QR code. */
export const QR_MAX_CHARS = 2900
