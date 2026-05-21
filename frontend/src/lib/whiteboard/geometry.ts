/**
 * Stroke geometry: smoothing, outline → Path2D, bounds, and hit-testing.
 *
 * All freehand smoothing goes through perfect-freehand (the same library
 * tldraw uses), so stroke appearance matches what users had before.
 */
import { getStroke } from 'perfect-freehand'
import type { Bounds, Stroke } from './types'

/**
 * perfect-freehand tuning. These mirror tldraw's `draw` shape defaults closely
 * enough that existing users won't notice a change in line feel.
 */
function freehandOptions(stroke: Stroke, isComplete: boolean) {
  return {
    size: stroke.size,
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.5,
    // Mouse input has no real pressure (always 0.5) — let the library fake
    // taper from velocity. A real stylus carries pressure, so trust it.
    simulatePressure: !stroke.pen,
    last: isComplete,
  }
}

/** Compute the filled outline polygon for a stroke, in page coordinates. */
export function strokeOutline(stroke: Stroke, isComplete = true): number[][] {
  return getStroke(
    stroke.points.map((pt) => [pt.x, pt.y, pt.p]),
    freehandOptions(stroke, isComplete),
  )
}

/** Build a closed Path2D from an outline polygon for fast canvas fills. */
export function outlineToPath2D(outline: number[][]): Path2D {
  const path = new Path2D()
  if (outline.length === 0) return path
  path.moveTo(outline[0][0], outline[0][1])
  for (let i = 1; i < outline.length; i++) {
    path.lineTo(outline[i][0], outline[i][1])
  }
  path.closePath()
  return path
}

/** Axis-aligned bounds of a stroke's raw input points (page coords). */
export function strokeBounds(stroke: Stroke): Bounds {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const pt of stroke.points) {
    if (pt.x < minX) minX = pt.x
    if (pt.y < minY) minY = pt.y
    if (pt.x > maxX) maxX = pt.x
    if (pt.y > maxY) maxY = pt.y
  }
  // Pad by half the brush width so bounds enclose the rendered outline, not
  // just the input spine.
  const pad = stroke.size / 2
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad }
}

/** Union bounds of many strokes, or null if the list is empty. */
export function unionBounds(strokes: Stroke[]): Bounds | null {
  if (strokes.length === 0) return null
  let b: Bounds | null = null
  for (const s of strokes) {
    if (s.points.length === 0) continue
    const sb = strokeBounds(s)
    if (!b) {
      b = { ...sb }
    } else {
      b.minX = Math.min(b.minX, sb.minX)
      b.minY = Math.min(b.minY, sb.minY)
      b.maxX = Math.max(b.maxX, sb.maxX)
      b.maxY = Math.max(b.maxY, sb.maxY)
    }
  }
  return b
}

export function boundsContain(b: Bounds, x: number, y: number): boolean {
  return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY
}

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
}

/** Squared distance from point (px,py) to segment (ax,ay)-(bx,by). */
function distSqToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx
  const cy = ay + t * dy
  const ex = px - cx
  const ey = py - cy
  return ex * ex + ey * ey
}

/**
 * True if (x,y) lands within `radius` page units of the stroke spine. Used by
 * both the eraser and the select tool's click hit-test.
 */
export function strokeHit(stroke: Stroke, x: number, y: number, radius: number): boolean {
  const pts = stroke.points
  const reach = radius + stroke.size / 2
  const reachSq = reach * reach
  if (pts.length === 1) {
    const dx = x - pts[0].x
    const dy = y - pts[0].y
    return dx * dx + dy * dy <= reachSq
  }
  for (let i = 1; i < pts.length; i++) {
    if (distSqToSegment(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) <= reachSq) {
      return true
    }
  }
  return false
}
