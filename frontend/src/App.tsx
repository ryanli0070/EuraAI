import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthScreen } from './components/AuthScreen'
import { CanvasMenu } from './components/CanvasMenu'
import { Whiteboard } from './components/Whiteboard'
import { useSession } from './lib/auth'
import { initShareImport } from './lib/shareImport'
import type { ImportProgress } from './lib/import'

type SlideDir = 'forward' | 'backward' | null

function App() {
  const { session, loading } = useSession()
  if (loading) return null
  if (!session) return <AuthScreen />
  return <AppShell />
}

function AppShell() {
  // null = menu is the active surface; string = open that canvas.
  const [activeId, setActiveId] = useState<string | null>(null)
  const [slideDir, setSlideDir] = useState<SlideDir>(null)
  // The canvas being animated *out* — kept rendered through the slide.
  const [departingId, setDepartingId] = useState<string | null>(null)
  // Non-null while a file shared into Eura (iOS "Open in Eura") is importing.
  const [shareImporting, setShareImporting] = useState<ImportProgress | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const openCanvas = useCallback((id: string) => {
    setSlideDir('forward')
    setActiveId(id)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setSlideDir(null)
    }, 400)
  }, [])

  // Receive PDFs/photos shared into the app and open the imported canvas.
  useEffect(() => {
    return initShareImport({
      onStart: () => setShareImporting({ phase: 'rendering', done: 0, total: 1 }),
      onProgress: setShareImporting,
      onDone: (id) => {
        setShareImporting(null)
        if (id) openCanvas(id)
      },
    })
  }, [openCanvas])

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

      {shareImporting && <ShareImportOverlay progress={shareImporting} />}
    </div>
  )
}

/** Full-screen "importing…" veil shown while a shared file is being brought in. */
function ShareImportOverlay({ progress }: { progress: ImportProgress }) {
  const pct = Math.round((progress.done / Math.max(1, progress.total)) * 100)
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', inset: 0, zIndex: 400, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(24,36,63,0.32)',
        fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          background: '#fff', border: '1.5px solid #18243f', borderRadius: 12,
          padding: '22px 26px', minWidth: 260, textAlign: 'center',
          boxShadow: '6px 10px 0 rgba(24,36,63,0.16)',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 15, color: '#18243f', marginBottom: 12 }}>
          {progress.phase === 'rendering' ? 'Reading your file…' : 'Importing into Eura…'}
        </div>
        <div style={{ height: 6, borderRadius: 3, background: '#efe8d6', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#2d5ad9', transition: 'width .2s ease' }} />
        </div>
      </div>
    </div>
  )
}

export default App
