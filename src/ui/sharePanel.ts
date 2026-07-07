// Share overlay: the deck packed into a link (no backend — see lib/share.ts),
// with copy-to-clipboard and a QR code when the payload fits one.

import type { Deck } from '../types'
import { shareUrl, shareSupported, QR_MAX_CHARS } from '../lib/share'
import { t } from '../i18n'
import { toast } from '../lib/toast'

export function openSharePanel(host: HTMLElement, deck: Deck): () => void {
  host.querySelector('.sharepanel')?.remove()
  if (!shareSupported()) {
    toast(t('share.unsupported'))
    return () => {}
  }
  const wrap = document.createElement('div')
  wrap.className = 'sharepanel'
  wrap.innerHTML = `
    <div class="sharepanel__card">
      <h3>${t('share.title')}</h3>
      <p class="sharepanel__hint">${t('share.hint')}</p>
      <div class="sharepanel__row">
        <input class="form-input" data-share-url readonly value="${t('share.building')}">
        <button class="btn btn--primary btn--sm" data-share-copy disabled>${t('share.copy')}</button>
      </div>
      <div class="sharepanel__qr" data-share-qr></div>
      <button class="btn btn--sm" data-share-close>${t('common.gotIt')}</button>
    </div>`
  host.appendChild(wrap)
  const close = (): void => wrap.remove()
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || (e.target as HTMLElement).closest('[data-share-close]')) close()
  })

  const urlEl = wrap.querySelector<HTMLInputElement>('[data-share-url]')!
  const copyBtn = wrap.querySelector<HTMLButtonElement>('[data-share-copy]')!
  const qrEl = wrap.querySelector<HTMLElement>('[data-share-qr]')!

  void shareUrl(deck)
    .then(async (url) => {
      urlEl.value = url
      copyBtn.disabled = false
      copyBtn.addEventListener('click', () => {
        navigator.clipboard
          ?.writeText(url)
          .then(() => toast(t('share.copied')))
          .catch(() => {
            urlEl.select()
            document.execCommand('copy')
            toast(t('share.copied'))
          })
      })
      urlEl.addEventListener('click', () => urlEl.select())
      // QR byte-mode tops out near 3KB — bigger decks keep the link, lose the QR.
      if (url.length <= QR_MAX_CHARS) {
        const { default: qrcode } = await import('qrcode-generator')
        const qr = qrcode(0, 'L')
        qr.addData(url, 'Byte')
        qr.make()
        qrEl.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true })
      } else {
        qrEl.innerHTML = `<p class="sharepanel__noqr">${t('share.tooBigForQr')}</p>`
      }
    })
    .catch(() => {
      close()
      toast(t('share.failed'))
    })
  return close
}
