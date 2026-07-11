// Template gallery: scenario skeletons (training / report / launch / lesson /
// retro / pitch) rendered as live cover thumbnails. Picking one instantiates a
// fresh deck from the template's DeckSpec and drops the user in the editor —
// structure and speaking guidance included, content theirs to fill.

import { TEMPLATES, instantiateTemplate } from '../templates'
import { mountThumb } from '../render/preview'
import { saveDeck } from '../store/db'
import { navigate } from '../router'
import { escapeHtml } from '../lib/markdown'
import { toast } from '../lib/toast'
import { icons } from '../lib/icons'
import { getLang, t } from '../i18n'

export function renderTemplates(view: HTMLElement): () => void {
  const cleanups: Array<() => void> = []
  const lang = getLang()

  view.innerHTML = `
    <div class="section-head">
      <h2>${t('tpl.title')}</h2>
      <a href="#/">${t('common.back')}</a>
    </div>
    <p class="tpl-sub">${t('tpl.subtitle')}</p>
    <div class="deck-grid" data-grid></div>`

  const grid = view.querySelector<HTMLElement>('[data-grid]')!

  for (const tpl of TEMPLATES) {
    const name = tpl.name[lang]
    const card = document.createElement('div')
    card.className = 'deck-card tpl-card'
    card.innerHTML = `
      <div class="thumb"></div>
      <div class="deck-card__body">
        <div class="deck-card__title">${escapeHtml(name)}</div>
        <div class="tpl-card__desc">${escapeHtml(tpl.desc[lang])}</div>
        <div class="deck-card__meta">
          <span>${tpl.spec.slides?.length ?? 0} ${t('unit.pages')}</span>
          <button class="btn btn--primary btn--sm" data-use>${icons.plus} ${t('tpl.use')}</button>
        </div>
      </div>`
    // Preview the template's cover with a throwaway normalized deck.
    cleanups.push(mountThumb(card.querySelector<HTMLElement>('.thumb')!, instantiateTemplate(tpl, 'tpl-preview')))
    card.querySelector('[data-use]')!.addEventListener('click', () => {
      const deck = instantiateTemplate(tpl)
      void saveDeck(deck).then(() => {
        toast(t('tpl.created').replace('{name}', name))
        navigate(`#/edit/${deck.id}`)
      })
    })
    grid.appendChild(card)
  }

  return () => cleanups.forEach((fn) => fn())
}
