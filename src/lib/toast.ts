export function toast(message: string, ms = 2400): void {
  const el = document.createElement('div')
  el.className = 'toast'
  el.textContent = message
  document.body.appendChild(el)
  window.setTimeout(() => {
    el.style.opacity = '0'
    el.style.transition = 'opacity 0.25s'
    window.setTimeout(() => el.remove(), 250)
  }, ms)
}
