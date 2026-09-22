/** Small DOM helpers — enough to build views without a framework. */

import { toast } from './toast'
import { t } from '../i18n'

/**
 * Remove a list row with an undo: the toast's 撤销 puts the very same element
 * back where it was (a mis-tap on 删除 used to drop an outline row and its
 * AI-written brief for good). `after` re-numbers / re-totals the list and runs
 * on both the removal and the restore.
 */
export function removeWithUndo(row: HTMLElement, message: string, after: () => void): void {
  const parent = row.parentElement
  if (!parent) return
  const next = row.nextElementSibling
  row.remove()
  after()
  toast(message, {
    action: {
      label: t('common.undo'),
      onClick: () => {
        if (!parent.isConnected) return
        parent.insertBefore(row, next && next.parentElement === parent ? next : null)
        after()
      },
    },
  })
}

export function $<T extends HTMLElement = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T | null {
  return root.querySelector<T>(selector)
}

export function $all<T extends HTMLElement = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T[] {
  return Array.from(root.querySelectorAll<T>(selector))
}

/** A short unique id for decks and DOM elements. */
export function genId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'id-' + Math.abs(hashString(String(performance.now()) + navigator.userAgent)).toString(36)
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}

/** Format a timestamp as a friendly zh-CN date. */
export function formatDate(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Delegate a click handler on elements carrying `data-action="name"`.
 * Returns a cleanup function.
 */
export function onAction(
  root: HTMLElement,
  handler: (action: string, el: HTMLElement, ev: MouseEvent) => void,
): () => void {
  const listener = (ev: Event) => {
    const target = (ev.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]')
    if (target && root.contains(target)) {
      handler(target.dataset.action!, target, ev as MouseEvent)
    }
  }
  root.addEventListener('click', listener)
  return () => root.removeEventListener('click', listener)
}
