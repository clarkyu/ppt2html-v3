/** Small DOM helpers — enough to build views without a framework. */

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
