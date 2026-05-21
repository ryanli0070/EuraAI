/**
 * Render strokes to a PNG blob.
 *
 * This is the replacement for tldraw's `editor.toImage()`. It matters more
 * than the rest of the engine: the exported PNG is what the backend OCRs for
 * `/api/check` and `/api/help`, so it must crop tightly to the work, sit on a
 * clean white background, and render strokes crisply at the requested scale.
 */
import { outlineToPath2D, strokeOutline, unionBounds } from './geometry'
import type { Stroke } from './types'

export type ExportOptions = {
  /** Page-unit margin added around the content bounds. */
  padding: number
  /** Output pixel density multiplier (2 = retina-sharp for OCR). */
  scale: number
  /** Paint a white background; false leaves transparency. */
  background: boolean
}

/**
 * Export the given strokes as a PNG. Returns null when there's nothing to
 * draw, so callers can treat an empty board the same way they did with tldraw.
 */
export async function exportPng(strokes: Stroke[], opts: ExportOptions): Promise<Blob | null> {
  const drawable = strokes.filter((s) => s.points.length > 0)
  const bounds = unionBounds(drawable)
  if (!bounds) return null

  const { padding, scale, background } = opts
  const pageW = bounds.maxX - bounds.minX + padding * 2
  const pageH = bounds.maxY - bounds.minY + padding * 2

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(pageW * scale))
  canvas.height = Math.max(1, Math.ceil(pageH * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  if (background) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  // Map page space → output pixels: scale, then shift content's top-left
  // (minus padding) to the origin.
  ctx.scale(scale, scale)
  ctx.translate(-bounds.minX + padding, -bounds.minY + padding)

  for (const stroke of drawable) {
    ctx.fillStyle = stroke.color
    ctx.fill(outlineToPath2D(strokeOutline(stroke, true)))
  }

  return await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png')
  })
}
