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

// Links in slide text always open in a new tab: `target` is no longer an
// allowed attribute (model / share-link text can't pick a window name), and a
// same-tab link would navigate away from the running deck.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

function sanitize(dirty: string, tags: string[]): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: tags,
    // No `class`: untrusted text could otherwise attach any app / reveal.js
    // class (fragment, present, visually-hidden…) to its own markup.
    ALLOWED_ATTR: ['href', 'title', 'rel'],
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

/**
 * Inline Markdown → plain text, for places that render a title as TEXT
 * (chapter corner label, closing recap pills, presenter "up next", the
 * deck title): a bolded title used to show its literal `**` there.
 */
export function mdPlain(text: string | undefined): string {
  if (!text) return ''
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // [text](url) → text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/(^|[^\w*])[*_](\S(?:.*?\S)?)[*_](?![\w*])/g, '$1$2')
    .replace(/\*\*/g, '')
    .trim()
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
