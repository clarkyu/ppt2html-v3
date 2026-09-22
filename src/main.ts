import './styles/app.css'
import { registerSW } from 'virtual:pwa-register'
import { parseRoute, canLeave, setLeaveGuard, setLangHandler, getLangHandler, type Route } from './router'
import { icons } from './lib/icons'
import { escapeHtml } from './lib/markdown'
import { showSwUpdateBanner } from './lib/swUpdate'
import { disposeAllOverlays } from './lib/overlay'
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
  // Tab title, description and app-bar text all follow the UI language (the
  // tab used to stay Chinese after switching to English).
  document.title = t('app.title')
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('app.description'))
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
  // Wizard / generation overlays belong to the screen that opened them: a
  // hash change or the back button closes them (aborting their requests)
  // instead of mounting the next screen underneath.
  disposeAllOverlays()
  cleanup?.()
  cleanup = null
  // A screen's guard/handler never outlives it.
  setLeaveGuard(null)
  setLangHandler(null)
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
let currentHash = location.hash
let reverting = false
const handle = () => {
  if (reverting) {
    // The hashchange fired by our own revert below — the screen stays as is.
    reverting = false
    return
  }
  const next = location.hash
  if (next !== currentHash && !canLeave()) {
    reverting = true
    location.hash = currentHash
    return
  }
  currentHash = next
  mount(parseRoute(next))
}
window.addEventListener('hashchange', handle)
// A language switch re-renders the current screen (and the app bar). A screen
// that registered an in-place handler keeps its state (an edited deck); the
// rest are remounted.
window.addEventListener('langchange', () => {
  const inPlace = getLangHandler()
  if (inPlace && current) {
    renderAppbar(current)
    inPlace()
  } else {
    mount(current ?? parseRoute(location.hash))
  }
})
handle()
