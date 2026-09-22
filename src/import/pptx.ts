// Import a .pptx as an editable deck: unzip (a .pptx IS a zip), parse each
// slide's DrawingML with the browser's DOMParser, and map shapes to our
// layouts. Our own exports tag every text box (`ppt2html:<layout>:<field>` in
// the shape name) and come back with their exact layout and fields; foreign
// files go through heuristics — placeholder types drive cover/section
// detection, paragraph geometry drives bullets vs two-col, tables become one
// row per bullet, notes ride along. The result is a DeckSpec fed through the
// same normalizeDeck as AI output, so whatever we misread stays fixable in
// the editor.
//
// JSZip is loaded on demand (it already ships as pptxgenjs's dependency).

import type { DeckSpec, Slide } from '../types'
import { LAYOUTS } from '../types'
import { t } from '../i18n'

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

/** Shape-name prefix written by export/pptx.ts (kept in sync there). */
const TAG = 'ppt2html:'

interface ShapeText {
  /** Placeholder type ('title' | 'ctrTitle' | 'subTitle' | 'body' | …) or ''. */
  ph: string
  /** Paragraph texts: trimmed, soft line breaks collapsed, chrome dropped
   * (chrome is kept for tagged shapes — the tag says what the text is). */
  paras: string[]
  /** The shape's text verbatim (paragraphs and `a:br` as newlines): a code
   * listing keeps its indentation and blank lines. */
  raw: string
  /** `p:cNvPr/@name` — carries our field tag on re-imported exports. */
  name: string
  /** Left edge in EMU, for column detection (undefined when unpositioned). */
  x?: number
  w?: number
  /** Largest run font size on the shape, centipoints (2400 = 24pt). */
  maxSz?: number
}

export interface ImportedDeckSpec extends DeckSpec {
  /** Pictures / charts / diagrams that carried no text and so were dropped —
   * the caller tells the user instead of reporting a "complete" import. */
  skippedVisuals: number
}

/** Chrome noise that shouldn't become content: page numbers, ghost section
 *  numerals, "3 / 13" counters, and exported corner labels like "Part 2 · …". */
function isChromeText(s: string): boolean {
  return /^\d{1,3}$/.test(s) || /^\d+\s*\/\s*\d+$/.test(s) || /^(part|chapter|环节|章节)\s*\d+(\s*·.*)?$/i.test(s)
}

/** Text of an element in document order; `a:br` (a soft line break — Shift+
 * Enter) becomes a newline instead of gluing "Revenue" to "2025". */
function textOf(el: Element): string {
  let out = ''
  const walk = (n: Element): void => {
    for (const c of Array.from(n.children)) {
      if (c.namespaceURI === NS_A && c.localName === 't') out += c.textContent ?? ''
      else if (c.namespaceURI === NS_A && c.localName === 'br') out += '\n'
      else walk(c)
    }
  }
  walk(el)
  return out
}

/** One paragraph as a single line of content. */
const oneLine = (s: string): string => s.replace(/\s*\n\s*/g, ' ').trim()

const isA = (el: Element, name: string): boolean => el.namespaceURI === NS_A && el.localName === name
const isP = (el: Element, name: string): boolean => el.namespaceURI === NS_P && el.localName === name

function nameOf(el: Element): string {
  return el.getElementsByTagNameNS(NS_P, 'cNvPr')[0]?.getAttribute('name') ?? ''
}

function geometry(el: Element): { x?: number; w?: number } {
  const off = el.getElementsByTagNameNS(NS_A, 'off')[0]
  const ext = el.getElementsByTagNameNS(NS_A, 'ext')[0]
  return {
    x: off ? Number(off.getAttribute('x')) || undefined : undefined,
    w: ext ? Number(ext.getAttribute('cx')) || undefined : undefined,
  }
}

function shapeText(sp: Element): ShapeText | null {
  const body = sp.getElementsByTagNameNS(NS_P, 'txBody')[0] ?? sp.getElementsByTagNameNS(NS_A, 'txBody')[0]
  if (!body) return null
  const name = nameOf(sp)
  const tagged = name.startsWith(TAG)
  const rawLines: string[] = []
  const paras: string[] = []
  for (const p of Array.from(body.children).filter((c) => isA(c, 'p'))) {
    const raw = textOf(p)
    rawLines.push(raw)
    const line = oneLine(raw)
    if (line && (tagged || !isChromeText(line))) paras.push(line)
  }
  const raw = rawLines.join('\n').replace(/\s+$/, '')
  if (!paras.length && !(tagged && raw.trim())) return null
  const ph = sp.getElementsByTagNameNS(NS_P, 'ph')[0]?.getAttribute('type') ?? (sp.getElementsByTagNameNS(NS_P, 'ph')[0] ? 'body' : '')
  let maxSz: number | undefined
  for (const rpr of Array.from(body.getElementsByTagNameNS(NS_A, 'rPr'))) {
    const sz = Number(rpr.getAttribute('sz'))
    if (sz && (!maxSz || sz > maxSz)) maxSz = sz
  }
  return { ph, paras, raw, name, ...geometry(sp), maxSz }
}

/** A table (p:graphicFrame > a:tbl) as one paragraph per row, cells joined
 * with " | " — it used to be skipped outright, leaving "Untitled page N". */
function tableText(frame: Element): ShapeText | null {
  const tbl = frame.getElementsByTagNameNS(NS_A, 'tbl')[0]
  if (!tbl) return null
  const rows: string[] = []
  for (const tr of Array.from(tbl.getElementsByTagNameNS(NS_A, 'tr'))) {
    const cells: string[] = []
    for (const tc of Array.from(tr.children).filter((c) => isA(c, 'tc'))) {
      const cell = Array.from(tc.getElementsByTagNameNS(NS_A, 'p')).map((p) => oneLine(textOf(p))).filter(Boolean).join(' ')
      if (cell) cells.push(cell)
    }
    if (cells.length) rows.push(cells.join(' | '))
  }
  if (!rows.length) return null
  return { ph: '', paras: rows, raw: rows.join('\n'), name: nameOf(frame), ...geometry(frame) }
}

/** All text-bearing shapes on a slide in document order (groups flattened),
 * plus the count of visuals — pictures, charts, SmartArt, embedded objects —
 * that had no text to carry over. */
function readShapes(doc: Document): { shapes: ShapeText[]; visuals: number } {
  const shapes: ShapeText[] = []
  let visuals = 0
  const walk = (parent: Element): void => {
    for (const el of Array.from(parent.children)) {
      if (isP(el, 'grpSp')) walk(el)
      else if (isP(el, 'sp')) {
        const s = shapeText(el)
        if (s) shapes.push(s)
      } else if (isP(el, 'graphicFrame')) {
        const s = tableText(el)
        if (s) shapes.push(s)
        else visuals += 1
      } else if (isP(el, 'pic')) visuals += 1
    }
  }
  const tree = doc.getElementsByTagNameNS(NS_P, 'spTree')[0]
  if (tree) walk(tree)
  return { shapes, visuals }
}

const TITLE_PH = new Set(['title', 'ctrTitle'])
const LAYOUT_SET = new Set<string>(LAYOUTS)

function parseTag(name: string): { layout: string; field: string } | null {
  if (!name.startsWith(TAG)) return null
  const rest = name.slice(TAG.length)
  const at = rest.indexOf(':')
  return at > 0 ? { layout: rest.slice(0, at), field: rest.slice(at + 1) } : null
}

/** Strip the exporter's literal bullet dot. */
const unbullet = (s: string): string => s.replace(/^•\s*/, '')
/** Sparse arrays hold the tagged indices; holes are skipped by filter. */
const dense = <T,>(a: T[]): T[] => a.filter((x) => x !== undefined)

/**
 * A page exported by this app: rebuild the slide from its field tags. Text
 * the user added in PowerPoint (untagged boxes) is kept — as extra bullets
 * where the layout has a list, otherwise appended to the speaker note — so
 * nothing typed into the file is lost.
 */
function fromTagged(shapes: ShapeText[], note: string): (Partial<Slide> & { layout: string }) | null {
  const tagged = shapes.map((s) => ({ s, tag: parseTag(s.name) })).filter((x) => x.tag)
  const layout = tagged[0]?.tag?.layout ?? ''
  if (!LAYOUT_SET.has(layout)) return null
  const o: Record<string, unknown> = { layout }
  const bullets: string[] = []
  const cols: Record<'left' | 'right', { heading?: string; body?: string; bullets: string[] }> = { left: { bullets: [] }, right: { bullets: [] } }
  const stats: Array<{ value?: string; label?: string }> = []
  const items: Array<{ heading?: string; points: string[] }> = []
  const steps: Array<{ label?: string; text?: string }> = []
  const SCALAR = new Set(['title', 'subtitle', 'eyebrow', 'caption', 'value', 'text', 'author', 'language', 'body'])
  for (const { s, tag } of tagged) {
    const f = tag!.field
    const txt = s.paras.join(' ')
    const [head, a, b, c] = f.split('.')
    if (f === 'chrome' || !txt.trim()) continue
    else if (SCALAR.has(f)) o[f] = f === 'author' ? txt.replace(/^[—–-]\s*/, '') : txt
    else if (f === 'code') o.code = s.raw
    else if (head === 'bullet') bullets[Number(a)] = unbullet(txt)
    else if (head === 'left' || head === 'right') {
      const col = cols[head]
      if (a === 'heading') col.heading = txt
      else if (a === 'body') col.body = txt
      else if (a === 'bullet') col.bullets[Number(b)] = unbullet(txt)
    } else if (head === 'stat') {
      const st = (stats[Number(a)] ??= {})
      if (b === 'value') st.value = txt
      else if (b === 'label') st.label = txt
    } else if (head === 'item') {
      const it = (items[Number(a)] ??= { points: [] })
      if (b === 'heading') it.heading = txt
      else if (b === 'point') it.points[Number(c)] = unbullet(txt)
    } else if (head === 'step') {
      const st = (steps[Number(a)] ??= {})
      if (b === 'label') st.label = txt
      else if (b === 'text') st.text = txt
    }
  }
  const extra = shapes.filter((s) => !parseTag(s.name)).flatMap((s) => s.paras)
  const list = (arr: string[]): string[] | undefined => (arr.length ? arr : undefined)
  switch (layout) {
    case 'bullets':
    case 'image-text':
      if (o.body && extra.length) o.bullets = extra
      else o.bullets = list([...dense(bullets), ...extra])
      extra.length = 0
      break
    case 'two-col':
      cols.right.bullets.push(...extra)
      extra.length = 0
      for (const side of ['left', 'right'] as const) {
        const col = cols[side]
        const bl = dense(col.bullets)
        if (col.heading || col.body || bl.length) o[side] = { heading: col.heading, body: bl.length ? undefined : col.body, bullets: bl.length ? bl : undefined }
      }
      break
    case 'stats':
      o.stats = dense(stats).filter((st) => st.value)
      break
    case 'comparison':
      o.items = dense(items).map((it) => ({ heading: it.heading ?? '', points: list(dense(it.points)) }))
      break
    case 'timeline':
      o.steps = dense(steps).map((st) => ({ label: st.label ?? '', text: st.text }))
      break
  }
  const noteOut = [note, ...extra].filter(Boolean).join('\n')
  return { ...(o as Partial<Slide> & { layout: string }), note: noteOut || undefined }
}

/** Map one slide's shapes (+notes) to the best-fitting Slide spec. */
function toSlide(shapes: ShapeText[], note: string, index: number, total: number): Partial<Slide> & { layout: string } {
  const own = fromTagged(shapes, note)
  if (own) return own

  let titleShape = shapes.find((s) => TITLE_PH.has(s.ph))
  const subShape = shapes.find((s) => s.ph === 'subTitle')
  // No title placeholder (plain text boxes): the shape with the biggest font
  // is the title, if it plausibly looks like one.
  if (!titleShape) {
    const candidates = shapes
      .filter((s) => !s.ph && s.paras.length === 1 && (s.maxSz ?? 0) >= 2400 && s.paras[0].length <= 60)
      .sort((a, b) => (b.maxSz ?? 0) - (a.maxSz ?? 0))
    titleShape = candidates[0]
  }
  const bodies = shapes.filter((s) => s !== titleShape && s !== subShape)
  const title = titleShape?.paras.join(' ') ?? ''
  const bodyParas = bodies.flatMap((s) => s.paras)
  const base = { title: title || undefined, note: note || undefined }
  const subtitleGuess = (): string | undefined =>
    subShape?.paras.join(' ') ||
    bodies.filter((s) => s.paras.length === 1 && (s.maxSz ?? 0) >= 1600 && s.paras[0].length <= 60)
      .sort((a, b) => (b.maxSz ?? 0) - (a.maxSz ?? 0))[0]?.paras[0] ||
    bodyParas[0]

  // Center-title placeholder = a title/section slide; first page = cover.
  const isTitleLayout = titleShape?.ph === 'ctrTitle' || (!!titleShape && !bodyParas.length)
  if (index === 0 && (isTitleLayout || !bodyParas.length || (titleShape && (titleShape.maxSz ?? 0) >= 4000))) {
    return { layout: 'cover', ...base, subtitle: subtitleGuess() }
  }
  if (index === total - 1 && bodyParas.length <= 1 && /谢谢|感谢|thank|q\s*&\s*a|q&a/i.test(title + bodyParas.join(''))) {
    return { layout: 'end', ...base, subtitle: bodyParas[0] }
  }
  if (isTitleLayout) {
    return { layout: 'section', ...base, subtitle: subtitleGuess() }
  }

  // Two body placeholders with real content = the classic two-content layout
  // (placeholder geometry often lives only in the slide layout, so position
  // can't be trusted for these).
  const phCols = bodies.filter((s) => s.ph && s.paras.length >= 2)
  const col = (s: ShapeText) => ({ heading: s.paras[0], bullets: s.paras.slice(1) })
  if (phCols.length === 2) {
    const [a, b] = phCols
    return { layout: 'two-col', ...base, left: col(a), right: col(b) }
  }
  // Plain text boxes: two clearly side-by-side multi-paragraph shapes → two-col.
  const positioned = bodies.filter((s) => s.x !== undefined && s.paras.length >= 2)
  if (positioned.length === 2) {
    const [a, b] = [...positioned].sort((p, q) => (p.x ?? 0) - (q.x ?? 0))
    const gapApart = a.w !== undefined ? (b.x ?? 0) >= (a.x ?? 0) + a.w * 0.8 : (b.x ?? 0) - (a.x ?? 0) > 2_000_000
    if (gapApart) return { layout: 'two-col', ...base, left: col(a), right: col(b) }
  }

  // One long narrative paragraph → prose page; otherwise bullet list.
  if (bodyParas.length === 1 && bodyParas[0].length > 60) {
    return { layout: 'image-text', ...base, body: bodyParas[0] }
  }
  return { layout: 'bullets', ...base, bullets: bodyParas }
}

/** Notes text, minus slide-number/date placeholders; paragraphs and soft
 * breaks keep their line structure (they used to be glued into one line). */
function readNotes(doc: Document): string {
  const parts: string[] = []
  for (const sp of Array.from(doc.getElementsByTagNameNS(NS_P, 'sp'))) {
    const ph = sp.getElementsByTagNameNS(NS_P, 'ph')[0]?.getAttribute('type') ?? ''
    if (ph === 'sldNum' || ph === 'dt' || ph === 'ftr' || ph === 'sldImg') continue
    const text = Array.from(sp.getElementsByTagNameNS(NS_A, 'p'))
      .map((p) => textOf(p).replace(/[ \t]+\n/g, '\n').trim())
      .filter(Boolean)
      .join('\n')
    if (text) parts.push(text)
  }
  return parts.join('\n').trim()
}

async function parseXml(zip: import('jszip'), path: string): Promise<Document | null> {
  const file = zip.file(path)
  if (!file) return null
  const xml = await file.async('string')
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  return doc.getElementsByTagName('parsererror').length ? null : doc
}

/** Slide paths in true presentation order (falls back to numeric file order). */
async function slidePaths(zip: import('jszip')): Promise<string[]> {
  const numeric = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
  const pres = await parseXml(zip, 'ppt/presentation.xml')
  const rels = await parseXml(zip, 'ppt/_rels/presentation.xml.rels')
  if (!pres || !rels) return numeric
  const relMap = new Map<string, string>()
  for (const rel of Array.from(rels.getElementsByTagName('Relationship'))) {
    relMap.set(rel.getAttribute('Id') ?? '', rel.getAttribute('Target') ?? '')
  }
  const ordered: string[] = []
  for (const sld of Array.from(pres.getElementsByTagNameNS(NS_P, 'sldId'))) {
    const target = relMap.get(sld.getAttributeNS(NS_R, 'id') ?? '')
    if (target) ordered.push(`ppt/${target.replace(/^\.?\//, '').replace(/^ppt\//, '')}`)
  }
  return ordered.length ? ordered : numeric
}

/** The slide's notes page, resolved through its relationship file. */
async function notesFor(zip: import('jszip'), slidePath: string): Promise<string> {
  const name = slidePath.split('/').pop()!
  const rels = await parseXml(zip, `ppt/slides/_rels/${name}.rels`)
  if (!rels) return ''
  for (const rel of Array.from(rels.getElementsByTagName('Relationship'))) {
    if (!(rel.getAttribute('Type') ?? '').endsWith('/notesSlide')) continue
    const target = (rel.getAttribute('Target') ?? '').replace(/^\.\.\//, 'ppt/')
    const doc = await parseXml(zip, target)
    if (doc) return readNotes(doc)
  }
  return ''
}

/**
 * Parse a .pptx into a DeckSpec (throws a localized error on non-pptx input).
 * Run the result through normalizeDeck before saving.
 */
export async function importPptx(data: ArrayBuffer, fileName: string): Promise<ImportedDeckSpec> {
  const { default: JSZip } = await import('jszip')
  let zip: import('jszip')
  try {
    zip = await JSZip.loadAsync(data)
  } catch {
    throw new Error(t('imp.notPptx'))
  }
  const paths = await slidePaths(zip)
  if (!paths.length) throw new Error(t('imp.notPptx'))

  const slides: Array<Partial<Slide> & { layout: string }> = []
  let skippedVisuals = 0
  for (let i = 0; i < paths.length; i++) {
    const doc = await parseXml(zip, paths[i])
    if (!doc) continue
    const { shapes, visuals } = readShapes(doc)
    skippedVisuals += visuals
    const note = await notesFor(zip, paths[i])
    // Fully empty pages (pure imagery) still become an editable placeholder.
    slides.push(
      shapes.length
        ? toSlide(shapes, note, i, paths.length)
        : { layout: 'bullets', title: `${t('imp.untitledPage')} ${i + 1}`, bullets: [], note: note || undefined },
    )
  }
  if (!slides.length) throw new Error(t('imp.noSlides'))

  const coverTitle = slides[0]?.title
  return {
    title: coverTitle || fileName.replace(/\.pptx$/i, ''),
    slides,
    skippedVisuals,
  }
}
