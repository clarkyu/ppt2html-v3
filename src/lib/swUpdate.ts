import { t } from '../i18n'

/**
 * Non-modal "new version ready" bar. The USER decides when to reload — the
 * old autoUpdate strategy hard-reloaded the tab within seconds of a deploy,
 * wiping the composer, an in-flight (already billed) generation, unsaved
 * editor changes and a live presentation. "Later" just hides the bar; the
 * waiting worker activates on the next full navigation anyway.
 */
export function showSwUpdateBanner(reload: () => void): () => void {
  document.querySelector('.sw-update')?.remove()
  const el = document.createElement('div')
  el.className = 'sw-update'
  el.setAttribute('role', 'status')
  el.innerHTML =
    `<span>${t('sw.updateReady')}</span>` +
    `<button class="btn btn--primary btn--sm" data-sw-reload>${t('sw.reload')}</button>` +
    `<button class="btn btn--sm" data-sw-later>${t('sw.later')}</button>`
  el.querySelector('[data-sw-reload]')!.addEventListener('click', reload)
  el.querySelector('[data-sw-later]')!.addEventListener('click', () => el.remove())
  document.body.appendChild(el)
  return () => el.remove()
}
