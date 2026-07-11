// Import a .pptx as an editable deck: unzip (a .pptx IS a zip), parse each
// slide's DrawingML with the browser's DOMParser, and map shapes to our
// layouts heuristically — placeholder types drive cover/section detection,
// paragraph geometry drives bullets vs two-col, notes ride along. The result
// is a DeckSpec fed through the same normalizeDeck as AI output, so whatever
// we misread stays fixable in the editor.
//
// JSZip is loaded on demand (it already ships as pptxgenjs's dependency).

import type { DeckSpec, Slide } from '../types'
import { t } from '../i18n'

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

interface ShapeText {
  /** Placeholder type ('title' | 'ctrTitle' | 'subTitle' | 'body' | …) or ''. */
  ph: string
  /** Paragraph texts (empty ones dropped). */
  paras: string[]
  /** Left edge in EMU, for column detection (undefined when unpositioned). */
  x?: number
  w?: number
  /** Largest run font size on the shape, centipoints (2400 = 24pt). */
  maxSz?: number
}

/** Chrome noise that shouldn't become content: page numbers, ghost section
 *  numerals, "3 / 13" counters, and exported corner labels like "Part 2 · …". */
function isChromeText(s: string): boolean {
  return /^\d{1,3}$/.test(s) || /^\d+\s*\/\s*\d+$/.test(s) || /^(part|chapter|环节|章节)\s*\d+(\s*·.*)?$/i.test(s)
}

function textOf(el: Element): string {
  const ts = el.getElementsByTagNameNS(NS_A, 't')
  let out = ''
  for (const tn of Array.from(ts)) out += tn.textContent ?? ''
  return out.trim()
}

/** All text-bearing shapes on a slide, in document order. */
function readShapes(doc: Document): ShapeText[] {
  const out: ShapeText[] = []
  for (const sp of Array.from(doc.getElementsByTagNameNS(NS_P, 'sp'))) {
    const body = sp.getElementsByTagNameNS(NS_P, 'txBody')[0] ?? sp.getElementsByTagNameNS(NS_A, 'txBody')[0]
    if (!body) continue
    const paras: string[] = []
    for (const p of Array.from(body.getElementsByTagNameNS(NS_A, 'p'))) {
      const text = textOf(p)
      if (text && !isChromeText(text)) paras.push(text)
    }
    if (!paras.length) continue
    const ph = sp.getElementsByTagNameNS(NS_P, 'ph')[0]?.getAttribute('type') ?? (sp.getElementsByTagNameNS(NS_P, 'ph')[0] ? 'body' : '')
    const off = sp.getElementsByTagNameNS(NS_A, 'off')[0]
    const ext = sp.getElementsByTagNameNS(NS_A, 'ext')[0]
    let maxSz: number | undefined
    for (const rpr of Array.from(body.getElementsByTagNameNS(NS_A, 'rPr'))) {
      const sz = Number(rpr.getAttribute('sz'))
      if (sz && (!maxSz || sz > maxSz)) maxSz = sz
    }
    out.push({
      ph,
      paras,
      x: off ? Number(off.getAttribute('x')) || undefined : undefined,
      w: ext ? Number(ext.getAttribute('cx')) || undefined : undefined,
      maxSz,
    })
  }
  return out
}

const TITLE_PH = new Set(['title', 'ctrTitle'])

/** Map one slide's shapes (+notes) to the best-fitting Slide spec. */
function toSlide(shapes: ShapeText[], note: string, index: number, total: number): Partial<Slide> & { layout: string } {
  let titleShape = shapes.find((s) => TITLE_PH.has(s.ph))
  const subShape = shapes.find((s) => s.ph === 'subTitle')
  // No title placeholder (plain text boxes — incl. our own PPTX export): the
  // shape with the biggest font is the title, if it plausibly looks like one.
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

/** Notes text, minus slide-number/date placeholders. */
function readNotes(doc: Document): string {
  const parts: string[] = []
  for (const sp of Array.from(doc.getElementsByTagNameNS(NS_P, 'sp'))) {
    const ph = sp.getElementsByTagNameNS(NS_P, 'ph')[0]?.getAttribute('type') ?? ''
    if (ph === 'sldNum' || ph === 'dt' || ph === 'ftr' || ph === 'sldImg') continue
    const text = textOf(sp)
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
export async function importPptx(data: ArrayBuffer, fileName: string): Promise<DeckSpec> {
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
  for (let i = 0; i < paths.length; i++) {
    const doc = await parseXml(zip, paths[i])
    if (!doc) continue
    const shapes = readShapes(doc)
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
  }
}
