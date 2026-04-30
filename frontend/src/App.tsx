import { useCallback, useRef, useState } from 'react'
import { CanvasMenu } from './components/CanvasMenu'
import { Whiteboard } from './components/Whiteboard'

type SlideDir = 'forward' | 'backward' | null

function App() {
  // null = menu is the active surface; string = open that canvas.
  const [activeId, setActiveId] = useState<string | null>(null)
  const [slideDir, setSlideDir] = useState<SlideDir>(null)
  // The canvas being animated *out* — kept rendered through the slide.
  const [departingId, setDepartingId] = useState<string | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const openCanvas = useCallback((id: string) => {
    setSlideDir('forward')
    setActiveId(id)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setSlideDir(null)
    }, 400)
  }, [])

  const closeCanvas = useCallback(() => {
    setSlideDir('backward')
    setDepartingId(activeId)
    setActiveId(null)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setSlideDir(null)
      setDepartingId(null)
    }, 400)
  }, [activeId])

  // Menu is the "left" panel; whiteboard is the "right" panel.
  const showWhiteboard = activeId !== null || departingId !== null
  const renderedCanvasId = activeId ?? departingId

  const menuX =
    slideDir === 'forward' ? '-100%' :
    slideDir === 'backward' ? '0%' :
    activeId !== null ? '-100%' : '0%'

  const whiteboardX =
    slideDir === 'forward' ? '0%' :
    slideDir === 'backward' ? '100%' :
    activeId !== null ? '0%' : '100%'

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div
        className="absolute inset-0 overflow-y-auto transition-transform duration-400 ease-in-out"
        style={{ transform: `translateX(${menuX})` }}
      >
        <CanvasMenu onOpenCanvas={openCanvas} />
      </div>

      <div
        className="absolute inset-0 transition-transform duration-400 ease-in-out"
        style={{ transform: `translateX(${whiteboardX})` }}
      >
        {showWhiteboard && renderedCanvasId && (
          <Whiteboard canvasId={renderedCanvasId} onHome={closeCanvas} />
        )}
      </div>
    </div>
  )
}

export default App
