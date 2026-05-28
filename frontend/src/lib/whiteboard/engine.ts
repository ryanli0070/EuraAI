/**
 * WhiteboardEngine — the canvas drawing engine that replaces tldraw.
 *
 * Owns the document, camera, tools, input handling, render loop, history, and
 * debounced persistence. React touches it only through the small public API
 * at the bottom (`subscribe`, `setTool`, `undo`, `toImage`, …); everything
 * else is internal.
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
import type { Camera, EngineState, Stroke, ToolId, WhiteboardDoc } from './types'

const MIN_ZOOM = 0.1
const MAX_ZOOM = 8
const DEFAULT_COLOR = '#1d1d1d'
const DEFAULT_SIZE = 4
const SAVE_DEBOUNCE_MS = 600

function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 's_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
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
  private camera: Camera = { x: 0, y: 0, z: 1 }

  private tool: ToolId = 'draw'
  private color = DEFAULT_COLOR
  private size = DEFAULT_SIZE
  private selection = new Set<string>()

  // Transient interaction state.
  private drawing: Stroke | null = null
  private erasing = false
  private erasedAny = false
  private movingFrom: { x: number; y: number } | null = null
  private movedAny = false
  private marquee: { x0: number; y0: number; x1: number; y1: number } | null = null
  private panFrom: { x: number; y: number; camX: number; camY: number } | null = null

  // Multi-touch gesture state (two-finger pan + pinch zoom).
  private pointers = new Map<number, { x: number; y: number }>()
  private gesture: { midX: number; midY: number; dist: number } | null = null

  // Goodnotes-style pen mode: the first time we see an Apple Pencil event in
  // this session, latch into pen mode. From then on, fingers only pan/zoom —
  // they never draw — and palm contacts that land while a Pencil stroke is in
  // progress are rejected entirely. Resets on page reload.
  private penMode = false

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
  // Coordinate helpers
  // ---------------------------------------------------------------------

  /** Pointer client coords → page coords (the space strokes are stored in). */
  private toPage(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect()
    const sx = clientX - rect.left
    const sy = clientY - rect.top
    return {
      x: (sx - this.camera.x) / this.camera.z,
      y: (sy - this.camera.y) / this.camera.z,
    }
  }

  private screenOf(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  // ---------------------------------------------------------------------
  // Sizing / render loop
  // ---------------------------------------------------------------------

  resize(cssW: number, cssH: number): void {
    this.dpr = window.devicePixelRatio || 1
    this.cssW = cssW
    this.cssH = cssH
    this.canvas.width = Math.max(1, Math.round(cssW * this.dpr))
    this.canvas.height = Math.max(1, Math.round(cssH * this.dpr))
    this.canvas.style.width = `${cssW}px`
    this.canvas.style.height = `${cssH}px`
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
    const { ctx, dpr, camera } = this
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, this.cssW, this.cssH)
    ctx.translate(camera.x, camera.y)
    ctx.scale(camera.z, camera.z)

    for (const stroke of this.doc.strokes) {
      if (stroke.points.length === 0) continue
      ctx.fillStyle = stroke.color
      ctx.fill(this.pathFor(stroke, true))
    }

    // In-progress stroke isn't in the doc yet — render it live, uncached.
    if (this.drawing && this.drawing.points.length > 0) {
      ctx.fillStyle = this.drawing.color
      ctx.fill(outlineToPath2D(strokeOutline(this.drawing, false)))
    }

    this.renderOverlay()
  }

  /** Selection box + marquee rectangle, drawn at constant on-screen weight. */
  private renderOverlay(): void {
    const { ctx, camera } = this
    const px = 1 / camera.z

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
    // Drop selection ids that no longer exist.
    const ids = new Set(doc.strokes.map((s) => s.id))
    for (const id of this.selection) if (!ids.has(id)) this.selection.delete(id)
    this.schedulePersist()
    this.emit()
    this.requestRender()
  }

  // ---------------------------------------------------------------------
  // Pointer input
  // ---------------------------------------------------------------------

  private onPointerDown = (e: PointerEvent): void => {
    // Sticky pen-mode latch. Once the user ever uses the Pencil, fingers
    // become pan/zoom only for the rest of the session — same UX as Goodnotes
    // and Excalidraw. iPad Safari does not flag touches as "palm", so the
    // only reliable separation is by pointerType.
    if (e.pointerType === 'pen') this.penMode = true

    // Palm rejection: while a Pencil stroke is in progress, ignore any new
    // touch pointers entirely. This is the core fix — without it, the palm
    // landing on the screen would push pointers.size to 2, cancel the active
    // stroke, and start a phantom pinch-zoom gesture. By bailing here, the
    // touch is never captured and never enters the gesture/pan pipeline.
    if (this.penMode && e.pointerType === 'touch' && this.drawing) {
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

    const page = this.toPage(e.clientX, e.clientY)

    // Space/middle-mouse always pans, regardless of the active tool.
    if (e.button === 1 || this.tool === 'hand') {
      this.panFrom = { x: screen.x, y: screen.y, camX: this.camera.x, camY: this.camera.y }
      return
    }

    // In pen mode, single-finger touch always pans — fingers never draw,
    // regardless of the active tool. This is Goodnotes-style: tool selection
    // applies to the Pencil; the finger is reserved for scrolling the board.
    if (this.penMode && e.pointerType === 'touch') {
      this.panFrom = { x: screen.x, y: screen.y, camX: this.camera.x, camY: this.camera.y }
      return
    }

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
      this.camera.x = this.panFrom.camX + (screen.x - this.panFrom.x)
      this.camera.y = this.panFrom.camY + (screen.y - this.panFrom.y)
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
      // Keep gesturing only while two fingers remain down.
      if (this.pointers.size === 2) this.beginGesture()
      else this.gesture = null
      return
    }

    if (this.panFrom) {
      this.panFrom = null
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
    this.requestRender()
  }

  // ---------------------------------------------------------------------
  // Eraser
  // ---------------------------------------------------------------------

  private eraseAt(x: number, y: number): void {
    const radius = 10 / this.camera.z
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
    const radius = 6 / this.camera.z
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
  // Wheel zoom / pan
  // ---------------------------------------------------------------------

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    // ctrl/meta wheel (and trackpad pinch, which arrives as ctrl+wheel) zooms;
    // a plain wheel pans the canvas.
    if (e.ctrlKey || e.metaKey) {
      const screen = this.screenOf(e.clientX, e.clientY)
      const factor = Math.exp(-e.deltaY * 0.01)
      this.zoomTo(this.camera.z * factor, screen.x, screen.y)
    } else {
      this.camera.x -= e.deltaX
      this.camera.y -= e.deltaY
      this.requestRender()
    }
  }

  /** Zoom to `z`, keeping the page point under (anchorX, anchorY) fixed. */
  private zoomTo(z: number, anchorX: number, anchorY: number): void {
    const next = clamp(z, MIN_ZOOM, MAX_ZOOM)
    const pageX = (anchorX - this.camera.x) / this.camera.z
    const pageY = (anchorY - this.camera.y) / this.camera.z
    this.camera.z = next
    this.camera.x = anchorX - pageX * next
    this.camera.y = anchorY - pageY * next
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

    // Pan by the midpoint shift.
    this.camera.x += midX - this.gesture.midX
    this.camera.y += midY - this.gesture.midY
    // Zoom by the pinch ratio, anchored at the midpoint.
    this.zoomTo((this.camera.z * dist) / this.gesture.dist, midX, midY)

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

  /** Clear the whole board. Undoable. */
  clear(): void {
    if (this.doc.strokes.length === 0) return
    this.doc.strokes = []
    this.selection.clear()
    this.pathCache.clear()
    this.commit()
  }

  isEmpty(): boolean {
    return this.doc.strokes.length === 0
  }

  /** Export the board as a PNG blob — replaces tldraw's `editor.toImage()`. */
  toImage(opts: ExportOptions): Promise<Blob | null> {
    return exportPng(this.doc.strokes, opts)
  }

  destroy(): void {
    this.disposed = true
    cancelAnimationFrame(this.rafId)
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
