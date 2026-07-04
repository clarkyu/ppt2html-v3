import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Slide text may contain light Markdown (bold, italics, code, links).
// We render it and sanitize the result — the model output is untrusted.
marked.setOptions({ gfm: true, breaks: true })

const INLINE_TAGS = [
  'b', 'strong', 'i', 'em', 'u', 'code', 'a', 'br', 'span',
  'mark', 'del', 's', 'sup', 'sub', 'kbd',
]

const PROSE_TAGS = [
  ...INLINE_TAGS,
  'p', 'ul', 'ol', 'li', 'blockquote', 'h3', 'h4', 'hr', 'pre',
]

function sanitize(dirty: string, tags: string[]): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: tags,
    ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'class'],
  })
}

/** Render inline Markdown (no block elements) and sanitize. */
export function mdInline(text: string | undefined): string {
  if (!text) return ''
  const raw = marked.parseInline(text) as string
  return sanitize(raw, INLINE_TAGS)
}

/** Render block-level Markdown (paragraphs, lists) and sanitize. */
export function mdProse(text: string | undefined): string {
  if (!text) return ''
  const raw = marked.parse(text) as string
  return sanitize(raw, PROSE_TAGS)
}

/** Escape a string for safe insertion as HTML text. */
export function escapeHtml(text: string | undefined): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
