import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages project site is served from /<repo>/.
// Dev server runs at root. Hash-based routing keeps deep links working on both.
const REPO_BASE = '/ppt2html-v3/'

export default defineConfig(({ command, isPreview }) => ({
  // `vite preview` serves the built dist, so it needs the build's base too —
  // with '/' every asset URL fell through to the SPA fallback and the preview
  // (the only way to exercise the service worker locally) was a blank page.
  base: command === 'build' || isPreview ? REPO_BASE : '/',
  build: {
    target: 'es2022',
    rolldownOptions: {
      output: {
        // Heavy, rarely-used parsers get stable chunk names so the PWA precache
        // can exclude them (they lazy-load online when needed). The group test
        // is restricted to the packages themselves and dependencies are NOT
        // pulled in recursively: the old manualChunks compat hoisted a module
        // shared with the entry into the pdfjs chunk, so index.html
        // modulepreloaded a precache-excluded file and the app booted to a
        // blank page offline. scripts/check-chunks.mjs guards this after build.
        advancedChunks: {
          includeDependenciesRecursively: false,
          groups: [
            { name: 'pdfjs', test: /node_modules[\\/]pdfjs-dist[\\/]/ },
            { name: 'mammoth', test: /node_modules[\\/]mammoth[\\/]/ },
          ],
        },
      },
    },
    sourcemap: false,
  },
  plugins: [
    VitePWA({
      // 'prompt': a new build waits until the user taps "reload" — autoUpdate
      // hard-reloaded the tab within seconds of a deploy, wiping the composer,
      // in-flight generation, unsaved edits and live presentations.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: '课件生成器 · 一句话变精美 PPT',
        short_name: '课件生成器',
        description: '输入一句话，AI 生成精美 HTML 课件，浏览器里像 PPT 一样播放。',
        lang: 'zh-CN',
        dir: 'ltr',
        theme_color: '#6d5efc',
        background_color: '#0b1020',
        display: 'standalone',
        orientation: 'any',
        categories: ['education', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // pdf.js/mammoth are megabyte-class and only needed for file import —
        // keep them out of the offline shell (they fetch on demand online).
        globIgnores: ['**/pdfjs-*.js', '**/mammoth-*.js', '**/pdf.worker*'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
}))
