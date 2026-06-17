/**
 * Stroke geometry: smoothing, outline → Path2D, bounds, and hit-testing.
 *
 * All freehand smoothing goes through perfect-freehand (the same library
 * tldraw uses), so stroke appearance matches what users had before.
 */
import { getStroke } from 'perfect-freehand'
import type { Bounds, Stroke } from './types'

/**
 * perfect-freehand tuning — Goodnotes Ball Pen feel: constant width with
 * rounded caps. Tapering/pressure variation is deliberately disabled because
 * the variable-width "fountain pen" look reads as messy texture on a math
 * whiteboard. To revert to a Fountain-Pen feel later, set `thinning: 0.6`,
 * `simulatePressure: !stroke.pen`, and drop the `start`/`end` blocks.
 */
function freehandOptions(stroke: Stroke, isComplete: boolean) {
  return {
    size: stroke.size,
    thinning: 0,
    // Slightly above tldraw's 0.5 defaults — the extra smoothing/streamline
    // is the "stabilization" pass reviewers credit for Goodnotes' buttery
    // feel. Higher values trade tip responsiveness for smoother curves.
    smoothing: 0.62,
    streamline: 0.55,
    // Constant width is incompatible with pressure variation; disable for
    // every input, stylus included.
    simulatePressure: false,
    last: isComplete,
    // Rounded endpoints (the "ball" of a ball pen). cap:true rounds both
    // ends; taper:0 keeps those caps at the full pen width instead of
    // pulling them to a point.
    start: { cap: true, taper: 0 },
    end: { cap: true, taper: 0 },
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
 * Convex hull of a point set (Andrew's monotone chain), returned counter-
 * clockwise as [x,y] pairs. Used to turn a scratch-out scribble into the area
 * it swept, so erasing is bound by the region covered rather than the exact ink
 * path. Returns the input (deduped) when there are fewer than 3 distinct points.
 */
export function convexHull(points: { x: number; y: number }[]): number[][] {
  const pts = points.map((p) => [p.x, p.y] as [number, number])
  pts.sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]))
  // Drop exact duplicates so the cross-product test is well-behaved.
  const uniq: [number, number][] = []
  for (const p of pts) {
    const last = uniq[uniq.length - 1]
    if (!last || last[0] !== p[0] || last[1] !== p[1]) uniq.push(p)
  }
  if (uniq.length < 3) return uniq.map((p) => [p[0], p[1]])

  const cross = (o: number[], a: number[], b: number[]): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

  const lower: number[][] = []
  for (const p of uniq) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop()
    }
    lower.push(p)
  }
  const upper: number[][] = []
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop()
    }
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

/**
 * Grow a convex polygon outward by `margin` page units, pushing each vertex
 * away from the centroid. An approximation (not a true offset), but good enough
 * for the blobby hull of a scribble — it lets ink whose spine grazes just past
 * the hull edge still count as inside.
 */
export function expandPolygon(poly: number[][], margin: number): number[][] {
  const n = poly.length
  if (n === 0 || margin <= 0) return poly
  let cx = 0
  let cy = 0
  for (const [x, y] of poly) {
    cx += x
    cy += y
  }
  cx /= n
  cy /= n
  return poly.map(([x, y]) => {
    const dx = x - cx
    const dy = y - cy
    const d = Math.hypot(dx, dy)
    if (d === 0) return [x, y]
    return [x + (dx / d) * margin, y + (dy / d) * margin]
  })
}

/** True if (x,y) is inside the polygon (ray-casting). Boundary counts as in. */
export function pointInPolygon(poly: number[][], x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0]
    const yi = poly[i][1]
    const xj = poly[j][0]
    const yj = poly[j][1]
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
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
