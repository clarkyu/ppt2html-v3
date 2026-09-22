// Modal overlay shell shared by the wizard steps and the generation walls.
// One place for what every overlay used to skip: role=dialog + aria-modal,
// focus moved in / trapped / restored, Escape routed to the screen's own
// cancel, the app shell made inert underneath, and a registry that main.ts
// drains on every route mount — a hash change or the back button used to
// mount the next screen UNDER a still-running wizard, requests and all.

export interface Overlay {
  el: HTMLElement
  /** What Escape does; defaults to the overlay's close. Reassign per step. */
  escape: (() => void) | null
  /** Remove + unregister + hand focus back. Idempotent. */
  dispose: () => void
}

const open = new Map<HTMLElement, { onClose: () => void }>()
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Is any modal overlay up? Entry points use it to refuse a second wizard. */
export function overlayOpen(): boolean {
  return open.size > 0
}

/**
 * Append a modal overlay holding `cardHtml`. `onClose` is the SCREEN's close
 * (abort its requests, then `dispose()`); the registry calls it on route
 * changes, Escape calls `escape` (or it).
 */
export function openOverlay(cardHtml: string, onClose: () => void): Overlay {
  const el = document.createElement('div')
  el.className = 'overlay'
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-modal', 'true')
  el.tabIndex = -1
  el.innerHTML = cardHtml
  const restoreTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
  document.body.appendChild(el)
  document.getElementById('app')?.setAttribute('inert', '')
  open.set(el, { onClose })

  const ov: Overlay = { el, escape: null, dispose }
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      ;(ov.escape ?? onClose)()
    } else if (e.key === 'Tab') {
      trapTab(el, e)
    }
  })
  // Focus lands on the dialog itself: announced by AT, and no button is
  // pre-armed for the key that opened it (Enter auto-repeat on the launcher
  // used to fire straight into the new wizard).
  el.focus()

  let disposed = false
  function dispose(): void {
    if (disposed) return
    disposed = true
    open.delete(el)
    el.remove()
    if (open.size) {
      ;[...open.keys()].pop()?.focus()
    } else {
      document.getElementById('app')?.removeAttribute('inert')
      if (restoreTo?.isConnected) restoreTo.focus()
    }
  }
  return ov
}

let labelSeq = 0

/**
 * Make an already-built panel (share / style / AI panels / rehearse recap /
 * help card / the library's import choice) behave as a modal dialog: role +
 * aria-modal + aria-labelledby (its heading), focus moved to the first
 * control, Tab trapped inside, Escape → `onClose` (captured on window, so
 * reveal underneath never sees it — it used to flip into overview), and focus
 * handed back to the invoker on release. Call the returned release from the
 * panel's own close.
 */
export function dialogize(el: HTMLElement, onClose: () => void): () => void {
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-modal', 'true')
  const heading = el.querySelector<HTMLElement>('h1, h2, h3')
  if (heading) {
    if (!heading.id) heading.id = `dlg-title-${++labelSeq}`
    el.setAttribute('aria-labelledby', heading.id)
  }
  if (!el.hasAttribute('tabindex')) el.tabIndex = -1
  const restoreTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const onKey = (e: KeyboardEvent): void => {
    if (!el.isConnected) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    } else if (e.key === 'Tab' && el.contains(document.activeElement)) {
      trapTab(el, e)
    }
  }
  window.addEventListener('keydown', onKey, true)
  // Deferred: callers keep filling the card after appending it.
  requestAnimationFrame(() => {
    if (!el.isConnected || el.contains(document.activeElement)) return
    ;(el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus()
  })
  let released = false
  return () => {
    if (released) return
    released = true
    window.removeEventListener('keydown', onKey, true)
    const active = document.activeElement
    if (restoreTo?.isConnected && (active === document.body || active === null || el.contains(active))) restoreTo.focus()
  }
}

function trapTab(el: HTMLElement, e: KeyboardEvent): void {
  const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null)
  if (!items.length) {
    e.preventDefault()
    return
  }
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement
  if (e.shiftKey) {
    if (active === first || active === el) {
      e.preventDefault()
      last.focus()
    }
  } else if (active === last || active === el) {
    e.preventDefault()
    first.focus()
  }
}

/** Route change: every open overlay goes through its own close (which aborts
 * its requests and disposes); anything that forgot is removed regardless. */
export function disposeAllOverlays(): void {
  for (const [, entry] of [...open]) entry.onClose()
  for (const [el] of [...open]) {
    el.remove()
    open.delete(el)
  }
  document.getElementById('app')?.removeAttribute('inert')
}
