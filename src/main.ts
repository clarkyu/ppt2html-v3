import './styles/app.css'
import { registerSW } from 'virtual:pwa-register'
import { parseRoute, type Route } from './router'
import { icons } from './lib/icons'
import { renderHome } from './ui/home'
import { renderLibrary } from './ui/library'
import { renderSettings } from './ui/settings'
import { renderViewer } from './ui/viewer'
import { renderDeckEditor } from './ui/editor'

registerSW({ immediate: true })

const app = document.getElementById('app')!
app.innerHTML = `
  <header class="appbar">
    <a class="brand" href="#/">
      <span class="brand__logo">${icons.play}</span>
      课件生成器
    </a>
    <nav class="nav">
      <a href="#/" data-nav="home">首页</a>
      <a href="#/library" data-nav="library">我的课件</a>
      <a href="#/settings" data-nav="settings">设置</a>
    </nav>
  </header>
  <main class="view" id="view"></main>
`

const view = document.getElementById('view')!
let cleanup: (() => void) | null = null

function mount(route: Route): void {
  cleanup?.()
  cleanup = null

  document.querySelectorAll<HTMLElement>('[data-nav]').forEach((a) => {
    a.classList.toggle('active', a.dataset.nav === route.name)
  })
  document.body.classList.toggle('playing', route.name === 'play')
  window.scrollTo(0, 0)

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
  }
}

const handle = () => mount(parseRoute(location.hash))
window.addEventListener('hashchange', handle)
handle()
