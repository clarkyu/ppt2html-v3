// Tiny dependency-free syntax highlighter for the code layout. Not a full
// grammar — a single tokenizer (comments, strings, numbers, keywords, calls)
// that reads well for the common teaching languages (JS/TS, Python, Java, Go,
// C-family, SQL, shell). Output is escaped HTML with .tok-* spans.

import { escapeHtml } from './markdown'

const KEYWORDS = new Set(
  (
    'const let var function return if else for while do switch case break continue ' +
    'class extends implements interface type enum new this super import export from ' +
    'default async await try catch finally throw typeof instanceof in of null undefined ' +
    'true false void yield static public private protected readonly ' +
    'def lambda pass raise with as global nonlocal elif except is not and or None True False ' +
    'print self match struct impl fn mut pub use mod crate where go func chan defer package ' +
    'select range map make int string bool float double char long short unsigned signed ' +
    'sizeof template namespace using include define ' +
    'SELECT FROM WHERE INSERT INTO VALUES UPDATE SET DELETE JOIN LEFT RIGHT INNER ON GROUP BY ' +
    'ORDER LIMIT CREATE TABLE PRIMARY KEY NOT NULL AND OR AS DISTINCT COUNT SUM AVG ' +
    'echo fi then esac done local exit'
  ).split(/\s+/),
)

/** Languages whose line comments start with `#`. */
const HASH_LANGS = new Set([
  'python', 'py', 'ruby', 'rb', 'sh', 'bash', 'zsh', 'shell', 'yaml', 'yml', 'toml', 'r', 'perl', 'pl',
  'powershell', 'ps1', 'make', 'makefile', 'dockerfile', 'ini', 'conf', 'nginx', 'elixir', 'ex', 'julia', 'jl',
])
/** Languages whose line comments start with `--`. */
const DASH_LANGS = new Set(['sql', 'mysql', 'postgres', 'postgresql', 'pgsql', 'sqlite', 'lua', 'haskell', 'hs', 'ada', 'vhdl', 'elm'])

interface CommentRules {
  slash: boolean // `//` and `/* … */`
  hash: boolean // `#`
  dash: boolean // `--`
}

/**
 * Which comment markers apply. With no language given, keep the old lenient
 * guess (everything) but only at a line start / after whitespace — that is
 * what stopped `i--`, `#include`, `#fff` and `this.#field` from being eaten.
 */
function rulesFor(language?: string): CommentRules {
  const l = (language ?? '').trim().toLowerCase()
  if (!l) return { slash: true, hash: true, dash: true }
  if (HASH_LANGS.has(l)) return { slash: false, hash: true, dash: false }
  if (DASH_LANGS.has(l)) return { slash: false, hash: false, dash: true }
  return { slash: true, hash: false, dash: false }
}

export function highlightCode(src: string, language?: string): string {
  const rules = rulesFor(language)
  let out = ''
  let i = 0
  const push = (cls: string | null, text: string): void => {
    const e = escapeHtml(text)
    out += cls ? `<span class="${cls}">${e}</span>` : e
  }
  /** `#` / `--` count as comments only where a comment can start: at the
   * beginning of a line or after whitespace. */
  const atTokenStart = (): boolean => i === 0 || /\s/.test(src[i - 1])

  while (i < src.length) {
    const c = src[i]
    const next = src[i + 1]

    // Line comments: // (C-family), # (python/shell/…), -- (sql/lua/…)
    const lineComment =
      (rules.slash && c === '/' && next === '/') ||
      (rules.hash && c === '#' && atTokenStart()) ||
      (rules.dash && c === '-' && next === '-' && atTokenStart())
    if (lineComment) {
      let j = src.indexOf('\n', i)
      if (j < 0) j = src.length
      push('tok-com', src.slice(i, j))
      i = j
      continue
    }
    if (rules.slash && c === '/' && next === '*') {
      let j = src.indexOf('*/', i + 2)
      j = j < 0 ? src.length : j + 2
      push('tok-com', src.slice(i, j))
      i = j
      continue
    }

    // Strings with escapes: '…' "…" `…`
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1
      while (j < src.length && src[j] !== c && src[j] !== '\n') {
        if (src[j] === '\\') j++
        j++
      }
      j = Math.min(j + 1, src.length)
      push('tok-str', src.slice(i, j))
      i = j
      continue
    }

    // Numbers (incl. 0x…, decimals)
    if (/[0-9]/.test(c)) {
      let j = i
      while (j < src.length && /[\w.]/.test(src[j])) j++
      push('tok-num', src.slice(i, j))
      i = j
      continue
    }

    // Identifiers / keywords / call sites
    if (/[A-Za-z_$]/.test(c)) {
      let j = i
      while (j < src.length && /[\w$]/.test(src[j])) j++
      const word = src.slice(i, j)
      if (KEYWORDS.has(word)) push('tok-kw', word)
      else if (src[j] === '(') push('tok-fn', word)
      else push(null, word)
      i = j
      continue
    }

    push(null, c)
    i++
  }
  return out
}
