import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DefaultColorStyle, Editor, react, Tldraw, TldrawUiMenuActionItem, TldrawUiMenuContextProvider, useCanRedo, useCanUndo } from 'tldraw'
import type { TLDefaultColorStyle } from 'tldraw'
import 'tldraw/tldraw.css'
import katex from 'katex'
import { Maximize2, Minimize2 } from 'lucide-react'
import {
  type ChatBox,
  type ChatMessage,
  loadChat as loadCanvasChat,
  saveChat as saveCanvasChat,
  setThumbnail,
  touchCanvas,
} from '../lib/canvasStore'

type CheckStatus = 'idle' | 'checking' | 'ok' | 'all_correct' | 'no_math' | 'error'

type CheckResponse = {
  latex: string
  hint: string
  step_index: number
  status: 'ok' | 'all_correct' | 'no_math' | 'error'
}

type HelpApiResponse = {
  latex: string
  explanation: string
  step_index: number
  status: 'ok' | 'all_correct' | 'no_math' | 'error'
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
const MIN_W = 260
const MIN_H = 180

function defaultBox(): ChatBox {
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const w = 360
  const h = Math.min(560, Math.max(MIN_H, vh - 180))
  // Default: docked to top-right. x/y/w/h become the detached position if
  // the user pops out — keep them seeded near the same spot for a smooth pop.
  return {
    x: Math.max(24, vw - w - 24),
    y: 80,
    w,
    h,
    collapsed: false,
    attached: true,
  }
}

const COLORS: { value: string; css: string; label: string }[] = [
  { value: 'black',       css: '#1d1d1d', label: 'Black' },
  { value: 'grey',        css: '#9ca3af', label: 'Grey' },
  { value: 'red',         css: '#dc2626', label: 'Red' },
  { value: 'light-red',   css: '#fca5a5', label: 'Pink' },
  { value: 'orange',      css: '#f97316', label: 'Orange' },
  { value: 'yellow',      css: '#fbbf24', label: 'Yellow' },
  { value: 'green',       css: '#16a34a', label: 'Green' },
  { value: 'light-green', css: '#86efac', label: 'Mint' },
  { value: 'blue',        css: '#2563eb', label: 'Blue' },
  { value: 'light-blue',  css: '#93c5fd', label: 'Sky' },
  { value: 'violet',      css: '#7c3aed', label: 'Violet' },
  { value: 'white',       css: '#ffffff', label: 'White' },
]


// Chat state is persisted per-canvas via canvasStore; here we just merge the
// loaded box against current defaults so older shapes pick up new fields.
function loadInitialChat(canvasId: string): { latex: string; messages: ChatMessage[]; box: ChatBox } {
  const stored = loadCanvasChat(canvasId)
  const box: ChatBox = { ...defaultBox(), ...(stored.box ?? {}) }
  return { latex: stored.latex, messages: stored.messages, box }
}

// Module-level ref so ClearAllQuickActions (defined outside the component tree)
// can call the board-clear callback without re-creating the component on each render.
const _clearBoardRef = { current: (() => {}) as () => void }

function ClearAllQuickActions() {
  const canUndo = useCanUndo()
  const canRedo = useCanRedo()
  return (
    <TldrawUiMenuContextProvider type="small-icons" sourceId="quick-actions">
      <TldrawUiMenuActionItem actionId="undo" disabled={!canUndo} />
      <TldrawUiMenuActionItem actionId="redo" disabled={!canRedo} />
      <TldrawUiMenuActionItem actionId="delete" />
      <TldrawUiMenuActionItem actionId="duplicate" />
    </TldrawUiMenuContextProvider>
  )
}

export function Whiteboard({
  canvasId,
  onHome,
}: {
  canvasId: string
  onHome?: () => void
}) {
  const editorRef = useRef<Editor | null>(null)
  const checkMenuRef = useRef<HTMLDivElement | null>(null)
  const initial = useMemo(() => loadInitialChat(canvasId), [canvasId])
  const [latex, setLatex] = useState<string>(initial.latex)
  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages)
  const [checkStatus, setCheckStatus] = useState<CheckStatus>('idle')

  // Keep the module-level ref in sync so ClearAllQuickActions can call it
  _clearBoardRef.current = () => {
    const editor = editorRef.current
    if (!editor) return
    const ids = Array.from(editor.getCurrentPageShapeIds())
    if (ids.length > 0) {
      editor.deleteShapes(ids)
    }
    setLatex('')
    setCheckStatus('idle')
  }
  const [showCheckMenu, setShowCheckMenu] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [box, setBox] = useState<ChatBox>(() => initial.box ?? defaultBox())
  const [showColorPanel, setShowColorPanel] = useState(false)
  const [activeColor, setActiveColor] = useState<TLDefaultColorStyle>('black')
  const [currentToolId, setCurrentToolId] = useState<string>('select')

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor

    // Tool changes live in session-scope state; react() tracks them reliably
    // where store.listen's default filter does not.
    let prevToolId = ''
    react('tool watcher', () => {
      const toolId = editor.getCurrentToolId()
      const path = editor.getPath()
      setCurrentToolId(toolId)
      if (toolId === 'draw' && prevToolId !== 'draw') {
        setShowColorPanel(true)
      } else if (toolId !== 'draw') {
        setShowColorPanel(false)
      } else if (path === 'draw.drawing') {
        setShowColorPanel(false)
      }
      prevToolId = toolId
    })

    editor.store.listen(() => {
      const c = editor.getStyleForNextShape(DefaultColorStyle)
      if (c) setActiveColor(c)
    })

    // Re-open panel when pencil clicked while already active
    const el = editor.getContainer()
    el.addEventListener('pointerdown', (e) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-testid="tools.draw"]') && editor.getCurrentToolId() === 'draw') {
        setShowColorPanel(true)
      }
    }, { capture: true })
  }, [])

  useEffect(() => {
    document.body.classList.add('whiteboard-mode')
    return () => document.body.classList.remove('whiteboard-mode')
  }, [])

  useEffect(() => {
    saveCanvasChat(canvasId, { latex, messages, box })
    touchCanvas(canvasId)
  }, [canvasId, latex, messages, box])

  const appendMessage = useCallback((m: ChatMessage) => {
    setMessages((prev) => [...prev, m])
  }, [])

  const clearChat = useCallback(() => {
    setMessages([])
    setLatex('')
    setCheckStatus('idle')
  }, [])

  useEffect(() => {
    if (!showCheckMenu) return
    const handler = (e: MouseEvent) => {
      if (checkMenuRef.current && !checkMenuRef.current.contains(e.target as Node)) {
        setShowCheckMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showCheckMenu])

  const captureCanvas = useCallback(async () => {
    const editor = editorRef.current
    if (!editor) return null
    const shapeIds = Array.from(editor.getCurrentPageShapeIds())
    if (shapeIds.length === 0) return null
    const { blob } = await editor.toImage(shapeIds, {
      format: 'png',
      background: true,
      padding: 32,
      scale: 2,
    })
    const formData = new FormData()
    formData.append('file', blob, 'capture.png')
    return formData
  }, [])

  const handleHint = useCallback(async () => {
    setCheckStatus('checking')
    try {
      const formData = await captureCanvas()
      if (!formData) {
        appendMessage({ role: 'assistant', text: 'Canvas is empty — draw something first.', status: 'no_math' })
        setCheckStatus('no_math')
        return
      }
      const res = await fetch(`${API_BASE_URL}/api/check`, { method: 'POST', body: formData })
      if (!res.ok) throw new Error(`Server responded ${res.status}`)
      const data = (await res.json()) as CheckResponse
      if (data.latex) setLatex(data.latex)
      const text =
        data.status === 'all_correct'
          ? 'Looks right — every step you wrote checks out.'
          : data.hint || "I couldn't produce a hint — try re-writing the step you're unsure about."
      appendMessage({ role: 'assistant', text, status: data.status })
      setCheckStatus(data.status)
    } catch (err) {
      console.error('[EuraAI] hint failed', err)
      appendMessage({ role: 'assistant', text: err instanceof Error ? err.message : 'Unknown error', status: 'error' })
      setCheckStatus('error')
    }
  }, [appendMessage, captureCanvas])

  const handleHelp = useCallback(async () => {
    setCheckStatus('checking')
    try {
      const formData = await captureCanvas()
      if (!formData) {
        appendMessage({ role: 'assistant', text: 'Canvas is empty — draw something first.', status: 'no_math' })
        setCheckStatus('no_math')
        return
      }
      const res = await fetch(`${API_BASE_URL}/api/help`, { method: 'POST', body: formData })
      if (!res.ok) throw new Error(`Server responded ${res.status}`)
      const data = (await res.json()) as HelpApiResponse
      if (data.latex) setLatex(data.latex)
      const text =
        data.status === 'all_correct'
          ? 'Looks right — every step you wrote checks out.'
          : data.explanation || "I couldn't produce an explanation — try re-writing the step you're unsure about."
      appendMessage({ role: 'assistant', text, status: data.status })
      setCheckStatus(data.status)
    } catch (err) {
      console.error('[EuraAI] help failed', err)
      appendMessage({ role: 'assistant', text: err instanceof Error ? err.message : 'Unknown error', status: 'error' })
      setCheckStatus('error')
    }
  }, [appendMessage, captureCanvas])

  const handleSend = useCallback(async () => {
    const question = input.trim()
    if (!question || sending) return
    setInput('')
    setSending(true)
    const nextHistory: ChatMessage[] = [...messages, { role: 'user', text: question }]
    setMessages(nextHistory)
    try {
      const res = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latex,
          history: messages.map((m) => ({ role: m.role, text: m.text })),
          question,
        }),
      })
      if (!res.ok) throw new Error(`Server responded ${res.status}`)
      const data = (await res.json()) as { reply: string }
      appendMessage({ role: 'assistant', text: data.reply })
    } catch (err) {
      console.error('[EuraAI] chat failed', err)
      appendMessage({
        role: 'assistant',
        text: err instanceof Error ? err.message : 'Unknown error',
        status: 'error',
      })
    } finally {
      setSending(false)
    }
  }, [appendMessage, input, latex, messages, sending])

  // Capture a small thumbnail before leaving so the menu shows a recognizable
  // preview. Best-effort: fall back to clearing the thumbnail if capture fails
  // or the canvas is empty, so a now-empty canvas doesn't keep a stale image.
  const handleHome = useCallback(async () => {
    const editor = editorRef.current
    if (editor) {
      try {
        const ids = Array.from(editor.getCurrentPageShapeIds())
        if (ids.length === 0) {
          setThumbnail(canvasId, undefined)
        } else {
          const { blob } = await editor.toImage(ids, {
            format: 'png',
            background: true,
            padding: 16,
            scale: 0.5,
          })
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = () => reject(reader.error)
            reader.readAsDataURL(blob)
          })
          setThumbnail(canvasId, dataUrl)
        }
      } catch (err) {
        console.warn('[EuraAI] thumbnail capture failed', err)
      }
    }
    onHome?.()
  }, [canvasId, onHome])

  return (
    <div className="fixed inset-0">
      <Tldraw
        persistenceKey={`canvas-${canvasId}`}
        onMount={handleMount}
        components={{ StylePanel: null, QuickActions: ClearAllQuickActions }}
        overrides={{
          actions: (_editor, actions) => ({
            ...actions,
            delete: {
              ...actions['delete'],
              onSelect() {
                _clearBoardRef.current()
              },
            },
          }),
        }}
      />

      {showColorPanel && currentToolId === 'draw' && (
        <div className="absolute left-1/2 z-[999] flex items-center gap-1.5 rounded-2xl border border-neutral-200 bg-white/95 px-3 py-2 shadow-xl backdrop-blur" style={{ bottom: '72px', transform: 'translateX(-50%)' }}>
          {COLORS.map((c) => (
            <button
              key={c.value}
              title={c.label}
              onClick={() => {
                const v = c.value as TLDefaultColorStyle
                editorRef.current?.setStyleForNextShapes(DefaultColorStyle, v)
                editorRef.current?.setStyleForSelectedShapes(DefaultColorStyle, v)
                setActiveColor(v)
                setShowColorPanel(false)
              }}
              className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 active:scale-95"
              style={{
                backgroundColor: c.css,
                borderColor: activeColor === c.value ? '#2563eb' : c.value === 'white' ? '#d1d5db' : 'transparent',
                boxShadow: activeColor === c.value ? '0 0 0 2px #93c5fd' : 'none',
              }}
            />
          ))}
        </div>
      )}

      <HomeTab onHome={handleHome} />

      <div ref={checkMenuRef} className="absolute bottom-6 right-6 z-[1000] flex flex-col items-end gap-2">
        {showCheckMenu && (
          <div className="flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl">
            <button
              onClick={() => { setShowCheckMenu(false); handleHint() }}
              className="flex flex-col items-start px-5 py-3 text-left transition-colors hover:bg-neutral-50 active:bg-neutral-100"
            >
              <span className="text-sm font-semibold text-neutral-800">Hint</span>
              <span className="text-xs text-neutral-400">Guide me to find the error</span>
            </button>
            <div className="h-px bg-neutral-100" />
            <button
              onClick={() => { setShowCheckMenu(false); handleHelp() }}
              className="flex flex-col items-start px-5 py-3 text-left transition-colors hover:bg-neutral-50 active:bg-neutral-100"
            >
              <span className="text-sm font-semibold text-neutral-800">Help</span>
              <span className="text-xs text-neutral-400">Show me the error and fix</span>
            </button>
          </div>
        )}
        <button
          onClick={() => setShowCheckMenu((prev) => !prev)}
          disabled={checkStatus === 'checking'}
          className="rounded-full bg-blue-600 px-6 py-4 text-base font-semibold text-white shadow-lg transition-transform active:scale-95 disabled:opacity-60"
          style={{ touchAction: 'manipulation' }}
        >
          {checkStatus === 'checking' ? 'Checking…' : 'Check Work'}
        </button>
      </div>

      <ChatPanel
        messages={messages}
        input={input}
        setInput={setInput}
        onSend={handleSend}
        onClear={clearChat}
        sending={sending}
        checking={checkStatus === 'checking'}
        box={box}
        setBox={setBox}
      />
    </div>
  )
}

function HomeTab({ onHome }: { onHome?: () => void }) {
  return (
    <button
      onClick={onHome}
      className="group absolute left-0 top-1/2 z-[999] flex h-20 -translate-y-1/2 items-center overflow-hidden rounded-r-xl border-y border-r border-neutral-200 bg-white/95 pl-1 pr-2 text-neutral-500 shadow-md backdrop-blur transition-all duration-200 hover:pl-3 hover:pr-4 hover:text-neutral-900"
      aria-label="Home"
      style={{ touchAction: 'manipulation' }}
    >
      <span className="text-base leading-none">‹</span>
      <span className="ml-0 max-w-0 overflow-hidden whitespace-nowrap text-xs font-medium transition-all duration-200 group-hover:ml-2 group-hover:max-w-[60px]">
        Home
      </span>
    </button>
  )
}

function ChatPanel({
  messages,
  input,
  setInput,
  onSend,
  onClear,
  sending,
  checking,
  box,
  setBox,
}: {
  messages: ChatMessage[]
  input: string
  setInput: (s: string) => void
  onSend: () => void
  onClear: () => void
  sending: boolean
  checking: boolean
  box: ChatBox
  setBox: React.Dispatch<React.SetStateAction<ChatBox>>
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, sending, checking])

  const hasMessages = messages.length > 0

  const startDrag = (e: React.PointerEvent) => {
    if (box.attached) return
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const sx = e.clientX
    const sy = e.clientY
    const start = box
    const onMove = (ev: PointerEvent) => {
      const maxX = Math.max(0, window.innerWidth - 80)
      const maxY = Math.max(0, window.innerHeight - 40)
      setBox({
        ...start,
        x: Math.min(maxX, Math.max(0, start.x + ev.clientX - sx)),
        y: Math.min(maxY, Math.max(0, start.y + ev.clientY - sy)),
      })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const sx = e.clientX
    const sy = e.clientY
    const start = box
    const onMove = (ev: PointerEvent) => {
      const maxW = window.innerWidth - start.x - 8
      const maxH = window.innerHeight - start.y - 8
      setBox({
        ...start,
        w: Math.max(MIN_W, Math.min(maxW, start.w + ev.clientX - sx)),
        h: Math.max(MIN_H, Math.min(maxH, start.h + ev.clientY - sy)),
      })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const toggleCollapsed = () =>
    setBox((prev) => ({ ...prev, collapsed: !prev.collapsed }))

  const toggleAttached = () =>
    setBox((prev) => ({ ...prev, attached: !prev.attached }))

  const containerStyle: React.CSSProperties = box.attached
    ? {}
    : {
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.collapsed ? 'auto' : box.h,
      }

  // Attached mode: flush to top-right, stretched down to above the Check Work button.
  // Collapsed + attached: let it shrink to header height.
  const containerClass = box.attached
    ? `absolute right-4 top-4 z-[999] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl ${
        box.collapsed ? '' : 'bottom-28'
      }`
    : 'absolute z-[999] flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl'

  return (
    <div className={containerClass} style={containerStyle}>
      <div
        onPointerDown={startDrag}
        className={`flex select-none items-center justify-between border-b border-neutral-100 bg-neutral-50 px-4 py-2.5 ${
          box.attached ? '' : 'cursor-move'
        }`}
        style={{ touchAction: box.attached ? 'auto' : 'none' }}
      >
        <div className="flex items-center gap-2">
          <img
            src="/images/Orion_Icon.png"
            alt="Orion"
            className="h-9 w-9 object-contain"
          />
          <span className="text-sm font-semibold text-neutral-800">Orion</span>
        </div>
        <div className="flex items-center gap-1">
          {hasMessages && !box.collapsed && (
            <button
              onClick={onClear}
              className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
            >
              Clear
            </button>
          )}
          <button
            onClick={toggleAttached}
            className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
            aria-label={box.attached ? 'Detach panel' : 'Dock to top-right'}
            title={box.attached ? 'Detach' : 'Dock to top-right'}
          >
            {box.attached ? (
              <Maximize2 className="h-3.5 w-3.5" strokeWidth={2.25} />
            ) : (
              <Minimize2 className="h-3.5 w-3.5" strokeWidth={2.25} />
            )}
          </button>
          <button
            onClick={toggleCollapsed}
            className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
            aria-label={box.collapsed ? 'Expand' : 'Collapse'}
          >
            {box.collapsed ? '▢' : '—'}
          </button>
        </div>
      </div>

      {box.collapsed ? null : (<>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {!hasMessages && (
          <div className="pt-6 text-center text-sm text-neutral-400">
            <p className="font-medium text-neutral-500">Draw your work, then hit Check Work.</p>
            <p className="mt-1">Ask a follow-up here any time — I'll nudge, not solve.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}
        {(sending || checking) && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-tl-sm bg-neutral-100 px-3 py-2 text-sm text-neutral-500">
              <TypingDots />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-neutral-100 bg-white px-3 py-2">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSend()
              }
            }}
            placeholder="Ask a follow-up…"
            rows={1}
            className="max-h-32 flex-1 resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
          />
          <button
            onClick={onSend}
            disabled={!input.trim() || sending}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-all hover:bg-blue-700 active:scale-95 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>

      {!box.attached && (
        <div
          onPointerDown={startResize}
          className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
          style={{
            touchAction: 'none',
            background:
              'linear-gradient(135deg, transparent 0%, transparent 55%, rgba(0,0,0,0.25) 55%, rgba(0,0,0,0.25) 65%, transparent 65%, transparent 75%, rgba(0,0,0,0.25) 75%, rgba(0,0,0,0.25) 85%, transparent 85%)',
          }}
        />
      )}
      </>)}
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-blue-600 px-3 py-2 text-sm text-white">
          {message.text}
        </div>
      </div>
    )
  }

  const toneClass =
    message.status === 'all_correct'
      ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
      : message.status === 'error'
        ? 'bg-red-50 text-red-900 border border-red-200'
        : message.status === 'no_math'
          ? 'bg-amber-50 text-amber-900 border border-amber-200'
          : 'bg-neutral-100 text-neutral-800'

  return (
    <div className="flex justify-start">
      <div
        className={`max-w-[85%] select-text rounded-2xl rounded-tl-sm px-3 py-2 text-sm leading-snug ${toneClass}`}
      >
        <RichText text={message.text} />
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400 [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400 [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400" />
    </span>
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
