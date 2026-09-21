// Post-build guard: the precache-excluded parser chunks (pdfjs-*, mammoth-*)
// must never be reachable from the offline shell — neither modulepreloaded by
// index.html nor statically imported by any other chunk. When they are, the
// installed PWA boots to a blank page offline (and every cold visit downloads
// ~400 KB of pdf.js for nothing). Dynamic `import("./pdfjs-…")` is fine: that
// only fires when a user actually imports a PDF/Word file.
import { readdirSync, readFileSync } from 'node:fs'

const dir = 'dist/assets'
const files = readdirSync(dir)
const heavy = files.filter((f) => /^(pdfjs|mammoth)-.*\.js$/.test(f))
const html = readFileSync('dist/index.html', 'utf8')
const bad = []
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
for (const h of heavy) {
  if (html.includes(h)) bad.push(`dist/index.html references ${h}`)
  const staticImport = new RegExp(`(^|[;\\s])import[^;]*?from\\s*["']\\./${escapeRe(h)}["']|import\\s*["']\\./${escapeRe(h)}["']`)
  for (const f of files) {
    if (!f.endsWith('.js') || heavy.includes(f)) continue
    if (staticImport.test(readFileSync(`${dir}/${f}`, 'utf8'))) bad.push(`${f} statically imports ${h}`)
  }
}
if (bad.length) {
  console.error('check-chunks: precache-excluded chunks leaked into the offline shell:\n - ' + bad.join('\n - '))
  process.exit(1)
}
console.log(`check-chunks: ok — ${heavy.length} lazy parser chunk(s) stay out of the offline shell`)
