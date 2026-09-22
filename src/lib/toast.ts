// Transient notices. All toasts live in one fixed container so consecutive
// ones stack instead of painting over each other (export-start + export-done
// used to land on the same pixels). A toast may carry one action button —
// the "undo" for a row deletion, for instance.

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastOptions {
  /** Visible time in ms (default 2400; an action extends it to 6000). */
  ms?: number
  action?: ToastAction
}

function container(): HTMLElement {
  let el = document.querySelector<HTMLElement>('.toasts')
  if (!el) {
    el = document.createElement('div')
    el.className = 'toasts'
    // The one live region in the app (the whole #app used to be aria-live,
    // which read every route's markup and the player clock every second
    // while these notices stayed silent).
    el.setAttribute('role', 'status')
    el.setAttribute('aria-live', 'polite')
    document.body.appendChild(el)
  }
  return el
}

export function toast(message: string, opts: number | ToastOptions = {}): void {
  const o: ToastOptions = typeof opts === 'number' ? { ms: opts } : opts
  const ms = o.ms ?? (o.action ? 6000 : 2400)
  const el = document.createElement('div')
  el.className = 'toast'
  const text = document.createElement('span')
  text.textContent = message
  el.appendChild(text)
  let gone = false
  const remove = (): void => {
    if (gone) return
    gone = true
    el.style.opacity = '0'
    el.style.transition = 'opacity 0.25s'
    window.setTimeout(() => el.remove(), 250)
  }
  if (o.action) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'toast__action'
    btn.textContent = o.action.label
    btn.addEventListener('click', () => {
      remove()
      o.action!.onClick()
    })
    el.appendChild(btn)
  }
  container().appendChild(el)
  window.setTimeout(remove, ms)
}
