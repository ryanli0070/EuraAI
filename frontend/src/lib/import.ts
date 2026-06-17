/**
 * Import a PDF or image into a new canvas as annotatable page backgrounds.
 *
 * A PDF becomes one page per PDF page; a single image becomes a one-page
 * canvas. Each page is rasterized to a PNG, uploaded to Storage, and recorded
 * as a `PageBackground` in the canvas's drawing doc. The engine then renders
 * each bitmap behind the (initially empty) ink layer, so the user writes
 * directly on top of their homework — the GoodNotes import model.
 *
 * pdf.js is loaded lazily (it's a heavy dependency) so the main bundle and the
 * common no-import path stay light.
 */
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { createCanvas, setThumbnail, type CanvasMeta, type FolderId } from './canvasStore'
import { saveDoc, uploadBackground } from './whiteboard/persistence'
import type { PageBackground, WhiteboardDoc } from './whiteboard/types'

// Cap the long edge of every rasterized page. ~150 DPI for US Letter — crisp
// enough to read fine print when zoomed, without ballooning Storage/bandwidth.
const MAX_DIM = 1800
// Refuse absurd PDFs so one bad import can't fan out into hundreds of uploads.
const MAX_PAGES = 80

export type RenderedPage = { blob: Blob; w: number; h: number }
export type ImportProgress = { phase: 'rendering' | 'uploading'; done: number; total: number }
export type ImportInput = { name: string; blob: Blob }

function isPdf(input: ImportInput): boolean {
  return input.blob.type === 'application/pdf' || /\.pdf$/i.test(input.name)
}

/** Strip the directory + extension off a filename for the canvas title. */
function titleFromName(name: string): string {
  const base = name.split('/').pop() ?? name
  return base.replace(/\.[^.]+$/, '').trim() || 'Imported'
}

/** Draw a source bitmap onto a canvas, scaled to fit MAX_DIM, and return a PNG. */
async function rasterize(source: CanvasImageSource, w: number, h: number): Promise<RenderedPage> {
  const scale = Math.min(1, MAX_DIM / Math.max(w, h))
  const cw = Math.max(1, Math.round(w * scale))
  const ch = Math.max(1, Math.round(h * scale))
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D context unavailable for rasterize')
  ctx.drawImage(source, 0, 0, cw, ch)
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
  if (!blob) throw new Error('toBlob returned null')
  return { blob, w: cw, h: ch }
}

/** Decode an image Blob to its natural size + a normalized PNG page. */
async function renderImage(blob: Blob): Promise<RenderedPage> {
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image()
      el.onload = () => res(el)
      el.onerror = () => rej(new Error('image decode failed'))
      el.src = url
    })
    return await rasterize(img, img.naturalWidth, img.naturalHeight)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Render every page of a PDF to a PNG page. */
async function renderPdf(
  data: ArrayBuffer,
  onPage?: (done: number, total: number) => void,
): Promise<RenderedPage[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const pdf = await pdfjs.getDocument({ data }).promise
  const total = Math.min(pdf.numPages, MAX_PAGES)
  const pages: RenderedPage[] = []
  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i)
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(1, MAX_DIM / Math.max(base.width, base.height))
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil(viewport.width))
    canvas.height = Math.max(1, Math.ceil(viewport.height))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D context unavailable for PDF render')
    await page.render({ canvasContext: ctx, viewport }).promise
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
    page.cleanup()
    if (blob) pages.push({ blob, w: canvas.width, h: canvas.height })
    onPage?.(i, total)
  }
  await pdf.destroy()
  return pages
}

/**
 * Import a file into a brand-new canvas under `parent`. Returns the created
 * canvas (open it on the caller's side), or null on failure.
 */
export async function importFile(
  input: ImportInput,
  parent: FolderId | null = null,
  onProgress?: (p: ImportProgress) => void,
): Promise<CanvasMeta | null> {
  // 1. Rasterize to page bitmaps.
  let pages: RenderedPage[]
  if (isPdf(input)) {
    const buf = await input.blob.arrayBuffer()
    pages = await renderPdf(buf, (done, total) => onProgress?.({ phase: 'rendering', done, total }))
  } else {
    onProgress?.({ phase: 'rendering', done: 0, total: 1 })
    pages = [await renderImage(input.blob)]
    onProgress?.({ phase: 'rendering', done: 1, total: 1 })
  }
  if (pages.length === 0) return null

  // 2. Create the canvas row so we have an id for the Storage paths.
  const meta = await createCanvas(parent, titleFromName(input.name))
  if (!meta) return null

  // 3. Upload each page bitmap and collect its background record.
  const backgrounds: PageBackground[] = []
  for (let i = 0; i < pages.length; i++) {
    const { blob, w, h } = pages[i]
    const path = await uploadBackground(meta.id, i, blob)
    if (path) backgrounds.push({ page: i, path, w, h })
    onProgress?.({ phase: 'uploading', done: i + 1, total: pages.length })
  }

  // 4. Persist the doc (empty ink, N pages, the backgrounds) and a thumbnail.
  const doc: WhiteboardDoc = {
    version: 1,
    strokes: [],
    pageCount: pages.length,
    backgrounds,
  }
  await saveDoc(meta.id, doc)
  await setThumbnail(meta.id, pages[0].blob)

  return meta
}
