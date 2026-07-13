import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages project site is served from /<repo>/.
// Dev server runs at root. Hash-based routing keeps deep links working on both.
const REPO_BASE = '/ppt2html-v3/'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? REPO_BASE : '/',
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // Heavy, rarely-used parsers get stable chunk names so the PWA
          // precache can exclude them (they lazy-load online when needed).
          if (id.includes('pdfjs-dist')) return 'pdfjs'
          if (id.includes('mammoth')) return 'mammoth'
          return undefined
        },
      },
    },
    sourcemap: false,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
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
