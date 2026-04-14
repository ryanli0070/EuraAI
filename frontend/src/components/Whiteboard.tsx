import { useCallback, useRef, useState } from 'react'
import { Editor, Tldraw } from 'tldraw'
import 'tldraw/tldraw.css'

type CheckStatus = 'idle' | 'checking' | 'done' | 'error'

export function Whiteboard() {
  const editorRef = useRef<Editor | null>(null)
  const [status, setStatus] = useState<CheckStatus>('idle')
  const [lastBlobInfo, setLastBlobInfo] = useState<string | null>(null)

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor
  }, [])

  const handleCheckWork = useCallback(async () => {
    const editor = editorRef.current
    if (!editor) return

    setStatus('checking')
    try {
      const shapeIds = Array.from(editor.getCurrentPageShapeIds())
      if (shapeIds.length === 0) {
        setLastBlobInfo('Canvas is empty — draw something first.')
        setStatus('error')
        return
      }

      const { blob } = await editor.toImage(shapeIds, {
        format: 'png',
        background: true,
        padding: 32,
        scale: 2,
      })

      setLastBlobInfo(
        `Captured ${(blob.size / 1024).toFixed(1)} KB PNG (${blob.type})`,
      )
      setStatus('done')
      // TODO(phase 2): POST blob to /api/check
      console.log('[EuraAI] captured blob', blob)
    } catch (err) {
      console.error('[EuraAI] capture failed', err)
      setLastBlobInfo(err instanceof Error ? err.message : 'Unknown error')
      setStatus('error')
    }
  }, [])

  return (
    <div className="fixed inset-0">
      <Tldraw onMount={handleMount} />

      <button
        onClick={handleCheckWork}
        disabled={status === 'checking'}
        className="absolute bottom-6 right-6 z-[999] rounded-full bg-violet-600 px-6 py-4 text-base font-semibold text-white shadow-lg transition-transform active:scale-95 disabled:opacity-60"
        style={{ touchAction: 'manipulation' }}
      >
        {status === 'checking' ? 'Checking…' : 'Check Work'}
      </button>

      {lastBlobInfo && (
        <div
          className={`absolute bottom-24 right-6 z-[999] max-w-xs rounded-lg px-4 py-3 text-sm shadow-md ${
            status === 'error'
              ? 'bg-red-50 text-red-800'
              : 'bg-white text-neutral-700'
          }`}
        >
          {lastBlobInfo}
        </div>
      )}
    </div>
  )
}
