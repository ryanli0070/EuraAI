/**
 * WhiteboardEngine — the canvas drawing engine that replaces tldraw.
 *
 * Owns the document, a paged camera, tools, input handling, render loop,
 * history, and debounced persistence. React touches it only through the small
 * public API at the bottom (`subscribe`, `setTool`, `undo`, `toImage`, …).
 *
 * Paging model (GoodNotes-style): pages are isolated — exactly one sheet is
 * shown at rest, with the next/previous a full viewport away. Horizontal drags
 * scroll between pages and snap on release; a swipe flicks to the neighbour.
 * Dragging past the last page and releasing creates a new one. Vertical pan and
 * zoom stay free within a page. Strokes are stored in a wide page-coordinate
 * space (page `i` lives near x = i·STRIDE) and each page is drawn from its own
 * origin, so on-screen isolation doesn't depend on the screen size.
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
const DEFAULT_SIZE = 6
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

const DESK_BG = '#e9e7e0'
const PAGE_BG = '#ffffff'
const PAGE_SHADOW = 'rgba(24,36,63,0.20)'
const PAGE_BORDER = 'rgba(24,36,63,0.12)'
const GRID_LINE = 'rgba(60,90,150,0.10)'

function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 's_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/**
 * Constrain a vertical translation so the page stays in view: rests centered
 * (with a little wiggle) when it fits, pans freely when taller than the screen.
 */
function clampAxis(cam: number, viewport: number, page: number): number {
  if (page <= viewport) {
    const center = (viewport - page) / 2
    return clamp(cam, center - PAN_WIGGLE, center + PAN_WIGGLE)
  }
  return clamp(cam, viewport - page - PAN_WIGGLE, PAN_WIGGLE)
}

type Listener = () => void

export class WhiteboardEngine {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private canvasId: string
  private dpr = 1
  private cssW = 0
  private cssH = 0

  private doc: WhiteboardDoc
  private history: History

  // Paged camera: `zoom` scales, `offsetY` is the page's screen-space top,
  // `scrollX` is the horizontal paging position (rest = page·slot), and `page`
  // is the settled page index.
  private zoom = 1
  private offsetY = 0
  private scrollX = 0
  private page = 0

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

  // Transient interaction state.
  private drawing: Stroke | null = null
  private erasing = false
  private erasedAny = false
  private movingFrom: { x: number; y: number } | null = null
  private movedAny = false
  private marquee: { x0: number; y0: number; x1: number; y1: number } | null = null
  private panFrom:
    | { x: number; y: number; scrollX0: number; offsetY0: number; lastX: number; lastT: number }
    | null = null
  private panVX = 0 // horizontal pointer velocity (px/ms), for swipe detection

  // Multi-touch gesture state (two-finger pan + pinch zoom).
  private pointers = new Map<number, { x: number; y: number }>()
  private gesture: { midX: number; midY: number; dist: number } | null = null

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
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
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

  /** Width (screen px) of one paging slot — a full viewport plus a gutter. */
  private slotW(): number {
    return this.cssW + SLOT_GUTTER
  }

  /** Resting `scrollX` that centers page `i`. */
  private restScroll(i: number): number {
    return i * this.slotW()
  }

  /** Screen-space left edge of page `i`'s sheet at the current scroll/zoom. */
  private pageScreenLeft(i: number): number {
    return this.cssW / 2 - (this.scrollX - i * this.slotW()) - (PAGE_W * this.zoom) / 2
  }

  /** Which page a stroke belongs to, by the x of its center. */
  private pageOfStroke(s: Stroke): number {
    const b = strokeBounds(s)
    const cx = (b.minX + b.maxX) / 2
    return clamp(Math.round(cx / PAGE_STRIDE), 0, this.numPages() - 1)
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
    return {
      x: this.pageStorageLeft(this.page) + (sx - left) / this.zoom,
      y: (sy - this.offsetY) / this.zoom,
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
      // Slot width tracks the viewport — re-center the current page and clamp.
      this.scrollX = this.restScroll(this.page)
      this.offsetY = clampAxis(this.offsetY, this.cssH, PAGE_H * this.zoom)
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
    this.offsetY = (this.cssH - PAGE_H * this.zoom) / 2
    this.scrollX = this.restScroll(this.page)
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

  private render(): void {
    const { ctx, dpr } = this
    const z = this.zoom
    const n = this.numPages()
    const sw = PAGE_W * z
    const sh = PAGE_H * z
    const top = this.offsetY

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

    // Paper sheets with a soft drop shadow — screen space for a crisp shadow.
    ctx.save()
    ctx.shadowColor = PAGE_SHADOW
    ctx.shadowBlur = 28
    ctx.shadowOffsetY = 10
    ctx.fillStyle = PAGE_BG
    for (let i = 0; i < n; i++) {
      const left = this.pageScreenLeft(i)
      if (left >= this.cssW || left + sw <= 0) continue
      ctx.fillRect(left, top, sw, sh)
    }
    ctx.restore()

    // Decor + ink, page by page, each drawn from its own storage origin.
    for (let i = 0; i < n; i++) {
      const left = this.pageScreenLeft(i)
      if (left >= this.cssW || left + sw <= 0) continue
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
    ctx.translate(this.pageScreenLeft(p) - this.pageStorageLeft(p) * z, top)
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
    this.scrollX = this.restScroll(this.page)
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
      this.scrollX = hi + Math.min(raw * PULL_DAMP, PULL_MAX_OVERSCROLL)
      pull = clamp(raw / PULL_THRESHOLD, 0, 1)
    } else if (target < 0) {
      this.scrollX = -Math.min(-target * PULL_DAMP, PULL_MAX_OVERSCROLL)
    } else {
      this.scrollX = target
    }
    if (pull !== this.pullProgress) {
      this.pullProgress = pull
      this.emit()
    }
  }

  /** Settle a pan/swipe: add a page if pulled far enough, else snap to a page. */
  private endPan(): void {
    if (this.pullProgress >= 1) {
      this.pullProgress = 0
      this.addPage()
      return
    }
    const slot = this.slotW()
    const base = this.scrollX / slot
    let dest: number
    if (Math.abs(this.panVX) > SWIPE_VELOCITY) {
      // Flick: advance one page in the swipe direction (left flick → next page).
      dest = this.panVX < 0 ? Math.floor(base) + 1 : Math.ceil(base) - 1
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
    this.animateScrollTo(this.restScroll(this.page))
  }

  /** Animate to a given page index, updating the settled page. */
  private goToPage(i: number): void {
    const dest = clamp(i, 0, this.numPages() - 1)
    if (dest !== this.page) {
      this.page = dest
      this.emit()
    }
    this.animateScrollTo(this.restScroll(dest))
  }

  /** Tween scrollX to a target with an easeOutCubic over SNAP_MS. */
  private animateScrollTo(target: number): void {
    cancelAnimationFrame(this.animRaf)
    const start = this.scrollX
    if (Math.abs(target - start) < 0.5) {
      this.scrollX = target
      this.requestRender()
      return
    }
    const t0 = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / SNAP_MS)
      const e = 1 - Math.pow(1 - t, 3)
      this.scrollX = start + (target - start) * e
      this.requestRender()
      if (t < 1 && !this.disposed) this.animRaf = requestAnimationFrame(step)
    }
    this.animRaf = requestAnimationFrame(step)
  }

  // ---------------------------------------------------------------------
  // Pointer input
  // ---------------------------------------------------------------------

  private onPointerDown = (e: PointerEvent): void => {
    cancelAnimationFrame(this.animRaf) // interrupt any in-flight snap/scroll
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

    // Space/middle-mouse or the Hand tool pans/swipes pages.
    if (e.button === 1 || this.tool === 'hand') {
      this.panFrom = {
        x: screen.x,
        y: screen.y,
        scrollX0: this.scrollX,
        offsetY0: this.offsetY,
        lastX: screen.x,
        lastT: performance.now(),
      }
      this.panVX = 0
      return
    }

    // Drawing/erasing/selecting act on the settled current page.
    this.page = clamp(Math.round(this.scrollX / this.slotW()), 0, this.numPages() - 1)
    this.scrollX = this.restScroll(this.page)
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

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return
    const screen = this.screenOf(e.clientX, e.clientY)
    this.pointers.set(e.pointerId, screen)

    if (this.gesture) {
      this.updateGesture()
      return
    }

    if (this.panFrom) {
      const now = performance.now()
      const dt = now - this.panFrom.lastT
      if (dt > 0) this.panVX = (screen.x - this.panFrom.lastX) / dt
      this.panFrom.lastX = screen.x
      this.panFrom.lastT = now
      this.offsetY = clampAxis(
        this.panFrom.offsetY0 + (screen.y - this.panFrom.y),
        this.cssH,
        PAGE_H * this.zoom,
      )
      // Dragging left (screen.x decreasing) scrolls toward later pages.
      this.scrollTo(this.panFrom.scrollX0 + (this.panFrom.x - screen.x))
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
      if (this.drawing.points.length > 0) {
        this.doc.strokes.push(this.drawing)
        this.drawing = null
        this.commit()
      } else {
        this.drawing = null
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
    // ctrl/meta wheel (and trackpad pinch, which arrives as ctrl+wheel) zooms;
    // a plain wheel pans vertically within the page.
    if (e.ctrlKey || e.metaKey) {
      const screen = this.screenOf(e.clientX, e.clientY)
      const factor = Math.exp(-e.deltaY * 0.01)
      this.zoomTo(this.zoom * factor, screen.y)
    } else {
      this.offsetY = clampAxis(this.offsetY - e.deltaY, this.cssH, PAGE_H * this.zoom)
      this.requestRender()
    }
  }

  /** Zoom to `z`, keeping the page point under `anchorY` fixed; stays centered. */
  private zoomTo(z: number, anchorY: number): void {
    const next = clamp(z, this.minZoom(), MAX_ZOOM)
    const pageY = (anchorY - this.offsetY) / this.zoom
    this.zoom = next
    this.offsetY = clampAxis(anchorY - pageY * next, this.cssH, PAGE_H * next)
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

    // Horizontal midpoint shift scrolls pages; vertical pans within the page.
    this.scrollTo(this.scrollX - (midX - this.gesture.midX))
    this.offsetY = clampAxis(
      this.offsetY + (midY - this.gesture.midY),
      this.cssH,
      PAGE_H * this.zoom,
    )
    // Pinch zooms, anchored vertically at the midpoint.
    this.zoomTo((this.zoom * dist) / this.gesture.dist, midY)

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
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      this.goToPage(this.page + 1)
    } else if (e.key === 'ArrowLeft') {
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
    }
  }

  setTool(tool: ToolId): void {
    if (this.tool === tool) return
    this.tool = tool
    if (tool !== 'select') this.selection.clear()
    this.emit()
    this.requestRender()
  }

  /** Toggle the faint grid behind the work. Driven by the Settings screen. */
  setShowGrid(value: boolean): void {
    if (this.showGrid === value) return
    this.showGrid = value
    this.requestRender()
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
    this.scrollX = this.restScroll(this.page)
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
    if (this.saveTimer) {
      window.clearTimeout(this.saveTimer)
      // Flush a final write so the last strokes aren't lost on unmount.
      void saveDoc(this.canvasId, this.doc)
    }
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerUp)
    this.canvas.removeEventListener('wheel', this.onWheel)
    window.removeEventListener('keydown', this.onKeyDown)
    this.listeners.clear()
  }
}
