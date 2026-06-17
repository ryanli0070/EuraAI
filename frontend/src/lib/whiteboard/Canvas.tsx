/**
 * React wrapper around WhiteboardEngine.
 *
 * Loads the canvas's drawing from IndexedDB, constructs the engine, keeps it
 * sized to its container, and hands the engine instance back via `onMount` —
 * the same pattern tldraw's `<Tldraw onMount={...}>` used, so the surrounding
 * Whiteboard component changes as little as possible.
 */
import { useEffect, useRef } from 'react'
import { WhiteboardEngine } from './engine'
import { downloadBackground, loadDoc } from './persistence'

/**
 * Resolve every imported page background to a decoded bitmap and hand it to the
 * engine. Images come down as Blobs via the SDK and are wrapped in object URLs
 * so the canvas they're drawn onto stays same-origin (untainted) for export.
 * `isCancelled` lets the caller bail if the canvas unmounts mid-load.
 */
async function loadBackgrounds(engine: WhiteboardEngine, isCancelled: () => boolean): Promise<void> {
  for (const bg of engine.pageBackgrounds()) {
    const blob = await downloadBackground(bg.path)
    if (isCancelled() || !blob) continue
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      if (!isCancelled()) engine.setPageBackgroundImage(bg.page, img)
    }
    img.onerror = () => URL.revokeObjectURL(url)
    img.src = url
  }
}

export function Canvas({
  canvasId,
  onMount,
}: {
  canvasId: string
  onMount?: (engine: WhiteboardEngine) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const eraserCursorRef = useRef<HTMLDivElement | null>(null)
  // Keep the latest onMount without making the effect depend on it.
  const onMountRef = useRef(onMount)
  onMountRef.current = onMount

  useEffect(() => {
    const container = containerRef.current
    const canvasEl = canvasRef.current
    if (!container || !canvasEl) return

    let engine: WhiteboardEngine | null = null
    let observer: ResizeObserver | null = null
    let cancelled = false

    void loadDoc(canvasId).then((doc) => {
      if (cancelled) return
      engine = new WhiteboardEngine(canvasEl, canvasId, doc)
      engine.setEraserCursorEl(eraserCursorRef.current)
      const rect = container.getBoundingClientRect()
      engine.resize(rect.width, rect.height)

      observer = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect
        engine?.resize(width, height)
      })
      observer.observe(container)

      onMountRef.current?.(engine)
      void loadBackgrounds(engine, () => cancelled)
    })

    return () => {
      cancelled = true
      observer?.disconnect()
      engine?.destroy()
    }
  }, [canvasId])

  return (
    <div ref={containerRef} className="absolute inset-0" style={{ backgroundColor: '#e9e7e0' }}>
      <canvas ref={canvasRef} className="block" />
      {/* Eraser cursor — a ring that follows the Pencil tip when the eraser
          tool is active. Lives in the DOM (not on the canvas) so moving it
          doesn't trigger a canvas re-render. Hidden by default; the engine
          toggles `display` and sets `transform` directly on this element. */}
      <div
        ref={eraserCursorRef}
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          top: 0,
          left: 0,
          width: 20,
          height: 20,
          borderRadius: '50%',
          border: '1.5px solid rgba(0, 0, 0, 0.45)',
          backgroundColor: 'rgba(255, 255, 255, 0.15)',
          boxShadow: '0 0 0 0.5px rgba(255, 255, 255, 0.7) inset',
          display: 'none',
          willChange: 'transform',
        }}
      />
    </div>
  )
}
