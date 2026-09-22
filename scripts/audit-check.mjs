// CI gate over `npm audit --omit=dev`: any high/critical advisory in the
// production tree fails, except the ones listed in ALLOW with a reason (an
// advisory that cannot reach the browser bundle and whose only fix is a
// breaking downgrade). Everything else — including a new advisory on an
// allowlisted package with a different title — still fails, so the list can't
// silently grow stale.
//
//   npm run audit:check

import { execSync } from 'node:child_process'

const ALLOW = [
  {
    name: 'image-size',
    // pptxgenjs's Node-only image probing; the browser build stubs it out and
    // the only "fix" npm offers is pptxgenjs 2.2 (a breaking downgrade).
    titles: [/ICNS parser allows denial of service/, /JXL and HEIF parsers allow denial of service/],
  },
  { name: 'pptxgenjs', titles: [/^image-size$/] }, // only "depends on image-size"
]
const FAIL_AT = new Set(['high', 'critical'])

let raw = ''
try {
  raw = execSync('npm audit --omit=dev --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
} catch (e) {
  raw = String(e.stdout ?? '') // npm exits 1 when anything is found
}
let report
try {
  report = JSON.parse(raw)
} catch {
  console.error('audit-check: npm audit produced no JSON report')
  process.exit(2)
}

const failures = []
let allowed = 0
for (const [name, v] of Object.entries(report.vulnerabilities ?? {})) {
  if (!FAIL_AT.has(v.severity)) continue
  const titles = v.via.map((x) => (typeof x === 'string' ? x : x.title))
  const rule = ALLOW.find((r) => r.name === name)
  const covered = rule && titles.every((t) => rule.titles.some((re) => re.test(t)))
  if (covered) allowed += titles.length
  else failures.push(`${name} (${v.severity}): ${titles.join('; ')}`)
}
for (const f of failures) console.log(`FAIL ${f}`)
const total = Object.keys(report.vulnerabilities ?? {}).length
console.log(`audit-check: ${total} advisory package(s), ${allowed} allowlisted finding(s), ${failures.length} blocking`)
process.exit(failures.length ? 1 : 0)
