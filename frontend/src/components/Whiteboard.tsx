import { useCallback, useMemo, useRef, useState } from 'react'
import { Editor, Tldraw } from 'tldraw'
import 'tldraw/tldraw.css'
import katex from 'katex'

type CheckStatus = 'idle' | 'checking' | 'ok' | 'all_correct' | 'no_math' | 'error'

type CheckResponse = {
  latex: string
  hint: string
  step_index: number
  status: 'ok' | 'all_correct' | 'no_math' | 'error'
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export function Whiteboard() {
  const editorRef = useRef<Editor | null>(null)
  const [status, setStatus] = useState<CheckStatus>('idle')
  const [hint, setHint] = useState<string>('')

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor
  }, [])

  const handleCheckWork = useCallback(async () => {
    const editor = editorRef.current
    if (!editor) return

    setStatus('checking')
    setHint('')
    try {
      const shapeIds = Array.from(editor.getCurrentPageShapeIds())
      if (shapeIds.length === 0) {
        setHint('Canvas is empty — draw something first.')
        setStatus('no_math')
        return
      }

      const { blob } = await editor.toImage(shapeIds, {
        format: 'png',
        background: true,
        padding: 32,
        scale: 2,
      })

      const formData = new FormData()
      formData.append('file', blob, 'capture.png')

      const res = await fetch(`${API_BASE_URL}/api/check`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        throw new Error(`Server responded ${res.status}`)
      }
      const data = (await res.json()) as CheckResponse

      setHint(data.hint)
      setStatus(data.status)
    } catch (err) {
      console.error('[EuraAI] check failed', err)
      setHint(err instanceof Error ? err.message : 'Unknown error')
      setStatus('error')
    }
  }, [])

  const dismiss = useCallback(() => {
    setStatus('idle')
    setHint('')
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

      <Callout status={status} hint={hint} onDismiss={dismiss} />
    </div>
  )
}

function Callout({
  status,
  hint,
  onDismiss,
}: {
  status: CheckStatus
  hint: string
  onDismiss: () => void
}) {
  if (status === 'idle' || status === 'checking') return null

  const tone =
    status === 'all_correct'
      ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
      : status === 'error'
        ? 'bg-red-50 text-red-900 border-red-200'
        : status === 'no_math'
          ? 'bg-amber-50 text-amber-900 border-amber-200'
          : 'bg-white text-neutral-800 border-neutral-200'

  const title =
    status === 'all_correct'
      ? 'Looks right ✓'
      : status === 'error'
        ? 'Something went wrong'
        : status === 'no_math'
          ? 'Nothing to check'
          : 'Take another look'

  return (
    <div
      className={`absolute bottom-24 right-6 z-[999] max-w-sm rounded-xl border px-4 py-3 shadow-md ${tone}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold">{title}</div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 rounded p-1 text-lg leading-none opacity-60 hover:opacity-100"
        >
          ×
        </button>
      </div>
      {hint && (
        <div className="mt-1 text-sm leading-snug">
          <RichText text={hint} />
        </div>
      )}
    </div>
  )
}

// Render a string with optional inline `$...$` math segments via KaTeX.
function RichText({ text }: { text: string }) {
  const parts = useMemo(() => splitMath(text), [text])
  return (
    <>
      {parts.map((p, i) =>
        p.kind === 'math' ? (
          <span
            key={i}
            dangerouslySetInnerHTML={{
              __html: katex.renderToString(p.value, { throwOnError: false }),
            }}
          />
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </>
  )
}

type Segment = { kind: 'text' | 'math'; value: string }

function splitMath(s: string): Segment[] {
  const out: Segment[] = []
  const re = /\$([^$]+)\$/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push({ kind: 'text', value: s.slice(last, m.index) })
    out.push({ kind: 'math', value: m[1] })
    last = re.lastIndex
  }
  if (last < s.length) out.push({ kind: 'text', value: s.slice(last) })
  return out
}
