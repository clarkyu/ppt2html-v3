// Client-side text extraction for the material box: .txt/.md read directly,
// .docx via mammoth (browser build), .pdf via pdf.js — both loaded lazily so
// neither heavyweight parser touches the main bundle (they're also excluded
// from the PWA precache in vite.config.ts). Everything stays on-device.

import { t } from '../i18n'

/** Bound the work on huge PDFs — 50 pages of text is far past the 8000-char cap anyway. */
const MAX_PDF_PAGES = 50

/** The parsers are lazy chunks kept OUT of the offline precache: a failed
 * download (offline, or a stale deploy) must be reported as "needs the
 * network once", not as "the file could not be parsed". */
async function loadParser<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load()
  } catch {
    throw new Error(t('home.materialNeedsNetwork'))
  }
}

async function fromDocx(file: File): Promise<string> {
  const { default: mammoth } = await loadParser(() => import('mammoth/mammoth.browser.min.js'))
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return value ?? ''
}

async function fromPdf(file: File): Promise<string> {
  const pdfjs = await loadParser(() => import('pdfjs-dist'))
  const worker = (await loadParser(() => import('pdfjs-dist/build/pdf.worker.min.mjs?url'))).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() })
  const doc = await task.promise
  const pages = Math.min(doc.numPages, MAX_PDF_PAGES)
  const parts: string[] = []
  for (let p = 1; p <= pages; p++) {
    const content = await (await doc.getPage(p)).getTextContent()
    const line = content.items
      .map((it) => ('str' in it ? it.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (line) parts.push(line)
  }
  void task.destroy()
  return parts.join('\n\n')
}

/** Messages that are already user-facing and must pass through the remap. */
const PASSTHROUGH = ['home.materialUnsupported', 'home.materialEmptyFile', 'home.materialNeedsNetwork'] as const

/** Extract plain text from an uploaded file; throws a localized Error. */
export async function extractFileText(file: File): Promise<string> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  try {
    let text: string
    if (ext === 'txt' || ext === 'md' || ext === 'markdown') text = await file.text()
    else if (ext === 'docx') text = await fromDocx(file)
    else if (ext === 'pdf') text = await fromPdf(file)
    else throw new Error(t('home.materialUnsupported'))
    const clean = text.replace(/\r\n/g, '\n').trim()
    if (!clean) throw new Error(t('home.materialEmptyFile'))
    return clean
  } catch (err) {
    // Parser internals throw all sorts of things — surface a friendly message.
    const msg = (err as Error)?.message ?? ''
    if (PASSTHROUGH.some((k) => msg === t(k))) throw err
    throw new Error(t('home.materialParseFailed'))
  }
}
