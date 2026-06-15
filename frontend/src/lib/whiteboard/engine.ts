/**
 * WhiteboardEngine — the canvas drawing engine that replaces tldraw.
 *
 * Owns the document, a paged camera, tools, input handling, render loop,
 * history, and debounced persistence. React touches it only through the small
 * public API at the bottom (`subscribe`, `setTool`, `undo`, `toImage`, …).
 *
 * Paging model (GoodNotes-style): pages are isolated — exactly one sheet is
 * shown at rest, with the next/previous a full viewport away. Drags along the
 * paging axis scroll between pages and snap on release; a swipe flicks to the
 * neighbour. Dragging past the last page and releasing creates a new one. Pan
 * across the page and zoom stay free. The paging axis is configurable
 * (`setScrollDirection`): horizontal by default — swipe left/right, pull right
 * to add — or vertical — swipe up/down, pull up to add. Strokes are always
 * stored in a wide page-coordinate space (page `i` lives near x = i·STRIDE) and
 * each page is drawn from its own origin, so the data model and on-screen
 * isolation don't depend on the scroll direction or the screen size.
 */
import { exportPng, type ExportOptions } from './export'
import {
  boundsIntersect,
  outlineToPath2D,
  strokeBounds,
  strokeHit,
  strokeOutline,
  unionBounds,
} from './geometry'
import { History } from './history'
import { saveDoc } from './persistence'
import type { EngineState, Stroke, ToolId, WhiteboardDoc } from './types'

const MIN_ZOOM = 0.1
const MAX_ZOOM = 8
// How far you may zoom out past the fitted page — a little wiggle, not infinite.
const FIT_ZOOM_WIGGLE = 0.85
// How far the page may be nudged past its resting position (vertical wiggle).
const PAN_WIGGLE = 64
const DEFAULT_COLOR = '#1d1d1d'
const DEFAULT_SIZE = 4
const SAVE_DEBOUNCE_MS = 600

// The page: a single sheet of paper the work lives on (US Letter, 8.5 : 11
// portrait). Sizes are in page units.
const PAGE_W = 1080
const PAGE_H = 1398
const PAGE_STRIDE = PAGE_W + 72 // storage spacing between pages (page units)
const SLOT_GUTTER = 80 // screen px between pages while swiping
const PAGE_MARGIN = 48 // screen px of breathing room when fitting the page to view
const GRID_STEP = 32 // page units between faint grid lines

// Swipe / pull-to-add tuning.
const SWIPE_VELOCITY = 0.35 // px/ms past which a flick advances a page
const PULL_THRESHOLD = 110 // screen px of pull past the last page to add a new one
const PULL_DAMP = 0.55 // rubber-band resistance while overscrolling
const PULL_MAX_OVERSCROLL = 120 // cap on how far the page visually lags the cursor
const SNAP_MS = 240 // snap / page-change animation duration

// Scratch-to-erase (Goodnotes-style): a back-and-forth scribble drawn over
// existing ink deletes the strokes it covers instead of being kept as a mark.
// All thresholds are in page units. Detection is deliberately conservative —
// and gated on actually overlapping ink — so ordinary writing is never eaten.
const SCRIBBLE_MIN_POINTS = 12 // need enough samples to judge the shape
const SCRIBBLE_MIN_DIAG = 20 // bbox diagonal floor; ignore dots/short flicks
const SCRIBBLE_MIN_REVERSALS = 4 // direction changes along the major axis
const SCRIBBLE_MIN_WIGGLE = 2 // path length ÷ bbox diagonal (folds back on itself)
const SCRIBBLE_SWING = 12 // a turn must span this far along the axis to count
const SCRIBBLE_COVER = 0.55 // fraction of a stroke the scribble must cover to delete it

const DESK_BG = '#e9e7e0'
const PAGE_BG = '#ffffff'
const PAGE_SHADOW = 'rgba(24,36,63,0.20)'
const PAGE_BORDER = 'rgba(24,36,63,0.12)'
const SHADOW_BLUR = 28 // soft drop-shadow blur behind each page sheet (screen px)
const SHADOW_OFFSET_Y = 10 // shadow drop (screen px)
// Padding around the page in the cached shadow sprite — must cover the blur
// spread plus the downward offset so the soft edge isn't clipped.
const SHADOW_PAD = SHADOW_BLUR * 2 + SHADOW_OFFSET_Y
const GRID_LINE = 'rgba(60,90,150,0.10)'

function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 's_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/**
 * Constrain a within-page pan offset — a delta (screen px) from the page's
 * centered resting position — so the sheet stays reachable: rests centered (±a
 * little wiggle) when the page fits that axis, and pans just far enough to bring
 * either edge flush when the page is larger than the viewport. Axis-agnostic, so
 * the same logic drives both the horizontal (`panX`) and vertical (`panY`) pans.
 */
function clampPan(delta: number, pagePx: number, viewport: number): number {
  // The view STAYS where the user puts it — no forced re-centering. The page can
  // slide until its far edge reaches the viewport edge (plus a little wiggle),
  // whether it's larger OR smaller than the viewport. When it fits, that means
  // you can freely reposition it within the empty desk instead of being snapped
  // back to the middle. Double-tap fits/recenters on demand.
  const range = Math.abs(pagePx - viewport) / 2 + PAN_WIGGLE
  return clamp(delta, -range, range)
}

/**
 * Resting within-page pan for one axis so the view ends up FULLY on the page on
 * release: centered (0) when the page fits the viewport on that axis, otherwise
 * the current pan clamped flush to the page edges — no desk gap and no over-pan
 * wiggle. This is what bounces an over-drag back onto the page. (Live dragging
 * still uses clampPan for the rubber-band feel; this only applies on settle.)
 */
function restPan(current: number, pagePx: number, viewport: number): number {
  if (pagePx <= viewport) return 0
  const range = (pagePx - viewport) / 2
  return clamp(current, -range, range)
}

/**
 * Count significant direction reversals (turning points) in a 1-D sequence —
 * the spine of a scribble projected onto its major axis. A reversal is only
 * counted once the value retreats from the last extreme by `minSwing`, so pen
 * jitter doesn't inflate the count. A back-and-forth scribble yields several;
 * a letter or digit yields one or two.
 */
function countReversals(vals: number[], minSwing: number): number {
  let reversals = 0
  let dir = 0 // current travel direction: +1, -1, or 0 (undetermined)
  let ext = vals[0] // last turning point / running extreme
  for (let i = 1; i < vals.length; i++) {
    const v = vals[i]
    if (dir === 0) {
      if (v - ext >= minSwing) { dir = 1; ext = v }
      else if (ext - v >= minSwing) { dir = -1; ext = v }
    } else if (dir === 1) {
      if (v > ext) ext = v // still rising — push the extreme out
      else if (ext - v >= minSwing) { reversals++; dir = -1; ext = v } // turned back
    } else {
      if (v < ext) ext = v
      else if (v - ext >= minSwing) { reversals++; dir = 1; ext = v }
    }
  }
  return reversals
}

/**
 * Heuristic: does this freehand path look like a scratch-out scribble (vs. real
 * writing)? True when it has enough samples, isn't tiny, folds back on itself
 * (path length ≫ bbox diagonal), and reverses direction several times along its
 * longer axis. Whether it actually erases anything is decided separately by
 * overlap with existing ink.
 */
function isScribble(points: { x: number; y: number }[]): boolean {
  const n = points.length
  if (n < SCRIBBLE_MIN_POINTS) return false
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, len = 0
  for (let i = 0; i < n; i++) {
    const p = points[i]
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
    if (i > 0) len += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y)
  }
  const w = maxX - minX
  const h = maxY - minY
  const diag = Math.hypot(w, h)
  if (diag < SCRIBBLE_MIN_DIAG) return false
  if (len / diag < SCRIBBLE_MIN_WIGGLE) return false
  const axis = points.map((p) => (w >= h ? p.x : p.y))
  return countReversals(axis, SCRIBBLE_SWING) >= SCRIBBLE_MIN_REVERSALS
}

type Listener = () => void

export class WhiteboardEngine {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private canvasId: string
  private dpr = 1
  private cssW = 0
  private cssH = 0

  // Pre-rendered "page sheet + soft drop shadow" sprite, blitted (scaled) each
  // frame instead of recomputing an expensive ctx.shadowBlur per page per frame.
  // Built ONCE at a fixed fit-zoom base size (not the live zoomed size) and
  // stretched with drawImage when blitting — so pinch-zoom never rebuilds the
  // blur, and the backing store stays small enough to never hit the iOS
  // canvas-size limit (which silently blanks oversized canvases). Regenerated
  // only on resize/dpr change. `shadowBaseW` is the sprite's page width (CSS px)
  // used to derive the base→screen scale factor.
  private shadowSprite: HTMLCanvasElement | null = null
  private shadowKey = ''
  private shadowBaseW = 0

  private doc: WhiteboardDoc
  private history: History

  // Paged camera. `zoom` scales. `scroll` is the paging position along the
  // active paging axis (rest = page·slot). `panX`/`panY` are within-page pan
  // offsets — deltas (screen px) from the page's centered resting spot — that
  // rest at 0 when the page fits and let you reach the edges when zoomed in.
  // `page` is the settled page index.
  private zoom = 1
  private scroll = 0
  private panX = 0
  private panY = 0
  private page = 0

  // Paging axis. False = horizontal (swipe left/right between pages, pull right
  // past the last to add one); true = vertical (swipe up/down, pull up to add).
  // Set from the Settings toggle via setScrollDirection(). Storage is always
  // laid out left-to-right regardless — only the on-screen projection and the
  // input axis change, so drawings survive flipping this.
  private vertical = false

  private tool: ToolId = 'draw'
  private color = DEFAULT_COLOR
  private size = DEFAULT_SIZE
  private selection = new Set<string>()
  private showGrid = true
  private fitted = false

  // Pull-to-add-page overscroll state (0 normally, 0..1 while pulling past the
  // last page) and the snap/page-change animation handle.
  private pullProgress = 0
  private animRaf = 0
  private wheelSnapTimer = 0

  // Transient interaction state.
  private drawing: Stroke | null = null
  private erasing = false
  private erasedAny = false
  private movingFrom: { x: number; y: number } | null = null
  private movedAny = false
  private marquee: { x0: number; y0: number; x1: number; y1: number } | null = null
  private panFrom:
    | {
        x: number
        y: number
        scroll0: number
        panX0: number
        panY0: number
        lastAlong: number
        lastT: number
      }
    | null = null
  private panV = 0 // pointer velocity along the paging axis (px/ms), for swipe detection
  // Double-tap-to-recenter detection (finger taps).
  private lastTapT = 0
  private lastTapX = 0
  private lastTapY = 0

  // Multi-touch gesture state (two-finger pan + pinch zoom).
  private pointers = new Map<number, { x: number; y: number }>()
  private gesture: { midX: number; midY: number; dist: number } | null = null

  // DOM overlay that visualizes the eraser's hit radius. Only the Pencil tip
  // shows it (per Goodnotes-style UX — touch is for panning, not erasing),
  // and only while the eraser tool is active. The element is owned by the
  // React layer; the engine just toggles its style.
  private eraserCursorEl: HTMLElement | null = null

  private pathCache = new Map<string, { len: number; path: Path2D }>()
  private listeners = new Set<Listener>()
  private rafId = 0
  private dirty = false
  private saveTimer = 0
  private disposed = false

  constructor(canvas: HTMLCanvasElement, canvasId: string, initialDoc: WhiteboardDoc) {
    this.canvas = canvas
    this.canvasId = canvasId
    this.doc = initialDoc
    this.history = new History(initialDoc)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context unavailable')
    this.ctx = ctx

    canvas.style.touchAction = 'none'
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointercancel', this.onPointerUp)
    canvas.addEventListener('pointerleave', this.onPointerLeave)
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    // iPadOS Scribble (Pencil → text recognition) silently swallows Pencil
    // events mid-stroke unless we preventDefault the underlying touchmove.
    // `touch-action: none` alone isn't enough — Scribble intercepts before
    // touch-action applies. Must be non-passive for preventDefault to take.
    canvas.addEventListener('touchmove', this.onTouchMove, { passive: false })
    window.addEventListener('keydown', this.onKeyDown)
    this.requestRender()
  }

  // ---------------------------------------------------------------------
  // Pages
  // ---------------------------------------------------------------------

  private numPages(): number {
    return this.doc.pageCount && this.doc.pageCount > 0 ? this.doc.pageCount : 1
  }

  /** Left edge (page/storage units) of page `i`. */
  private pageStorageLeft(i: number): number {
    return i * PAGE_STRIDE
  }

  /** Page length (page units) along the active paging axis. */
  private pagingLen(): number {
    return this.vertical ? PAGE_H : PAGE_W
  }

  /** Viewport extent (screen px) along the active paging axis. */
  private viewAlong(): number {
    return this.vertical ? this.cssH : this.cssW
  }

  /**
   * Length (screen px) of one paging slot, measured along the active paging
   * axis. A full viewport plus a gutter — but never shorter than the on-screen
   * page itself, so a zoomed-in page can't grow past the gap to its neighbour
   * (which would make the next page overlap the current one).
   */
  private slot(): number {
    return Math.max(this.viewAlong(), this.pagingLen() * this.zoom) + SLOT_GUTTER
  }

  /** True when the page is larger than the viewport along the paging axis
   *  (zoomed past fit), so drags pan within the page instead of switching pages. */
  private pageExceedsView(): boolean {
    return this.pagingLen() * this.zoom > this.viewAlong()
  }

  /** Resting `scroll` that centers page `i`. */
  private restScroll(i: number): number {
    return i * this.slot()
  }

  /**
   * Screen-space top-left of page `i`'s sheet at the current scroll/zoom. The
   * paging term (`scroll - i·slot`) shifts the active axis between pages; the
   * other axis just carries the within-page pan. `toPage()` and rendering both
   * go through these, so they follow scroll/pan for free.
   */
  private pageScreenLeft(i: number): number {
    const base = this.cssW / 2 - (PAGE_W * this.zoom) / 2 + this.panX
    return this.vertical ? base : base - (this.scroll - i * this.slot())
  }

  private pageScreenTop(i: number): number {
    const base = this.cssH / 2 - (PAGE_H * this.zoom) / 2 + this.panY
    return this.vertical ? base - (this.scroll - i * this.slot()) : base
  }

  /** Which page a stroke belongs to, by the x of its center. */
  private pageOfStroke(s: Stroke): number {
    const b = strokeBounds(s)
    const cx = (b.minX + b.maxX) / 2
    // Page `i` occupies x ∈ [i·STRIDE, i·STRIDE + PAGE_W]. Round relative to each
    // page's CENTER (not its left edge) so a stroke anywhere on the sheet maps
    // back to its own page — otherwise the right ~40% of a page rounds up to the
    // next page and gets clipped away on commit (vanishing on pencil-up).
    return clamp(Math.round((cx - PAGE_W / 2) / PAGE_STRIDE), 0, this.numPages() - 1)
  }

  /** The settled page in view — what "Check Work" / thumbnails capture. */
  private currentPage(): number {
    return clamp(this.page, 0, this.numPages() - 1)
  }

  // ---------------------------------------------------------------------
  // Coordinate helpers
  // ---------------------------------------------------------------------

  /** Pointer client coords → storage coords on the current page. */
  private toPage(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect()
    const sx = clientX - rect.left
    const sy = clientY - rect.top
    const left = this.pageScreenLeft(this.page)
    const top = this.pageScreenTop(this.page)
    return {
      x: this.pageStorageLeft(this.page) + (sx - left) / this.zoom,
      y: (sy - top) / this.zoom,
    }
  }

  private screenOf(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  // ---------------------------------------------------------------------
  // Sizing / fit / render loop
  // ---------------------------------------------------------------------

  resize(cssW: number, cssH: number): void {
    this.dpr = window.devicePixelRatio || 1
    this.cssW = cssW
    this.cssH = cssH
    this.canvas.width = Math.max(1, Math.round(cssW * this.dpr))
    this.canvas.height = Math.max(1, Math.round(cssH * this.dpr))
    this.canvas.style.width = `${cssW}px`
    this.canvas.style.height = `${cssH}px`
    cancelAnimationFrame(this.animRaf)
    if (!this.fitted) {
      this.fitted = true
      this.fitToPage()
    } else {
      // Slot size tracks the viewport — re-center the current page and clamp.
      this.scroll = this.restScroll(this.page)
      this.panX = clampPan(this.panX, PAGE_W * this.zoom, this.cssW)
      this.panY = clampPan(this.panY, PAGE_H * this.zoom, this.cssH)
    }
    this.requestRender()
  }

  /** The zoom at which the whole page fits the viewport with a small margin. */
  private fitZoom(): number {
    if (this.cssW === 0 || this.cssH === 0) return 1
    return Math.min(
      (this.cssW - PAGE_MARGIN * 2) / PAGE_W,
      (this.cssH - PAGE_MARGIN * 2) / PAGE_H,
    )
  }

  /** Lower zoom bound: the fitted page, with a little extra room to zoom out. */
  private minZoom(): number {
    return Math.max(MIN_ZOOM, this.fitZoom() * FIT_ZOOM_WIGGLE)
  }

  /** Center the current page in the viewport at the fitted zoom. */
  fitToPage(): void {
    if (this.cssW === 0 || this.cssH === 0) return
    this.zoom = clamp(this.fitZoom(), MIN_ZOOM, MAX_ZOOM)
    this.panX = 0
    this.panY = 0
    this.scroll = this.restScroll(this.page)
    this.requestRender()
  }

  private requestRender(): void {
    if (this.dirty || this.disposed) return
    this.dirty = true
    this.rafId = requestAnimationFrame(() => {
      this.dirty = false
      this.render()
    })
  }

  /** Path2D for a committed stroke, rebuilt only when its point count changes. */
  private pathFor(stroke: Stroke, isComplete: boolean): Path2D {
    const cached = this.pathCache.get(stroke.id)
    if (cached && cached.len === stroke.points.length) return cached.path
    const path = outlineToPath2D(strokeOutline(stroke, isComplete))
    this.pathCache.set(stroke.id, { len: stroke.points.length, path })
    return path
  }

  /**
   * Build (or reuse) the offscreen sheet+shadow sprite at a FIXED fit-zoom base
   * size — independent of the live zoom. The expensive blur runs only here, and
   * only when the viewport/dpr changes (resize), so zooming and paging reuse the
   * cached sprite and never pay the blur cost per frame. Blitting scales it to
   * the on-screen page size with drawImage (a cheap GPU op). Keeping the base
   * small also keeps the backing store well under the iOS canvas-size limit, so
   * it never blanks out the way a zoom-sized sprite did.
   */
  private ensureShadowSprite(): HTMLCanvasElement {
    const dpr = this.dpr
    // Base the sprite on the page at fit-zoom (constant for a given viewport):
    // 1:1 with the shadow at the common viewing scale, and bounded in size.
    const fz = Math.max(this.fitZoom(), MIN_ZOOM)
    const w = Math.max(1, Math.round(PAGE_W * fz))
    const h = Math.max(1, Math.round(PAGE_H * fz))
    const key = `${w}x${h}@${dpr}`
    if (this.shadowSprite && this.shadowKey === key) return this.shadowSprite

    const sprite = this.shadowSprite ?? document.createElement('canvas')
    sprite.width = Math.round((w + SHADOW_PAD * 2) * dpr)
    sprite.height = Math.round((h + SHADOW_PAD * 2) * dpr)
    const sctx = sprite.getContext('2d')!
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    sctx.clearRect(0, 0, sprite.width, sprite.height)
    sctx.shadowColor = PAGE_SHADOW
    sctx.shadowBlur = SHADOW_BLUR
    sctx.shadowOffsetY = SHADOW_OFFSET_Y
    sctx.fillStyle = PAGE_BG
    sctx.fillRect(SHADOW_PAD, SHADOW_PAD, w, h)

    this.shadowSprite = sprite
    this.shadowKey = key
    this.shadowBaseW = w
    return sprite
  }

  private render(): void {
    const { ctx, dpr } = this
    const z = this.zoom
    const n = this.numPages()
    const sw = PAGE_W * z
    const sh = PAGE_H * z

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = DESK_BG
    ctx.fillRect(0, 0, this.cssW, this.cssH)

    // Group strokes by page once, so each page pass is a cheap lookup.
    const byPage = new Map<number, Stroke[]>()
    for (const s of this.doc.strokes) {
      if (s.points.length === 0) continue
      const pi = this.pageOfStroke(s)
      const arr = byPage.get(pi)
      if (arr) arr.push(s)
      else byPage.set(pi, [s])
    }

    // Paper sheets with a soft drop shadow. ctx.shadowBlur is very expensive on
    // mobile WebKit, so the shadow is pre-rendered once into a fixed-size sprite
    // and blitted (scaled) here — no per-frame blur, which keeps paging and
    // zooming smooth on device. The white sheet itself is filled directly in
    // device pixels so it stays crisp and can never blank out, regardless of how
    // far the page is zoomed in.
    const sprite = this.ensureShadowSprite()
    const f = sw / this.shadowBaseW // base(fit-zoom) → on-screen scale factor
    const pad = SHADOW_PAD * f
    ctx.setTransform(1, 0, 0, 1, 0, 0) // device pixels
    for (let i = 0; i < n; i++) {
      const left = this.pageScreenLeft(i)
      const top = this.pageScreenTop(i)
      if (left >= this.cssW || left + sw <= 0 || top >= this.cssH || top + sh <= 0) continue
      // Soft drop shadow, scaled from the fixed-size sprite.
      ctx.drawImage(
        sprite,
        Math.round((left - pad) * dpr),
        Math.round((top - pad) * dpr),
        Math.round((sw + pad * 2) * dpr),
        Math.round((sh + pad * 2) * dpr),
      )
      // Crisp white sheet on top of the shadow.
      ctx.fillStyle = PAGE_BG
      ctx.fillRect(Math.round(left * dpr), Math.round(top * dpr), Math.round(sw * dpr), Math.round(sh * dpr))
    }

    // Decor + ink, page by page, each drawn from its own storage origin.
    for (let i = 0; i < n; i++) {
      const left = this.pageScreenLeft(i)
      const top = this.pageScreenTop(i)
      if (left >= this.cssW || left + sw <= 0 || top >= this.cssH || top + sh <= 0) continue
      const storeLeft = this.pageStorageLeft(i)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.translate(left - storeLeft * z, top)
      ctx.scale(z, z)

      this.renderPageDecor(storeLeft)

      ctx.save()
      ctx.beginPath()
      ctx.rect(storeLeft, 0, PAGE_W, PAGE_H)
      ctx.clip()
      for (const s of byPage.get(i) ?? []) {
        ctx.fillStyle = s.color
        ctx.fill(this.pathFor(s, true))
      }
      if (this.drawing && this.drawing.points.length > 0 && this.page === i) {
        ctx.fillStyle = this.drawing.color
        ctx.fill(outlineToPath2D(strokeOutline(this.drawing, false)))
      }
      ctx.restore()
    }

    // Selection / marquee overlay, in the current page's frame.
    const p = this.currentPage()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.translate(
      this.pageScreenLeft(p) - this.pageStorageLeft(p) * z,
      this.pageScreenTop(p),
    )
    ctx.scale(z, z)
    this.renderOverlay()
  }

  /** Faint grid (clipped to the sheet) plus a hairline border, in storage coords. */
  private renderPageDecor(left: number): void {
    const { ctx } = this
    const px = 1 / this.zoom

    if (this.showGrid) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(left, 0, PAGE_W, PAGE_H)
      ctx.clip()
      ctx.strokeStyle = GRID_LINE
      ctx.lineWidth = px
      ctx.beginPath()
      for (let x = GRID_STEP; x < PAGE_W; x += GRID_STEP) {
        ctx.moveTo(left + x, 0)
        ctx.lineTo(left + x, PAGE_H)
      }
      for (let y = GRID_STEP; y < PAGE_H; y += GRID_STEP) {
        ctx.moveTo(left, y)
        ctx.lineTo(left + PAGE_W, y)
      }
      ctx.stroke()
      ctx.restore()
    }

    ctx.strokeStyle = PAGE_BORDER
    ctx.lineWidth = px
    ctx.strokeRect(left, 0, PAGE_W, PAGE_H)
  }

  /** Selection box + marquee rectangle, drawn at constant on-screen weight. */
  private renderOverlay(): void {
    const { ctx } = this
    const px = 1 / this.zoom

    if (this.selection.size > 0) {
      const selected = this.doc.strokes.filter((s) => this.selection.has(s.id))
      const b = unionBounds(selected)
      if (b) {
        ctx.strokeStyle = '#2563eb'
        ctx.lineWidth = 1.5 * px
        ctx.setLineDash([6 * px, 4 * px])
        ctx.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY)
        ctx.setLineDash([])
      }
    }

    if (this.marquee) {
      const { x0, y0, x1, y1 } = this.marquee
      ctx.fillStyle = 'rgba(37,99,235,0.08)'
      ctx.strokeStyle = '#2563eb'
      ctx.lineWidth = 1 * px
      const x = Math.min(x0, x1)
      const y = Math.min(y0, y1)
      const w = Math.abs(x1 - x0)
      const h = Math.abs(y1 - y0)
      ctx.fillRect(x, y, w, h)
      ctx.strokeRect(x, y, w, h)
    }
  }

  // ---------------------------------------------------------------------
  // Mutation + bookkeeping
  // ---------------------------------------------------------------------

  /** Record the current doc into history, persist, and notify React. */
  private commit(): void {
    this.history.push(this.doc)
    this.schedulePersist()
    this.emit()
    this.requestRender()
  }

  private schedulePersist(): void {
    if (this.saveTimer) window.clearTimeout(this.saveTimer)
    this.saveTimer = window.setTimeout(() => {
      void saveDoc(this.canvasId, this.doc)
    }, SAVE_DEBOUNCE_MS)
  }

  private applyDoc(doc: WhiteboardDoc): void {
    this.doc = doc
    this.pathCache.clear()
    // Keep the current page valid if undo/redo changed the page count.
    this.page = clamp(this.page, 0, this.numPages() - 1)
    this.scroll = this.restScroll(this.page)
    this.panX = clampPan(this.panX, PAGE_W * this.zoom, this.cssW)
    this.panY = clampPan(this.panY, PAGE_H * this.zoom, this.cssH)
    // Drop selection ids that no longer exist.
    const ids = new Set(doc.strokes.map((s) => s.id))
    for (const id of this.selection) if (!ids.has(id)) this.selection.delete(id)
    this.schedulePersist()
    this.emit()
    this.requestRender()
  }

  // ---------------------------------------------------------------------
  // Paging: scroll, swipe, pull-to-add
  // ---------------------------------------------------------------------

  /** Apply an absolute horizontal scroll, rubber-banding past either end. */
  private scrollTo(target: number): void {
    const hi = this.restScroll(this.numPages() - 1)
    let pull = 0
    if (target > hi) {
      const raw = target - hi
      this.scroll = hi + Math.min(raw * PULL_DAMP, PULL_MAX_OVERSCROLL)
      pull = clamp(raw / PULL_THRESHOLD, 0, 1)
    } else if (target < 0) {
      this.scroll = -Math.min(-target * PULL_DAMP, PULL_MAX_OVERSCROLL)
    } else {
      this.scroll = target
    }
    if (pull !== this.pullProgress) {
      this.pullProgress = pull
      this.emit()
    }
  }

  /** Resting within-page pan that bounces the view fully back onto the page. */
  private restPanX(): number {
    return restPan(this.panX, PAGE_W * this.zoom, this.cssW)
  }
  private restPanY(): number {
    return restPan(this.panY, PAGE_H * this.zoom, this.cssH)
  }

  /** Settle a pan/swipe: add a page if pulled far enough, else snap to a page
   *  and bounce the view fully back onto it. */
  private endPan(): void {
    // Zoomed in past fit (page larger than the viewport along the paging axis):
    // there's no page to flick to, so keep the user's position — but still bounce
    // any over-pan flush to the page edges so no desk shows through.
    if (this.pageExceedsView()) {
      this.animateCamera(this.scroll, this.restPanX(), this.restPanY())
      return
    }
    // Dragged far enough past the last page → add a new one.
    if (this.pullProgress >= 1) {
      this.pullProgress = 0
      this.addPage()
      return
    }
    const slot = this.slot()
    const base = this.scroll / slot
    let dest: number
    if (Math.abs(this.panV) > SWIPE_VELOCITY) {
      // Flick: advance one page in the swipe direction (left/up flick → next page).
      dest = this.panV < 0 ? Math.floor(base) + 1 : Math.ceil(base) - 1
    } else {
      dest = Math.round(base)
    }
    dest = clamp(dest, 0, this.numPages() - 1)
    if (this.pullProgress !== 0) {
      this.pullProgress = 0
      this.emit()
    }
    this.goToPage(dest)
  }

  /** Append a page and glide it into view. Undoable. */
  private addPage(): void {
    this.doc.pageCount = this.numPages() + 1
    this.page = this.numPages() - 1
    this.commit()
    this.animateCamera(this.restScroll(this.page), this.restPanX(), this.restPanY())
  }

  /** Animate to a given page index, updating the settled page. The page lands
   *  centered along the paging axis and bounced fully onto the page across it. */
  private goToPage(i: number): void {
    const dest = clamp(i, 0, this.numPages() - 1)
    if (dest !== this.page) {
      this.page = dest
      this.emit()
    }
    // restPanX/restPanY return 0 on whichever axis the page fits (the paging
    // axis always fits here, so its within-page pan zeroes out), and clamp flush
    // on an axis that's zoomed larger than the viewport.
    this.animateCamera(this.restScroll(dest), this.restPanX(), this.restPanY())
  }

  /** Tween the camera (paging scroll + within-page pan) to targets with an
   *  easeOutCubic over SNAP_MS, so over-drags spring back onto the page. */
  private animateCamera(scrollT: number, panXT: number, panYT: number): void {
    cancelAnimationFrame(this.animRaf)
    const s0 = this.scroll
    const x0 = this.panX
    const y0 = this.panY
    const ds = scrollT - s0
    const dx = panXT - x0
    const dy = panYT - y0
    if (Math.abs(ds) < 0.5 && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      this.scroll = scrollT
      this.panX = panXT
      this.panY = panYT
      this.requestRender()
      return
    }
    const t0 = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / SNAP_MS)
      const e = 1 - Math.pow(1 - t, 3)
      this.scroll = s0 + ds * e
      this.panX = x0 + dx * e
      this.panY = y0 + dy * e
      this.requestRender()
      if (t < 1 && !this.disposed) this.animRaf = requestAnimationFrame(step)
    }
    this.animRaf = requestAnimationFrame(step)
  }

  // ---------------------------------------------------------------------
  // Pointer input
  // ---------------------------------------------------------------------

  /** Begin a pan/swipe from a screen point (single-finger touch or middle mouse). */
  private beginPan(screen: { x: number; y: number }): void {
    this.panFrom = {
      x: screen.x,
      y: screen.y,
      scroll0: this.scroll,
      panX0: this.panX,
      panY0: this.panY,
      lastAlong: this.vertical ? screen.y : screen.x,
      lastT: performance.now(),
    }
    this.panV = 0
  }

  private onPointerDown = (e: PointerEvent): void => {
    cancelAnimationFrame(this.animRaf) // interrupt any in-flight snap/scroll
    this.cancelWheelSnap()

    // Hard rule: only the Pencil (and desktop mouse) draws. A touch pointer
    // — finger or palm — never enters the drawing pipeline; it can only pan
    // or pinch-zoom. This routing is fixed from the moment the whiteboard
    // mounts, so the very first finger contact after a fresh page load pans
    // the canvas instead of starting a stray stroke.

    // Palm rejection: while a Pencil stroke is in progress, ignore any new
    // touch pointers entirely. Without this, the palm landing on the screen
    // would push pointers.size to 2, cancel the active stroke, and start a
    // phantom pinch-zoom gesture. By bailing here, the touch is never
    // captured and never enters the gesture/pan pipeline.
    if (e.pointerType === 'touch' && this.drawing) {
      return
    }

    // Pen wins: if a Pencil comes down while fingers are panning or
    // gesturing, abandon the finger action and let the Pencil take over.
    // (Common when the user lifts their palm to draw without first lifting
    // the panning finger.)
    if (e.pointerType === 'pen' && this.pointers.size > 0) {
      this.cancelActiveAction()
      for (const id of this.pointers.keys()) {
        if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id)
      }
      this.pointers.clear()
    }
    this.canvas.setPointerCapture(e.pointerId)
    const screen = this.screenOf(e.clientX, e.clientY)
    this.pointers.set(e.pointerId, screen)

    // A second finger cancels the single-pointer action and starts a gesture.
    if (this.pointers.size === 2) {
      this.cancelActiveAction()
      this.beginGesture()
      return
    }
    if (this.pointers.size > 2) return

    // Middle-mouse drags pan/swipe pages (touch panning is handled below).
    if (e.button === 1) {
      this.beginPan(screen)
      return
    }

    // Single-finger touch always pans — fingers never draw, regardless of
    // the active tool. Goodnotes-style: tool selection applies to the
    // Pencil; the finger is reserved for scrolling the board.
    if (e.pointerType === 'touch') {
      // Double-tap with a finger fits + recenters the page ("flip back to the
      // middle" on demand). Two quick taps near the same spot — distinct from a
      // pan (which moves) so it never interferes with scrolling.
      const t = performance.now()
      if (
        t - this.lastTapT < 300 &&
        Math.abs(screen.x - this.lastTapX) < 24 &&
        Math.abs(screen.y - this.lastTapY) < 24
      ) {
        this.lastTapT = 0
        this.fitToPage()
        return
      }
      this.lastTapT = t
      this.lastTapX = screen.x
      this.lastTapY = screen.y
      this.beginPan(screen)
      return
    }

    // Drawing/erasing/selecting act on the settled current page.
    this.page = clamp(Math.round(this.scroll / this.slot()), 0, this.numPages() - 1)
    this.scroll = this.restScroll(this.page)
    const page = this.toPage(e.clientX, e.clientY)

    if (this.tool === 'draw') {
      this.drawing = {
        id: uid(),
        points: [{ x: page.x, y: page.y, p: e.pressure || 0.5 }],
        color: this.color,
        size: this.size,
        pen: e.pointerType === 'pen',
      }
      this.requestRender()
    } else if (this.tool === 'eraser') {
      this.erasing = true
      this.erasedAny = false
      this.eraseAt(page.x, page.y)
    } else if (this.tool === 'select') {
      this.beginSelect(page.x, page.y)
    }
  }

  /** Scribble workaround — see the touchmove listener registration above. */
  private onTouchMove = (e: TouchEvent): void => {
    e.preventDefault()
  }

  // ---------------------------------------------------------------------
  // Eraser cursor — DOM overlay that follows the Pencil tip in eraser mode
  // ---------------------------------------------------------------------

  /** Wire the React-owned cursor element into the engine. Pass `null` to
   * detach. The engine mutates this element's `style` directly to avoid
   * round-tripping every pointer move through React. */
  setEraserCursorEl(el: HTMLElement | null): void {
    this.eraserCursorEl = el
    if (!el) return
    if (this.tool !== 'eraser') this.hideEraserCursor()
  }

  /** Position + show the eraser cursor if (a) the eraser tool is active and
   * (b) the event came from an Apple Pencil. Hide it otherwise. Coordinates
   * are container-relative, matching the canvas element's positioned box. */
  private updateEraserCursor(e: PointerEvent): void {
    const el = this.eraserCursorEl
    if (!el) return
    if (this.tool !== 'eraser' || e.pointerType !== 'pen') {
      this.hideEraserCursor()
      return
    }
    const { x, y } = this.screenOf(e.clientX, e.clientY)
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
    if (el.style.display !== 'block') el.style.display = 'block'
  }

  private hideEraserCursor(): void {
    const el = this.eraserCursorEl
    if (el && el.style.display !== 'none') el.style.display = 'none'
  }

  /** Fires when any pointer leaves the canvas rect — including Pencil hover
   * pulling away on iPadOS 16.4+. Drop the cursor so it doesn't linger at
   * the last hover position once the Pencil is no longer near the screen. */
  private onPointerLeave = (e: PointerEvent): void => {
    if (e.pointerType === 'pen') this.hideEraserCursor()
  }

  private onPointerMove = (e: PointerEvent): void => {
    // Update the eraser cursor regardless of whether this pointer is "active"
    // (in the `pointers` map). On iPadOS 16.4+ the Pencil 2 / Pro fires hover
    // pointermoves with no preceding pointerdown — we still want the cursor
    // to track the tip during hover.
    this.updateEraserCursor(e)
    if (!this.pointers.has(e.pointerId)) return
    const screen = this.screenOf(e.clientX, e.clientY)
    this.pointers.set(e.pointerId, screen)

    if (this.gesture) {
      this.updateGesture()
      return
    }

    if (this.panFrom) {
      const now = performance.now()
      const along = this.vertical ? screen.y : screen.x
      const dt = now - this.panFrom.lastT
      if (dt > 0) this.panV = (along - this.panFrom.lastAlong) / dt
      this.panFrom.lastAlong = along
      this.panFrom.lastT = now
      const dx = screen.x - this.panFrom.x
      const dy = screen.y - this.panFrom.y
      if (this.pageExceedsView()) {
        // Zoomed in past fit: the drag pans within the page on both axes
        // (dragging right/down reveals the left/top edge). Paging is suppressed
        // until you zoom back out.
        this.panX = clampPan(this.panFrom.panX0 + dx, PAGE_W * this.zoom, this.cssW)
        this.panY = clampPan(this.panFrom.panY0 + dy, PAGE_H * this.zoom, this.cssH)
      } else if (this.vertical) {
        // Vertical paging: dragging up (dy < 0) scrolls toward later pages;
        // left/right pans within the page.
        this.panX = clampPan(this.panFrom.panX0 + dx, PAGE_W * this.zoom, this.cssW)
        this.scrollTo(this.panFrom.scroll0 - dy)
      } else {
        // Horizontal paging: dragging left (dx < 0) scrolls toward later pages;
        // up/down pans within the page.
        this.panY = clampPan(this.panFrom.panY0 + dy, PAGE_H * this.zoom, this.cssH)
        this.scrollTo(this.panFrom.scroll0 - dx)
      }
      this.requestRender()
      return
    }

    if (this.drawing) {
      // Coalesced events recover sub-frame samples for smoother fast strokes.
      const raw = e.getCoalescedEvents?.() ?? [e]
      for (const ev of raw) {
        const p = this.toPage(ev.clientX, ev.clientY)
        this.drawing.points.push({ x: p.x, y: p.y, p: ev.pressure || 0.5 })
      }
      this.requestRender()
      return
    }

    if (this.erasing) {
      const p = this.toPage(e.clientX, e.clientY)
      this.eraseAt(p.x, p.y)
      return
    }

    if (this.movingFrom) {
      const p = this.toPage(e.clientX, e.clientY)
      this.moveSelectionBy(p.x - this.movingFrom.x, p.y - this.movingFrom.y)
      this.movingFrom = p
      this.movedAny = true
      return
    }

    if (this.marquee) {
      const p = this.toPage(e.clientX, e.clientY)
      this.marquee.x1 = p.x
      this.marquee.y1 = p.y
      this.requestRender()
    }
  }

  private onPointerUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId)
    if (this.canvas.hasPointerCapture(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId)
    }

    if (this.gesture) {
      // Keep gesturing while two fingers remain; otherwise settle to a page.
      if (this.pointers.size === 2) this.beginGesture()
      else {
        this.gesture = null
        this.endPan()
      }
      return
    }

    if (this.panFrom) {
      this.panFrom = null
      this.endPan()
      return
    }

    if (this.drawing) {
      const stroke = this.drawing
      this.drawing = null
      if (stroke.points.length > 0) {
        // Goodnotes-style scratch-out: a scribble over existing ink erases it
        // instead of being kept as a mark. Falls through to a normal stroke
        // when it isn't a scribble or covers nothing.
        if (this.tryScribbleErase(stroke)) this.commit()
        else {
          this.doc.strokes.push(stroke)
          this.commit()
        }
      }
      return
    }

    if (this.erasing) {
      this.erasing = false
      if (this.erasedAny) this.commit()
      return
    }

    if (this.movingFrom) {
      this.movingFrom = null
      if (this.movedAny) this.commit()
      this.movedAny = false
      return
    }

    if (this.marquee) {
      this.finishMarquee()
    }
  }

  /** Abort whatever single-pointer action is mid-flight (used when a gesture starts). */
  private cancelActiveAction(): void {
    this.drawing = null
    this.erasing = false
    this.erasedAny = false
    this.movingFrom = null
    this.movedAny = false
    this.marquee = null
    this.panFrom = null
    if (this.pullProgress !== 0) {
      this.pullProgress = 0
      this.emit()
    }
    this.requestRender()
  }

  // ---------------------------------------------------------------------
  // Eraser
  // ---------------------------------------------------------------------

  private eraseAt(x: number, y: number): void {
    const radius = 10 / this.zoom
    const before = this.doc.strokes.length
    this.doc.strokes = this.doc.strokes.filter((s) => !strokeHit(s, x, y, radius))
    if (this.doc.strokes.length !== before) {
      this.erasedAny = true
      this.requestRender()
    }
  }

  /**
   * Scratch-to-erase: if `stroke` (a just-finished draw stroke, not yet added to
   * the doc) is a scribble that substantially covers existing strokes, delete
   * those strokes and report true so the caller drops the scribble instead of
   * keeping it. Returns false for ordinary writing or a scribble over blank
   * space, leaving the doc untouched. The mutation is committed (undoable) by
   * the caller.
   */
  private tryScribbleErase(stroke: Stroke): boolean {
    if (!isScribble(stroke.points)) return false
    const sb = strokeBounds(stroke)
    const victims = new Set<string>()
    for (const s of this.doc.strokes) {
      if (s.points.length === 0) continue
      if (!boundsIntersect(sb, strokeBounds(s))) continue
      // How much of THIS stroke does the scribble's spine pass over? Delete it
      // only when most of it is covered, so a scribble grazing a long stroke
      // doesn't wipe the whole thing.
      const radius = s.size / 2 + 6
      let covered = 0
      for (const p of s.points) {
        if (strokeHit(stroke, p.x, p.y, radius)) covered++
      }
      if (covered / s.points.length >= SCRIBBLE_COVER) victims.add(s.id)
    }
    if (victims.size === 0) return false
    this.doc.strokes = this.doc.strokes.filter((s) => !victims.has(s.id))
    for (const id of victims) {
      this.pathCache.delete(id)
      this.selection.delete(id)
    }
    return true
  }

  // ---------------------------------------------------------------------
  // Select tool
  // ---------------------------------------------------------------------

  private beginSelect(x: number, y: number): void {
    const hit = this.topStrokeAt(x, y)
    if (hit) {
      if (!this.selection.has(hit.id)) {
        this.selection = new Set([hit.id])
        this.emit()
      }
      this.movingFrom = { x, y }
      this.movedAny = false
    } else {
      this.selection.clear()
      this.marquee = { x0: x, y0: y, x1: x, y1: y }
      this.emit()
    }
    this.requestRender()
  }

  /** Topmost (last-drawn) stroke under a point, or null. */
  private topStrokeAt(x: number, y: number): Stroke | null {
    const radius = 6 / this.zoom
    for (let i = this.doc.strokes.length - 1; i >= 0; i--) {
      if (strokeHit(this.doc.strokes[i], x, y, radius)) return this.doc.strokes[i]
    }
    return null
  }

  private moveSelectionBy(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return
    for (const s of this.doc.strokes) {
      if (!this.selection.has(s.id)) continue
      for (const pt of s.points) {
        pt.x += dx
        pt.y += dy
      }
      this.pathCache.delete(s.id)
    }
    this.requestRender()
  }

  private finishMarquee(): void {
    if (!this.marquee) return
    const { x0, y0, x1, y1 } = this.marquee
    const box = {
      minX: Math.min(x0, x1),
      minY: Math.min(y0, y1),
      maxX: Math.max(x0, x1),
      maxY: Math.max(y0, y1),
    }
    const picked = new Set<string>()
    for (const s of this.doc.strokes) {
      if (s.points.length > 0 && boundsIntersect(box, strokeBounds(s))) picked.add(s.id)
    }
    this.selection = picked
    this.marquee = null
    this.emit()
    this.requestRender()
  }

  // ---------------------------------------------------------------------
  // Wheel zoom / vertical pan
  // ---------------------------------------------------------------------

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    // ctrl/meta wheel (and trackpad pinch, which arrives as ctrl+wheel) zooms.
    if (e.ctrlKey || e.metaKey) {
      const screen = this.screenOf(e.clientX, e.clientY)
      const factor = Math.exp(-e.deltaY * 0.01)
      this.zoomTo(this.zoom * factor, screen.y, screen.x)
      return
    }
    // Plain wheel: in vertical paging it scrolls between pages (with a debounced
    // snap on settle); otherwise — and whenever zoomed in — it pans vertically
    // within the page.
    if (this.vertical && !this.pageExceedsView()) {
      this.scrollTo(this.scroll + e.deltaY)
      this.scheduleSnap()
    } else {
      this.panY = clampPan(this.panY - e.deltaY, PAGE_H * this.zoom, this.cssH)
    }
    this.requestRender()
  }

  /** Debounced settle after wheel paging stops (vertical mode): snap to the
   *  nearest page, or add one if the user wheeled past the last. */
  private scheduleSnap(): void {
    this.cancelWheelSnap()
    this.wheelSnapTimer = window.setTimeout(() => {
      this.wheelSnapTimer = 0
      this.panV = 0
      this.endPan()
    }, 140)
  }

  private cancelWheelSnap(): void {
    if (this.wheelSnapTimer) {
      window.clearTimeout(this.wheelSnapTimer)
      this.wheelSnapTimer = 0
    }
  }

  /** Zoom to `z`, keeping the page point under (`anchorX`, `anchorY`) fixed. */
  private zoomTo(z: number, anchorY: number, anchorX: number): void {
    const next = clamp(z, this.minZoom(), MAX_ZOOM)
    // Storage point under the anchor, captured before the zoom changes.
    const storeX =
      this.pageStorageLeft(this.page) + (anchorX - this.pageScreenLeft(this.page)) / this.zoom
    const storeY = (anchorY - this.pageScreenTop(this.page)) / this.zoom

    // slot() depends on zoom, so the active page's resting scroll shifts with
    // it. Preserve the current scroll deviation (rest vs. mid-page) so paging
    // state survives the zoom instead of snapping back to centered.
    const slot0 = this.slot()
    this.zoom = next
    this.scroll += this.page * (this.slot() - slot0)

    // Nudge the pans so the anchored page point lands back under the finger.
    const landX =
      this.pageScreenLeft(this.page) + (storeX - this.pageStorageLeft(this.page)) * next
    const landY = this.pageScreenTop(this.page) + storeY * next
    this.panX = clampPan(this.panX + (anchorX - landX), PAGE_W * next, this.cssW)
    this.panY = clampPan(this.panY + (anchorY - landY), PAGE_H * next, this.cssH)
    this.requestRender()
  }

  // ---------------------------------------------------------------------
  // Two-finger gesture (pan + pinch zoom)
  // ---------------------------------------------------------------------

  private beginGesture(): void {
    const [a, b] = [...this.pointers.values()]
    this.gesture = {
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
    }
  }

  private updateGesture(): void {
    if (!this.gesture || this.pointers.size < 2) return
    const [a, b] = [...this.pointers.values()]
    const midX = (a.x + b.x) / 2
    const midY = (a.y + b.y) / 2
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
    const dMidX = midX - this.gesture.midX
    const dMidY = midY - this.gesture.midY

    // Midpoint travel along the paging axis scrolls pages (or pans within a
    // zoomed page); travel along the cross axis pans within the page.
    if (this.pageExceedsView()) {
      this.panX = clampPan(this.panX + dMidX, PAGE_W * this.zoom, this.cssW)
      this.panY = clampPan(this.panY + dMidY, PAGE_H * this.zoom, this.cssH)
    } else if (this.vertical) {
      this.panX = clampPan(this.panX + dMidX, PAGE_W * this.zoom, this.cssW)
      this.scrollTo(this.scroll - dMidY)
    } else {
      this.panY = clampPan(this.panY + dMidY, PAGE_H * this.zoom, this.cssH)
      this.scrollTo(this.scroll - dMidX)
    }
    // Pinch zooms, anchored at the midpoint.
    this.zoomTo((this.zoom * dist) / this.gesture.dist, midY, midX)

    this.gesture = { midX, midY, dist }
  }

  // ---------------------------------------------------------------------
  // Keyboard shortcuts
  // ---------------------------------------------------------------------

  private onKeyDown = (e: KeyboardEvent): void => {
    // Don't hijack typing in the chat box or any other input.
    const el = document.activeElement
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return

    const mod = e.ctrlKey || e.metaKey
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      if (e.shiftKey) this.redo()
      else this.undo()
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault()
      this.redo()
    } else if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault()
      this.duplicateSelected()
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && this.selection.size > 0) {
      e.preventDefault()
      this.deleteSelected()
    } else if (this.vertical ? e.key === 'ArrowDown' : e.key === 'ArrowRight') {
      e.preventDefault()
      this.goToPage(this.page + 1)
    } else if (this.vertical ? e.key === 'ArrowUp' : e.key === 'ArrowLeft') {
      e.preventDefault()
      this.goToPage(this.page - 1)
    }
  }

  // ---------------------------------------------------------------------
  // Public API (consumed by the React layer)
  // ---------------------------------------------------------------------

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const l of this.listeners) l()
  }

  getState(): EngineState {
    return {
      tool: this.tool,
      color: this.color,
      canUndo: this.history.canUndo(),
      canRedo: this.history.canRedo(),
      isEmpty: this.doc.strokes.length === 0,
      hasSelection: this.selection.size > 0,
      pull: this.pullProgress,
      page: this.currentPage(),
      pageCount: this.numPages(),
      vertical: this.vertical,
    }
  }

  setTool(tool: ToolId): void {
    if (this.tool === tool) return
    this.tool = tool
    if (tool !== 'select') this.selection.clear()
    if (tool !== 'eraser') this.hideEraserCursor()
    this.emit()
    this.requestRender()
  }

  /** Toggle the faint grid behind the work. Driven by the Settings screen. */
  setShowGrid(value: boolean): void {
    if (this.showGrid === value) return
    this.showGrid = value
    this.requestRender()
  }

  /**
   * Switch the paging axis (Settings toggle). Re-fits the current page in the
   * new orientation so the camera lands in a clean, predictable state, and
   * notifies React so overlays (e.g. the pull-to-add affordance) reposition.
   */
  setScrollDirection(vertical: boolean): void {
    if (this.vertical === vertical) return
    this.vertical = vertical
    this.cancelWheelSnap()
    cancelAnimationFrame(this.animRaf)
    if (this.pullProgress !== 0) this.pullProgress = 0
    this.fitToPage()
    this.emit()
  }

  /** Set the brush color; also recolors the current selection if any. */
  setColor(color: string): void {
    this.color = color
    if (this.selection.size > 0) {
      for (const s of this.doc.strokes) {
        if (this.selection.has(s.id)) s.color = color
      }
      this.commit()
    } else {
      this.emit()
    }
  }

  undo(): void {
    const doc = this.history.undo()
    if (doc) this.applyDoc(doc)
  }

  redo(): void {
    const doc = this.history.redo()
    if (doc) this.applyDoc(doc)
  }

  deleteSelected(): void {
    if (this.selection.size === 0) return
    this.doc.strokes = this.doc.strokes.filter((s) => !this.selection.has(s.id))
    this.selection.clear()
    this.commit()
  }

  duplicateSelected(): void {
    if (this.selection.size === 0) return
    const copies: Stroke[] = []
    for (const s of this.doc.strokes) {
      if (!this.selection.has(s.id)) continue
      copies.push({
        ...s,
        id: uid(),
        points: s.points.map((p) => ({ x: p.x + 16, y: p.y + 16, p: p.p })),
      })
    }
    this.doc.strokes.push(...copies)
    this.selection = new Set(copies.map((c) => c.id))
    this.commit()
  }

  /** Clear the current page. Undoable. */
  clear(): void {
    const p = this.currentPage()
    const left = this.pageStorageLeft(p)
    const right = left + PAGE_W
    const before = this.doc.strokes.length
    this.doc.strokes = this.doc.strokes.filter((s) => {
      if (s.points.length === 0) return true
      const b = strokeBounds(s)
      const cx = (b.minX + b.maxX) / 2
      return cx < left || cx >= right
    })
    if (this.doc.strokes.length === before) return
    this.selection.clear()
    this.pathCache.clear()
    this.commit()
  }

  /**
   * Delete the page in view: drop its strokes and pull every later page back by
   * one slot so indices stay contiguous. No-op on the last remaining page.
   * Undoable.
   */
  deletePage(): void {
    const n = this.numPages()
    if (n <= 1) return
    const p = this.currentPage()
    const kept: Stroke[] = []
    for (const s of this.doc.strokes) {
      if (s.points.length === 0) continue
      const pi = this.pageOfStroke(s)
      if (pi === p) continue // strokes on the deleted page go away
      if (pi > p) for (const pt of s.points) pt.x -= PAGE_STRIDE // close the gap
      kept.push(s)
    }
    this.doc.strokes = kept
    this.doc.pageCount = n - 1
    this.page = clamp(p, 0, this.numPages() - 1)
    this.scroll = this.restScroll(this.page)
    this.selection.clear()
    this.pathCache.clear() // shifted coordinates invalidate cached paths
    this.commit()
  }

  isEmpty(): boolean {
    return this.doc.strokes.length === 0
  }

  /**
   * Export the board as a PNG blob — replaces tldraw's `editor.toImage()`.
   * Only the page in view is captured, so Check Work / thumbnails reflect the
   * sheet the user is actually looking at.
   */
  toImage(opts: ExportOptions): Promise<Blob | null> {
    if (this.numPages() <= 1) return exportPng(this.doc.strokes, opts)
    const left = this.pageStorageLeft(this.currentPage())
    const right = left + PAGE_W
    const onPage = this.doc.strokes.filter((s) => {
      if (s.points.length === 0) return false
      const b = strokeBounds(s)
      const cx = (b.minX + b.maxX) / 2
      return cx >= left && cx < right
    })
    return exportPng(onPage, opts)
  }

  destroy(): void {
    this.disposed = true
    cancelAnimationFrame(this.rafId)
    cancelAnimationFrame(this.animRaf)
    this.cancelWheelSnap()
    if (this.saveTimer) {
      window.clearTimeout(this.saveTimer)
      // Flush a final write so the last strokes aren't lost on unmount.
      void saveDoc(this.canvasId, this.doc)
    }
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerUp)
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave)
    this.canvas.removeEventListener('wheel', this.onWheel)
    this.canvas.removeEventListener('touchmove', this.onTouchMove)
    window.removeEventListener('keydown', this.onKeyDown)
    this.listeners.clear()
  }
}
