// Dictionary hygiene: every `t('key')` / `tn('key', …)` literal in src must
// exist in src/i18n.ts, and every dictionary entry must be reachable — as a
// quoted literal somewhere in src (direct calls, key tables like SORTS /
// LAYOUT_KEYS, the `.one` plural variants) or under a dynamic prefix built
// with a template literal (`t(\`theme.${name}\`)`). t() silently echoes a
// missing key, so nothing else ever noticed a typo or a dead entry.
//
//   npm run i18n:check       (exit 1 on any missing or unused key)

import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const dictSrc = fs.readFileSync(path.join(root, 'src/i18n.ts'), 'utf8')
const dictStart = dictSrc.indexOf('const DICT')
const dictBody = dictSrc.slice(dictStart)
const keys = new Set([...dictBody.matchAll(/^\s+'([\w.-]+)':\s*\{/gm)].map((m) => m[1]))

const files = []
const walk = (dir) => {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p)
    else if (/\.(ts|js|mjs)$/.test(ent.name) && !p.endsWith('src/i18n.ts')) files.push(p)
  }
}
walk(path.join(root, 'src'))

const literals = new Set()
const prefixes = new Set()
const used = new Map() // key literal passed to t()/tn() → file
const scan = (src, f) => {
  // `t('a.b.' + x)` is a prefix, not a key.
  for (const m of src.matchAll(/\bt[n]?\(\s*'([\w.-]+)'\s*\+/g)) prefixes.add(m[1])
  for (const m of src.matchAll(/\bt[n]?\(\s*'([\w.-]+)'(?!\s*\+)/g)) used.set(m[1], f)
  for (const m of src.matchAll(/'([a-z][\w-]*(?:\.[\w-]+)+)'(?!\s*\+)/g)) literals.add(m[1])
  for (const m of src.matchAll(/\bt[n]?\(\s*`([\w.-]+)\$\{/g)) prefixes.add(m[1])
}
for (const f of files) scan(fs.readFileSync(f, 'utf8'), f)
// i18n.ts's own helpers (pages(), tn()) reference keys too — scan its code
// after the dictionary, never the dictionary itself.
const dictEnd = dictSrc.indexOf('\n}\n', dictStart)
scan(dictSrc.slice(dictEnd), path.join(root, 'src/i18n.ts'))

const missing = [...used].filter(([k]) => !keys.has(k))
const unused = [...keys].filter((k) => {
  if (literals.has(k)) return false
  if (k.endsWith('.one') && literals.has(k.slice(0, -4))) return false
  return ![...prefixes].some((p) => k.startsWith(p))
})

for (const [k, f] of missing) console.log(`missing: ${k}  (${path.relative(root, f)})`)
for (const k of unused) console.log(`unused:  ${k}`)
console.log(`i18n-check: ${keys.size} keys, ${used.size} referenced, ${prefixes.size} dynamic prefix(es), ${missing.length} missing, ${unused.length} unused`)
process.exit(missing.length || unused.length ? 1 : 0)
