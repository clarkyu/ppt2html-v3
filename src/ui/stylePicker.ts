// One-click restyle: a gallery of the seven built-in theme "styles" plus the
// user's own saved "我的风格" custom palettes. Picking one re-skins the playing
// deck live — no regeneration, no reload.

import { THEMES, type CustomTheme, type ThemeName } from '../types'
import { isLightCustom } from '../render/customTheme'
import { loadStyles, addStyle, removeStyle } from '../lib/styles'
import { icons } from '../lib/icons'
import { escapeHtml } from '../lib/markdown'
import { t } from '../i18n'

export type StyleSelection = { kind: 'builtin'; theme: ThemeName } | { kind: 'custom'; theme: CustomTheme }

/** Flat preview palette per built-in theme (mirrors themes.css). */
const SWATCH: Record<ThemeName, { bg: string; fg: string; accent: string; accent2: string; serif: boolean }> = {
  aurora: { bg: '#0B1020', fg: '#E8ECFF', accent: '#8B7CFF', accent2: '#22D3EE', serif: false },
  ink: { bg: '#F4F6FC', fg: '#26304A', accent: '#3B5BDB', accent2: '#7048E8', serif: true },
  sunrise: { bg: '#160C1E', fg: '#FBEAE2', accent: '#FF7A5C', accent2: '#FFC247', serif: true },
  forest: { bg: '#06231F', fg: '#E4F2EC', accent: '#2DD4A7', accent2: '#A3E635', serif: false },
  noir: { bg: '#0A0A0B', fg: '#EDEDF0', accent: '#FBBF24', accent2: '#F59E0B', serif: false },
  sand: { bg: '#FAF5EC', fg: '#43382C', accent: '#C2683C', accent2: '#8A8B3D', serif: true },
  rose: { bg: '#1A0A1C', fg: '#FBE6F1', accent: '#FF5DA2', accent2: '#B06BFF', serif: false },
}

interface Swatch {
  bg: string
  fg: string
  accent: string
  accent2: string
  serif: boolean
}

function customSwatch(ct: CustomTheme): Swatch {
  return { bg: ct.bg, fg: isLightCustom(ct) ? '#1a1a22' : '#ffffff', accent: ct.accent, accent2: ct.accent2, serif: ct.serif }
}

function cardInner(s: Swatch, label: string): string {
  // `label` may be a user-typed style name — escape it (stored self-XSS).
  return (
    `<span class="stylepick__aa" style="color:${s.fg}">Aa</span>` +
    `<span class="stylepick__bar" style="background:${s.accent}"></span>` +
    `<span class="stylepick__dots"><i style="background:${s.accent}"></i><i style="background:${s.accent2}"></i><i style="background:${s.fg}"></i></span>` +
    `<span class="stylepick__name">${escapeHtml(label)}</span>`
  )
}

function cardStyle(s: Swatch): string {
  return `background:${s.bg};color:${s.fg}${s.serif ? ';font-family:Georgia,\'Songti SC\',serif' : ''}`
}

/**
 * Show the style gallery. `onPick` fires with the chosen selection (built-in or
 * custom); the overlay closes itself. `current` highlights the active card.
 * Returns a disposer that removes the overlay (route changes).
 */
export function openStylePicker(
  host: HTMLElement,
  current: { theme: ThemeName; custom?: CustomTheme },
  onPick: (sel: StyleSelection) => void,
): () => void {
  host.querySelector('.stylepick')?.remove()
  const wrap = document.createElement('div')
  wrap.className = 'stylepick'

  const render = (): void => {
    const saved = loadStyles()
    wrap.innerHTML = `
      <div class="stylepick__card">
        <h3>${t('style.title')}</h3>
        <p class="stylepick__hint">${t('style.hint')}</p>
        <div class="stylepick__grid">
          ${THEMES.map((th) => {
            const on = !current.custom && th === current.theme
            return `<button type="button" class="stylepick__item${on ? ' current' : ''}" data-builtin="${th}" style="${cardStyle(SWATCH[th])}">${cardInner(SWATCH[th], t(`theme.${th}`))}</button>`
          }).join('')}
        </div>
        <h4 class="stylepick__sub">${t('style.mine')}</h4>
        <div class="stylepick__grid">
          ${saved
            .map((st) => {
              const sw = customSwatch(st.theme)
              return `<div class="stylepick__slot">
                <button type="button" class="stylepick__item" data-custom="${st.id}" style="${cardStyle(sw)}">${cardInner(sw, st.name)}</button>
                <button type="button" class="stylepick__del" data-del="${st.id}" title="${t('style.delete')}">${icons.trash}</button>
              </div>`
            })
            .join('')}
          <button type="button" class="stylepick__new" data-new>${icons.plus}<span>${t('style.new')}</span></button>
        </div>
        <button class="btn btn--sm" data-style-close>${t('common.cancel')}</button>
      </div>`
  }
  render()
  host.appendChild(wrap)
  const close = (): void => wrap.remove()

  const openForm = (): void => {
    const seed: CustomTheme = current.custom ?? { bg: '#0b1020', accent: '#8b7cff', accent2: '#22d3ee', serif: false }
    const card = wrap.querySelector<HTMLElement>('.stylepick__card')!
    card.innerHTML = `
      <h3>${t('style.newTitle')}</h3>
      <div class="styleform">
        <label class="styleform__row"><span>${t('style.name')}</span><input class="form-input" data-f-name value="${t('style.mine')}" maxlength="20"></label>
        <label class="styleform__row"><span>${t('style.bg')}</span><input type="color" data-f-bg value="${seed.bg}"></label>
        <label class="styleform__row"><span>${t('style.accent')}</span><input type="color" data-f-accent value="${seed.accent}"></label>
        <label class="styleform__row"><span>${t('style.accent2')}</span><input type="color" data-f-accent2 value="${seed.accent2}"></label>
        <label class="styleform__row styleform__row--check"><input type="checkbox" data-f-serif${seed.serif ? ' checked' : ''}><span>${t('style.serif')}</span></label>
      </div>
      <div class="stylepick__grid"><div class="stylepick__item" data-preview style="${cardStyle(customSwatch(seed))}">${cardInner(customSwatch(seed), t('style.preview'))}</div></div>
      <div class="stylepick__actions">
        <button class="btn btn--sm" data-form-cancel>${t('common.cancel')}</button>
        <button class="btn btn--primary btn--sm" data-form-save>${t('style.saveApply')}</button>
      </div>`

    const read = (): CustomTheme => ({
      bg: card.querySelector<HTMLInputElement>('[data-f-bg]')!.value,
      accent: card.querySelector<HTMLInputElement>('[data-f-accent]')!.value,
      accent2: card.querySelector<HTMLInputElement>('[data-f-accent2]')!.value,
      serif: card.querySelector<HTMLInputElement>('[data-f-serif]')!.checked,
    })
    const preview = card.querySelector<HTMLElement>('[data-preview]')!
    const repaint = (): void => {
      const sw = customSwatch(read())
      preview.setAttribute('style', cardStyle(sw))
      preview.innerHTML = cardInner(sw, t('style.preview'))
    }
    card.querySelectorAll('input').forEach((el) => el.addEventListener('input', repaint))
    card.querySelector('[data-form-cancel]')!.addEventListener('click', () => {
      render()
    })
    card.querySelector('[data-form-save]')!.addEventListener('click', () => {
      const ct = read()
      const name = card.querySelector<HTMLInputElement>('[data-f-name]')!.value
      addStyle(name, ct)
      close()
      onPick({ kind: 'custom', theme: ct })
    })
  }

  wrap.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (target === wrap || target.closest('[data-style-close]')) {
      close()
      return
    }
    const del = target.closest<HTMLElement>('[data-del]')
    if (del) {
      removeStyle(del.dataset.del!)
      render()
      return
    }
    if (target.closest('[data-new]')) {
      openForm()
      return
    }
    const builtin = target.closest<HTMLElement>('[data-builtin]')
    if (builtin) {
      close()
      onPick({ kind: 'builtin', theme: builtin.dataset.builtin as ThemeName })
      return
    }
    const custom = target.closest<HTMLElement>('[data-custom]')
    if (custom) {
      const st = loadStyles().find((s) => s.id === custom.dataset.custom)
      if (st) {
        close()
        onPick({ kind: 'custom', theme: st.theme })
      }
    }
  })
  return close
}
