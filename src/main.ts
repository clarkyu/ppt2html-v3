import './styles/app.css'
import { registerSW } from 'virtual:pwa-register'
import { parseRoute, type Route } from './router'
import { icons } from './lib/icons'
import { escapeHtml } from './lib/markdown'
import { showSwUpdateBanner } from './lib/swUpdate'
import { renderHome } from './ui/home'
import { renderLibrary } from './ui/library'
import { renderSettings } from './ui/settings'
import { renderViewer } from './ui/viewer'
import { renderDeckEditor } from './ui/editor'
import { renderTemplates } from './ui/templates'
import { t, getLang, toggleLang } from './i18n'

// A new build waits for the user's go-ahead (registerType 'prompt' in
// vite.config.ts) instead of hard-reloading whatever they were in the middle of.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    showSwUpdateBanner(() => void updateSW(true))
  },
})

const app = document.getElementById('app')!
app.innerHTML = `<header class="appbar" id="appbar"></header><main class="view" id="view"></main>`

const appbar = document.getElementById('appbar')!

function renderAppbar(route?: Route): void {
  appbar.innerHTML = `
    <a class="brand" href="#/">
      <span class="brand__logo">${icons.play}</span>
      ${t('app.name')}
    </a>
    <nav class="nav">
      <a href="#/" data-nav="home">${t('nav.home')}</a>
      <a href="#/library" data-nav="library">${t('nav.library')}</a>
      <a href="#/settings" data-nav="settings">${t('nav.settings')}</a>
      <button class="lang-toggle" data-lang title="${t('lang.toggleTitle')}">${t('lang.toggle')}</button>
    </nav>`
  appbar.querySelector('[data-lang]')!.addEventListener('click', () => toggleLang())
  const name = route?.name
  appbar.querySelectorAll<HTMLElement>('[data-nav]').forEach((a) => {
    a.classList.toggle('active', a.dataset.nav === name)
  })
}

document.documentElement.lang = getLang() === 'zh' ? 'zh-CN' : 'en'

const view = document.getElementById('view')!
let cleanup: (() => void) | null = null
let current: Route | null = null

function mount(route: Route): void {
  cleanup?.()
  cleanup = null
  current = route

  renderAppbar(route)
  document.body.classList.toggle('playing', route.name === 'play' || route.name === 'share')
  window.scrollTo(0, 0)

  try {
    switch (route.name) {
      case 'home':
        cleanup = renderHome(view)
        break
      case 'library':
        cleanup = renderLibrary(view)
        break
      case 'settings':
        cleanup = renderSettings(view)
        break
      case 'play':
        cleanup = renderViewer(view, route.id)
        break
      case 'edit':
        cleanup = renderDeckEditor(view, route.id)
        break
      case 'share':
        cleanup = renderViewer(view, 'shared', route.data)
        break
      case 'templates':
        cleanup = renderTemplates(view)
        break
    }
  } catch (err) {
    // A screen that throws while rendering must not leave the shell blank and
    // dead: keep the app bar (navigation still works) and say what happened.
    console.error(err)
    document.body.classList.remove('playing')
    view.innerHTML = `
      <div class="empty">
        <h3>${t('err.viewCrashed')}</h3>
        <p>${escapeHtml(err instanceof Error ? err.message : String(err))}</p>
        <a class="btn btn--primary" href="#/">${t('nav.home')}</a>
      </div>`
  }
}

// Listeners first, then the initial mount: a route that throws during the
// first mount used to abort this module before `hashchange` was wired, so no
// later navigation could recover the page.
const handle = () => mount(parseRoute(location.hash))
window.addEventListener('hashchange', handle)
// A language switch re-renders the current screen (and the app bar) in place.
window.addEventListener('langchange', () => mount(current ?? parseRoute(location.hash)))
handle()
