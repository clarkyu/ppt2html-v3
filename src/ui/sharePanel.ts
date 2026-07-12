// Share overlay: the deck packed into a link (no backend — see lib/share.ts),
// with copy-to-clipboard, a share-card image (cover art + QR, made for mobile
// messengers where images travel farther than bare links), the system share
// sheet where available, and a plain QR as fallback when the card can't build.

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
      <div class="sharepanel__qr" data-share-visual></div>
      <div class="sharepanel__actions" data-share-actions hidden>
        <button class="btn btn--primary btn--sm" data-share-system hidden>${t('share.systemShare')}</button>
        <button class="btn btn--sm" data-share-saveimg hidden>${t('share.saveImage')}</button>
      </div>
      <button class="btn btn--sm" data-share-close>${t('common.gotIt')}</button>
    </div>`
  host.appendChild(wrap)
  let cardObjUrl = ''
  const close = (): void => {
    if (cardObjUrl) URL.revokeObjectURL(cardObjUrl)
    wrap.remove()
  }
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || (e.target as HTMLElement).closest('[data-share-close]')) close()
  })

  const urlEl = wrap.querySelector<HTMLInputElement>('[data-share-url]')!
  const copyBtn = wrap.querySelector<HTMLButtonElement>('[data-share-copy]')!
  const visualEl = wrap.querySelector<HTMLElement>('[data-share-visual]')!
  const actionsEl = wrap.querySelector<HTMLElement>('[data-share-actions]')!
  const systemBtn = wrap.querySelector<HTMLButtonElement>('[data-share-system]')!
  const saveImgBtn = wrap.querySelector<HTMLButtonElement>('[data-share-saveimg]')!

  // Plain SVG QR — fallback when the card image can't be drawn.
  const renderBareQr = async (url: string): Promise<void> => {
    const { default: qrcode } = await import('qrcode-generator')
    const qr = qrcode(0, 'L')
    qr.addData(url, 'Byte')
    qr.make()
    visualEl.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true })
  }

  // System share sheet: prefer the card image (QR rides inside it); URL-only
  // when files can't be shared. A cancelled sheet rejects with AbortError —
  // that's not an error.
  const wireSystemShare = (url: string, cardBlob: Blob | null, filename: string): void => {
    if (typeof navigator.share !== 'function') return
    systemBtn.hidden = false
    actionsEl.hidden = false
    systemBtn.addEventListener('click', () => {
      const payload: ShareData = { title: deck.title, text: deck.title, url }
      if (cardBlob) {
        const file = new File([cardBlob], filename, { type: 'image/png' })
        if (navigator.canShare?.({ files: [file] })) payload.files = [file]
      }
      navigator.share(payload).catch((err: unknown) => {
        if ((err as DOMException)?.name !== 'AbortError') toast(t('share.failed'))
      })
    })
  }

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
        let cardBlob: Blob | null = null
        let filename = 'deck.png'
        try {
          const { buildShareCard, cardFilename } = await import('../lib/shareCard')
          cardBlob = await buildShareCard(deck, url)
          filename = cardFilename(deck)
          cardObjUrl = URL.createObjectURL(cardBlob)
          visualEl.innerHTML = `
            <div class="sharepanel__cardwrap">
              <img class="sharepanel__cardimg" alt="${t('share.cardAlt')}" src="${cardObjUrl}">
            </div>
            <p class="sharepanel__noqr">${t('share.cardHint')}</p>`
          saveImgBtn.hidden = false
          actionsEl.hidden = false
          saveImgBtn.addEventListener('click', () => {
            const a = document.createElement('a')
            a.href = cardObjUrl
            a.download = filename
            a.click()
          })
        } catch {
          // Card drawing failed (odd canvas environment) — plain QR still works.
          await renderBareQr(url).catch(() => {})
        }
        wireSystemShare(url, cardBlob, filename)
      } else {
        visualEl.innerHTML = `<p class="sharepanel__noqr">${t('share.tooBigForQr')}</p>`
        wireSystemShare(url, null, '')
      }
    })
    .catch(() => {
      close()
      toast(t('share.failed'))
    })
  return close
}
