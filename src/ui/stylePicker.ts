// One-click restyle: a gallery of the seven theme "styles" (palette + display
// face), previewed as mini cover cards. Picking one re-skins the playing deck
// live — no regeneration, no reload.

import { THEMES, type ThemeName } from '../types'
import { t } from '../i18n'

/** Flat preview palette per theme (mirrors themes.css, like the PPTX export). */
const SWATCH: Record<ThemeName, { bg: string; fg: string; accent: string; accent2: string; serif: boolean }> = {
  aurora: { bg: '#0B1020', fg: '#E8ECFF', accent: '#8B7CFF', accent2: '#22D3EE', serif: false },
  ink: { bg: '#F4F6FC', fg: '#26304A', accent: '#3B5BDB', accent2: '#7048E8', serif: true },
  sunrise: { bg: '#160C1E', fg: '#FBEAE2', accent: '#FF7A5C', accent2: '#FFC247', serif: true },
  forest: { bg: '#06231F', fg: '#E4F2EC', accent: '#2DD4A7', accent2: '#A3E635', serif: false },
  noir: { bg: '#0A0A0B', fg: '#EDEDF0', accent: '#FBBF24', accent2: '#F59E0B', serif: false },
  sand: { bg: '#FAF5EC', fg: '#43382C', accent: '#C2683C', accent2: '#8A8B3D', serif: true },
  rose: { bg: '#1A0A1C', fg: '#FBE6F1', accent: '#FF5DA2', accent2: '#B06BFF', serif: false },
}

/**
 * Show the style gallery. `onPick` fires with the chosen theme; the overlay
 * closes itself. Returns a disposer that removes the overlay (route changes).
 */
export function openStylePicker(host: HTMLElement, current: ThemeName, onPick: (theme: ThemeName) => void): () => void {
  host.querySelector('.stylepick')?.remove()
  const wrap = document.createElement('div')
  wrap.className = 'stylepick'
  wrap.innerHTML = `
    <div class="stylepick__card">
      <h3>${t('style.title')}</h3>
      <p class="stylepick__hint">${t('style.hint')}</p>
      <div class="stylepick__grid">
        ${THEMES.map((th) => {
          const s = SWATCH[th]
          return `
          <button type="button" class="stylepick__item${th === current ? ' current' : ''}" data-theme="${th}"
                  style="background:${s.bg};color:${s.fg}${s.serif ? ';font-family:Georgia,\'Songti SC\',serif' : ''}">
            <span class="stylepick__aa" style="color:${s.fg}">Aa</span>
            <span class="stylepick__bar" style="background:${s.accent}"></span>
            <span class="stylepick__dots"><i style="background:${s.accent}"></i><i style="background:${s.accent2}"></i><i style="background:${s.fg}"></i></span>
            <span class="stylepick__name">${t(`theme.${th}`)}</span>
          </button>`
        }).join('')}
      </div>
      <button class="btn btn--sm" data-style-close>${t('common.cancel')}</button>
    </div>`
  host.appendChild(wrap)
  const close = (): void => wrap.remove()
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || (e.target as HTMLElement).closest('[data-style-close]')) {
      close()
      return
    }
    const item = (e.target as HTMLElement).closest<HTMLElement>('[data-theme]')
    if (!item) return
    close()
    onPick(item.dataset.theme as ThemeName)
  })
  return close
}
