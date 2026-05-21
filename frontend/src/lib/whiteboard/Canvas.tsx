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
import { loadDoc } from './persistence'

export function Canvas({
  canvasId,
  onMount,
}: {
  canvasId: string
  onMount?: (engine: WhiteboardEngine) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
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
      const rect = container.getBoundingClientRect()
      engine.resize(rect.width, rect.height)

      observer = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect
        engine?.resize(width, height)
      })
      observer.observe(container)

      onMountRef.current?.(engine)
    })

    return () => {
      cancelled = true
      observer?.disconnect()
      engine?.destroy()
    }
  }, [canvasId])

  return (
    <div ref={containerRef} className="absolute inset-0 bg-white">
      <canvas ref={canvasRef} className="block" />
    </div>
  )
}
