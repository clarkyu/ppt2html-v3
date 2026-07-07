// Export a deck to an editable .pptx. Every layout maps to native PowerPoint
// text boxes and shapes (no screenshots), so the receiver can actually edit
// the deck — the whole point of handing over a PPT. Theme palettes are carried
// over, speaker notes land in the notes pane, and backgrounds are embedded
// best-effort (photos fetched to data URLs, generated SVGs rasterized).
//
// pptxgenjs (~large) is loaded on demand via dynamic import so it never
// weighs down the main bundle.

import type { CustomTheme, Deck, Slide, ThemeName } from '../types'
import { deckIsCjk } from '../lib/lang'

interface Pal {
  bg: string
  fg: string
  strong: string
  muted: string
  accent: string
  accent2: string
  card: string
  light: boolean
}

/** Solid-color approximations of themes.css (PPT fills want flat hex). */
const THEME_PPT: Record<ThemeName, Pal> = {
  aurora: { bg: '0B1020', fg: 'E8ECFF', strong: 'FFFFFF', muted: 'A7B0D6', accent: '8B7CFF', accent2: '22D3EE', card: '181F3A', light: false },
  ink: { bg: 'F4F6FC', fg: '26304A', strong: '0B1220', muted: '5A6478', accent: '3B5BDB', accent2: '7048E8', card: 'FFFFFF', light: true },
  sunrise: { bg: '160C1E', fg: 'FBEAE2', strong: 'FFFFFF', muted: 'D8B5AC', accent: 'FF7A5C', accent2: 'FFC247', card: '241629', light: false },
  forest: { bg: '06231F', fg: 'E4F2EC', strong: 'FFFFFF', muted: 'A3C6BB', accent: '2DD4A7', accent2: 'A3E635', card: '0E332C', light: false },
  noir: { bg: '0A0A0B', fg: 'EDEDF0', strong: 'FFFFFF', muted: '9A9AA3', accent: 'FBBF24', accent2: 'F59E0B', card: '161618', light: false },
  sand: { bg: 'FAF5EC', fg: '43382C', strong: '241C12', muted: '7A6C58', accent: 'C2683C', accent2: '8A8B3D', card: 'FFFDF8', light: true },
  rose: { bg: '1A0A1C', fg: 'FBE6F1', strong: 'FFFFFF', muted: 'D09FBE', accent: 'FF5DA2', accent2: 'B06BFF', card: '2A1230', light: false },
}

const POS = '22C55E'
const NEG = 'F04444'

// The deck canvas is 1280×720 @96dpi → 13.333×7.5in. Position in px, convert.
const X = (px: number): number => px / 96

/** Mix two hex colors (t = weight of `a`). For ghost numbers, card borders… */
function blend(a: string, b: string, t: number): string {
  const pa = [0, 2, 4].map((i) => parseInt(a.slice(i, i + 2), 16))
  const pb = [0, 2, 4].map((i) => parseInt(b.slice(i, i + 2), 16))
  return pa.map((v, i) => Math.round(v * t + pb[i] * (1 - t)).toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** Perceived sRGB luminance 0..1 of a bare-or-#-prefixed hex. */
function luminance(hex: string): number {
  const h = hex.replace(/^#/, '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Build a flat-hex Pal from a custom "我的风格" — mirrors themes.css derivation. */
function paletteFromCustom(ct: CustomTheme): Pal {
  const hx = (s: string) => s.replace(/^#/, '').toUpperCase() // blend()/pptxgenjs want bare hex
  const bg = hx(ct.bg)
  const light = luminance(bg) > 0.5
  return {
    bg,
    accent: hx(ct.accent),
    accent2: hx(ct.accent2),
    light,
    fg: light ? blend('000000', bg, 0.82) : blend('FFFFFF', bg, 0.9),
    strong: light ? '111111' : 'FFFFFF',
    muted: light ? blend('000000', bg, 0.5) : blend('FFFFFF', bg, 0.56),
    // near-white card on light, bg lifted 8% toward white on dark (like aurora 181F3A).
    card: light ? blend('FFFFFF', bg, 0.55) : blend('FFFFFF', bg, 0.08),
  }
}

/** Strip inline markdown to plain text. */
function plain(s: string | undefined): string {
  return (s ?? '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/[*_`]/g, '')
}

/** Split `**bold**` markdown into pptx text runs, bolding + tinting keywords. */
function runs(s: string | undefined, base: Record<string, unknown>, accent?: string): Array<Record<string, unknown>> {
  const text = s ?? ''
  const out: Array<Record<string, unknown>> = []
  const re = /\*\*(.+?)\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), options: { ...base } })
    out.push({ text: m[1], options: { ...base, bold: true, ...(accent ? { color: accent } : {}) } })
    last = m.index + m[0].length
  }
  if (last < text.length || !out.length) out.push({ text: text.slice(last), options: { ...base } })
  return out
}

/**
 * A bulleted line, with the dot drawn as a leading accent-colored run.
 * pptxgenjs cannot express a multi-run paragraph with a native bullet: the
 * outer `bullet` option lands on the first run only, later runs then emit a
 * stray `<a:buNone/>` (or, if given a bullet, split into new paragraphs), so
 * `**bold**` lines lose their dot in LibreOffice/strict parsers. A literal
 * "•" run renders the same everywhere — and echoes the app's accent dots.
 */
function bulletRuns(s: string | undefined, base: Record<string, unknown>, dot: string, accent?: string): Array<Record<string, unknown>> {
  return [{ text: '•  ', options: { ...base, color: dot, bold: true } }, ...runs(s, base, accent)]
}

async function fetchDataUrl(url: string, timeoutMs = 6000): Promise<string | undefined> {
  try {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    const res = await fetch(url, { signal: ac.signal })
    clearTimeout(timer)
    if (!res.ok) return undefined
    const blob = await res.blob()
    if (blob.size > 4_000_000) return undefined
    return await new Promise((resolve) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = () => resolve(undefined)
      r.readAsDataURL(blob)
    })
  } catch {
    return undefined
  }
}

/** Rasterize an inline SVG data URI (abstract backgrounds) to PNG. */
function svgToPng(dataUri: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = 1280
        c.height = 720
        c.getContext('2d')!.drawImage(img, 0, 0, 1280, 720)
        resolve(c.toDataURL('image/png'))
      } catch {
        resolve(undefined)
      }
    }
    img.onerror = () => resolve(undefined)
    img.src = dataUri
  })
}

/** Best-effort embeddable image for a slide background (undefined = skip). */
async function bgData(slide: Slide): Promise<string | undefined> {
  const url = slide.bg?.url
  if (!url) return undefined
  if (/^data:image\/svg/i.test(url)) return svgToPng(url)
  if (/^data:image\//i.test(url)) return url // AI-generated PNG/JPEG data URLs embed as-is
  if (/^https?:\/\//i.test(url)) return fetchDataUrl(url)
  return undefined
}

export async function exportPptx(deck: Deck): Promise<void> {
  const { default: PptxGenJS } = await import('pptxgenjs')
  // pptxgenjs's TS surface is awkward across builds — drive it dynamically.
  const pptx = new PptxGenJS() as any
  pptx.defineLayout({ name: 'DECK169', width: 13.333, height: 7.5 })
  pptx.layout = 'DECK169'
  pptx.title = deck.title

  const C = deck.customTheme ? paletteFromCustom(deck.customTheme) : (THEME_PPT[deck.theme] ?? THEME_PPT.aurora)
  const cjk = deckIsCjk(deck)
  const partWord = cjk ? '环节' : 'Part'
  const serif = deck.customTheme?.serif ?? false
  const font = cjk ? (serif ? 'SimSun' : 'Microsoft YaHei') : serif ? 'Georgia' : 'Calibri'
  const base = { fontFace: font }
  const chapterTitles = deck.slides
    .filter((s) => s.layout === 'section')
    .map((s) => plain(s.title))
    .filter(Boolean)

  // Pre-resolve background images concurrently (best-effort).
  const bgs = await Promise.all(deck.slides.map((s) => bgData(s)))

  let sectionNum = 0
  let sectionTitle = ''
  const total = deck.slides.length

  deck.slides.forEach((slide, i) => {
    if (slide.layout === 'section') {
      sectionNum += 1
      sectionTitle = plain(slide.title)
    }
    const s = pptx.addSlide()
    s.background = { color: C.bg }

    // Embedded background + a scrim so text stays readable (hero pages get a
    // lighter wash, mirroring the app).
    const isHero = slide.layout === 'cover' || slide.layout === 'section' || slide.layout === 'end'
    if (bgs[i] && slide.layout !== 'image-text') {
      s.background = { data: bgs[i] }
      s.addShape('rect', {
        x: 0, y: 0, w: 13.333, h: 7.5,
        fill: { color: C.bg, transparency: slide.bg?.source === 'abstract' ? 25 : isHero ? 45 : 25 },
        line: { type: 'none' },
      })
    }

    const text = (t: unknown, opts: Record<string, unknown>): void => {
      s.addText(t, { ...base, ...opts })
    }

    // Chapter corner label on body pages.
    if (sectionNum > 0 && !isHero) {
      text(`${partWord} ${sectionNum}${sectionTitle ? ` · ${sectionTitle}` : ''}`, {
        x: X(600), y: X(24), w: X(588), h: X(30), align: 'right', fontSize: 11, color: C.muted,
      })
      text(`${i + 1} / ${total}`, { x: X(1040), y: X(668), w: X(148), h: X(28), align: 'right', fontSize: 11, color: C.muted })
    }

    switch (slide.layout) {
      case 'cover': {
        if (slide.eyebrow) text(plain(slide.eyebrow), { x: X(92), y: X(200), w: X(900), h: X(36), fontSize: 15, bold: true, color: C.accent })
        text(plain(slide.title), { x: X(92), y: X(245), w: X(1050), h: X(170), fontSize: 60, bold: true, color: C.strong })
        if (slide.subtitle) text(runs(slide.subtitle, { fontSize: 24, color: C.muted }, C.accent2), { x: X(92), y: X(425), w: X(950), h: X(80) })
        s.addShape('rect', { x: X(92), y: X(520), w: X(120), h: X(6), fill: { color: C.accent }, line: { type: 'none' } })
        const b = deck.branding
        const line = [b?.presenter, b?.org, b?.date].map((v) => (v ?? '').trim()).filter(Boolean).join(' · ')
        if (line) text(line, { x: X(92), y: X(645), w: X(900), h: X(30), fontSize: 14, color: C.muted })
        break
      }
      case 'section': {
        // Ghost part number, blended toward the backdrop like the app.
        text(String(sectionNum).padStart(2, '0'), {
          x: X(700), y: X(230), w: X(520), h: X(430), fontSize: 230, bold: true, align: 'right',
          color: blend(C.accent, C.bg, 0.22),
        })
        text(plain(slide.eyebrow) || (cjk ? '章节' : 'Chapter'), { x: X(92), y: X(255), w: X(700), h: X(34), fontSize: 14, bold: true, color: C.accent })
        text(plain(slide.title), { x: X(92), y: X(300), w: X(1000), h: X(130), fontSize: 48, bold: true, color: C.strong })
        if (slide.subtitle) text(runs(slide.subtitle, { fontSize: 22, color: C.muted }, C.accent2), { x: X(92), y: X(445), w: X(900), h: X(70) })
        break
      }
      case 'bullets': {
        header()
        const items = slide.bullets ?? []
        items.forEach((b, k) => {
          text(bulletRuns(b, { fontSize: 19, color: C.fg }, C.accent, C.accent2), {
            x: X(92), y: X(250 + k * 78), w: X(1096), h: X(70), valign: 'top',
          })
        })
        break
      }
      case 'two-col': {
        header()
        const col = (c: Slide['left'], x: number): void => {
          if (!c) return
          if (c.heading) text(plain(c.heading), { x: X(x), y: X(240), w: X(500), h: X(44), fontSize: 20, bold: true, color: C.strong })
          const lines = c.bullets ?? (c.body ? [c.body] : [])
          lines.forEach((b, k) =>
            text(c.bullets ? bulletRuns(b, { fontSize: 16, color: C.fg }, C.accent, C.accent2) : runs(b, { fontSize: 16, color: C.fg }, C.accent2), {
              x: X(x), y: X(300 + k * 62), w: X(500), h: X(56), valign: 'top',
            }),
          )
        }
        col(slide.left, 92)
        col(slide.right, 690)
        break
      }
      case 'big-number': {
        text(plain(slide.value ?? slide.title), { x: X(92), y: X(215), w: X(1096), h: X(220), fontSize: 110, bold: true, align: 'center', color: C.accent })
        if (slide.caption) text(runs(slide.caption, { fontSize: 24, color: C.muted, align: 'center' }, C.accent2), { x: X(190), y: X(455), w: X(900), h: X(80) })
        break
      }
      case 'stats': {
        header()
        const items = slide.stats ?? []
        const n = Math.max(1, items.length)
        const gap = 26
        const w = (1096 - (n - 1) * gap) / n
        items.forEach((st, k) => {
          const x = 92 + k * (w + gap)
          s.addShape('roundRect', { x: X(x), y: X(265), w: X(w), h: X(260), rectRadius: 0.12, fill: { color: C.card }, line: { color: blend(C.accent, C.bg, 0.35), width: 1 } })
          text(plain(st.value), { x: X(x + 18), y: X(295), w: X(w - 36), h: X(110), fontSize: 40, bold: true, color: C.accent })
          text(plain(st.label), { x: X(x + 18), y: X(415), w: X(w - 36), h: X(90), fontSize: 14, color: C.muted, valign: 'top' })
        })
        break
      }
      case 'quote': {
        text('“', { x: X(80), y: X(120), w: X(200), h: X(180), fontSize: 130, bold: true, color: C.accent })
        text(runs(slide.text ?? slide.title, { fontSize: 28, italic: true, color: C.strong }, C.accent2), { x: X(150), y: X(270), w: X(980), h: X(220), valign: 'top' })
        if (slide.author) text(`— ${plain(slide.author)}`, { x: X(150), y: X(520), w: X(900), h: X(40), fontSize: 16, color: C.muted })
        break
      }
      case 'comparison': {
        header()
        const items = slide.items ?? []
        const n = Math.max(1, items.length)
        const gap = 26
        const w = (1096 - (n - 1) * gap) / n
        items.forEach((it, k) => {
          const x = 92 + k * (w + gap)
          const toneColor = it.tone === 'positive' ? POS : it.tone === 'negative' ? NEG : C.accent
          s.addShape('roundRect', { x: X(x), y: X(240), w: X(w), h: X(380), rectRadius: 0.08, fill: { color: C.card }, line: { color: blend(toneColor, C.bg, 0.5), width: 1 } })
          s.addShape('rect', { x: X(x + 10), y: X(240), w: X(w - 20), h: X(6), fill: { color: toneColor }, line: { type: 'none' } })
          text(plain(it.heading), { x: X(x + 20), y: X(265), w: X(w - 40), h: X(50), fontSize: 20, bold: true, color: C.strong })
          ;(it.points ?? []).forEach((p, j) =>
            text(bulletRuns(p, { fontSize: 14, color: C.fg }, toneColor, C.accent2), { x: X(x + 20), y: X(325 + j * 58), w: X(w - 40), h: X(54), valign: 'top' }),
          )
        })
        break
      }
      case 'timeline': {
        header()
        const steps = slide.steps ?? []
        const horizontal = steps.length >= 3 && steps.length <= 5
        if (horizontal) {
          const n = steps.length
          const w = 1096 / n
          steps.forEach((st, k) => {
            const cx = 92 + k * w + w / 2
            if (k < n - 1) s.addShape('rect', { x: X(cx + 26), y: X(312), w: X(w - 52), h: X(2), fill: { color: blend(C.accent, C.bg, 0.5) }, line: { type: 'none' } })
            s.addShape('ellipse', { x: X(cx - 25), y: X(288), w: X(50), h: X(50), fill: { color: C.accent }, line: { type: 'none' } })
            text(String(k + 1), { x: X(cx - 25), y: X(288), w: X(50), h: X(50), align: 'center', fontSize: 18, bold: true, color: 'FFFFFF' })
            text(plain(st.label), { x: X(cx - w / 2 + 8), y: X(355), w: X(w - 16), h: X(40), align: 'center', fontSize: 17, bold: true, color: C.strong })
            if (st.text) text(runs(st.text, { fontSize: 13, color: C.muted, align: 'center' }, C.accent2), { x: X(cx - w / 2 + 8), y: X(400), w: X(w - 16), h: X(120), valign: 'top' })
          })
        } else {
          steps.forEach((st, k) => {
            s.addShape('ellipse', { x: X(92), y: X(245 + k * 88), w: X(40), h: X(40), fill: { color: C.accent }, line: { type: 'none' } })
            text(String(k + 1), { x: X(92), y: X(245 + k * 88), w: X(40), h: X(40), align: 'center', fontSize: 15, bold: true, color: 'FFFFFF' })
            text(plain(st.label), { x: X(155), y: X(243 + k * 88), w: X(1000), h: X(36), fontSize: 18, bold: true, color: C.strong })
            if (st.text) text(runs(st.text, { fontSize: 14, color: C.muted }, C.accent2), { x: X(155), y: X(281 + k * 88), w: X(1000), h: X(44), valign: 'top' })
          })
        }
        break
      }
      case 'code': {
        header()
        s.addShape('roundRect', { x: X(92), y: X(225), w: X(1096), h: X(420), rectRadius: 0.06, fill: { color: '0C1230' }, line: { color: blend(C.accent, C.bg, 0.4), width: 1 } })
        text(slide.code ?? '', { x: X(116), y: X(245), w: X(1048), h: X(380), fontSize: 12, fontFace: 'Consolas', color: 'E6E9F5', valign: 'top' })
        if (slide.language) text(slide.language, { x: X(950), y: X(232), w: X(220), h: X(26), align: 'right', fontSize: 11, color: '8A93B8' })
        break
      }
      case 'image-text': {
        header()
        const hasImg = !!bgs[i]
        if (hasImg) {
          // (no `rounding` — pptxgenjs's rounding crops to an ellipse, not soft corners)
          s.addImage({ data: bgs[i], x: X(92), y: X(215), w: X(520), h: X(390) })
        }
        const tx = hasImg ? 660 : 92
        const tw = hasImg ? 528 : 1096
        const body = slide.body ? [slide.body] : (slide.bullets ?? [])
        body.forEach((b, k) =>
          text(slide.body ? runs(b, { fontSize: 17, color: C.fg }, C.accent2) : bulletRuns(b, { fontSize: 17, color: C.fg }, C.accent, C.accent2), {
            x: X(tx), y: X(250 + k * 66), w: X(tw), h: slide.body ? X(340) : X(60), valign: 'top',
          }),
        )
        break
      }
      case 'end': {
        text(plain(slide.title) || (cjk ? '谢谢观看' : 'Thank You'), { x: X(92), y: X(270), w: X(1096), h: X(120), align: 'center', fontSize: 50, bold: true, color: C.strong })
        if (slide.subtitle) text(runs(slide.subtitle, { fontSize: 22, color: C.muted, align: 'center' }, C.accent2), { x: X(190), y: X(405), w: X(900), h: X(60) })
        if (chapterTitles.length >= 2) {
          text(chapterTitles.slice(0, 4).join('   ·   '), { x: X(92), y: X(560), w: X(1096), h: X(36), align: 'center', fontSize: 13, color: C.muted })
        }
        const b = deck.branding
        const line = [b?.presenter, b?.org, b?.date].map((v) => (v ?? '').trim()).filter(Boolean).join(' · ')
        if (line) text(line, { x: X(92), y: X(645), w: X(1096), h: X(30), align: 'center', fontSize: 14, color: C.muted })
        break
      }
    }

    function header(): void {
      if (slide.eyebrow) text(plain(slide.eyebrow), { x: X(92), y: X(90), w: X(900), h: X(30), fontSize: 13, bold: true, color: C.accent })
      if (slide.title) {
        text(plain(slide.title), { x: X(92), y: X(122), w: X(1096), h: X(76), fontSize: 32, bold: true, color: C.strong })
        s.addShape('rect', { x: X(92), y: X(205), w: X(76), h: X(5), fill: { color: C.accent }, line: { type: 'none' } })
      }
    }

    if (slide.note) s.addNotes(slide.note)
  })

  const fileName = `${(deck.title || 'deck').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 60) || 'deck'}.pptx`
  await pptx.writeFile({ fileName })
}
