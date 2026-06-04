import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import katex from 'katex'
import {
  ChevronLeft,
  Copy,
  Eraser,
  FilePlus,
  Hand,
  Maximize2,
  Minimize2,
  MousePointer2,
  Pencil,
  Redo2,
  Trash2,
  Undo2,
} from 'lucide-react'
import { Canvas, WhiteboardEngine, type EngineState, type ToolId } from '../lib/whiteboard'
import {
  type ChatBox,
  type ChatMessage,
  loadChat as loadCanvasChat,
  saveChat as saveCanvasChat,
  setThumbnail,
} from '../lib/canvasStore'
import { apiFetch } from '../lib/api'
import { getShowGrid, subscribeSettings } from '../lib/settings'

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


const DEFAULT_ENGINE_STATE: EngineState = {
  tool: 'draw',
  color: '#1d1d1d',
  canUndo: false,
  canRedo: false,
  isEmpty: true,
  hasSelection: false,
  pull: 0,
  page: 0,
  pageCount: 1,
}

export function Whiteboard({
  canvasId,
  onHome,
}: {
  canvasId: string
  onHome?: () => void
}) {
  const engineRef = useRef<WhiteboardEngine | null>(null)
  const checkMenuRef = useRef<HTMLDivElement | null>(null)
  const [latex, setLatex] = useState<string>('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [checkStatus, setCheckStatus] = useState<CheckStatus>('idle')
  const [showCheckMenu, setShowCheckMenu] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [box, setBox] = useState<ChatBox>(defaultBox)
  const [chatReady, setChatReady] = useState(false)
  const [showColorPanel, setShowColorPanel] = useState(false)
  const [engineState, setEngineState] = useState<EngineState>(DEFAULT_ENGINE_STATE)

  const handleMount = useCallback((engine: WhiteboardEngine) => {
    engineRef.current = engine
    engine.setShowGrid(getShowGrid())
    setEngineState(engine.getState())
    engine.subscribe(() => setEngineState(engine.getState()))
  }, [])

  // Keep the live page's grid in sync with the Settings toggle.
  useEffect(() => {
    return subscribeSettings(() => {
      engineRef.current?.setShowGrid(getShowGrid())
    })
  }, [])

  const handleSelectTool = useCallback((tool: ToolId) => {
    const engine = engineRef.current
    if (!engine) return
    const wasDraw = engine.getState().tool === 'draw'
    engine.setTool(tool)
    if (tool === 'draw') {
      // Toggle the color panel: open on first draw select, re-open on click-while-active.
      setShowColorPanel((open) => (wasDraw ? !open : true))
    } else {
      setShowColorPanel(false)
    }
  }, [])

  useEffect(() => {
    document.body.classList.add('whiteboard-mode')
    return () => document.body.classList.remove('whiteboard-mode')
  }, [])

  // Load chat state from the backend on canvas change. Reset the ready flag
  // first so we don't overwrite the incoming load with stale (or empty) state
  // via the save effect below.
  useEffect(() => {
    let cancelled = false
    setChatReady(false)
    setLatex('')
    setMessages([])
    setBox(defaultBox())
    void loadCanvasChat(canvasId).then((stored) => {
      if (cancelled) return
      setLatex(stored.latex)
      setMessages(stored.messages)
      setBox({ ...defaultBox(), ...(stored.box ?? {}) })
      setChatReady(true)
    })
    return () => { cancelled = true }
  }, [canvasId])

  useEffect(() => {
    if (!chatReady) return
    saveCanvasChat(canvasId, { latex, messages, box })
  }, [canvasId, latex, messages, box, chatReady])

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
    const engine = engineRef.current
    if (!engine || engine.isEmpty()) return null
    const blob = await engine.toImage({ padding: 32, scale: 2, background: true })
    if (!blob) return null
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
      const res = await apiFetch('/api/check', { method: 'POST', body: formData })
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
      const res = await apiFetch('/api/help', { method: 'POST', body: formData })
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
      const res = await apiFetch('/api/chat', {
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
  // preview. Best-effort: clear the thumbnail if capture fails or the canvas
  // is empty, so a now-empty canvas doesn't keep a stale image.
  const handleHome = useCallback(async () => {
    const engine = engineRef.current
    if (engine) {
      try {
        if (engine.isEmpty()) {
          await setThumbnail(canvasId, null)
        } else {
          const blob = await engine.toImage({ padding: 16, scale: 0.5, background: true })
          if (blob) await setThumbnail(canvasId, blob)
        }
      } catch (err) {
        console.warn('[EuraAI] thumbnail capture failed', err)
      }
    }
    onHome?.()
  }, [canvasId, onHome])

  const handleClear = useCallback(() => {
    engineRef.current?.clear()
    setLatex('')
    setCheckStatus('idle')
  }, [])

  const handleDeletePage = useCallback(() => {
    engineRef.current?.deletePage()
  }, [])

  return (
    <div className="fixed inset-0">
      <Canvas canvasId={canvasId} onMount={handleMount} />

      {engineState.pull > 0 && <PullToAddPage progress={engineState.pull} />}

      {engineState.pageCount > 1 && (
        <PageControls
          key={`${engineState.page}-${engineState.pageCount}`}
          page={engineState.page}
          count={engineState.pageCount}
          onDelete={handleDeletePage}
        />
      )}

      <Toolbar
        state={engineState}
        onSelectTool={handleSelectTool}
        onUndo={() => engineRef.current?.undo()}
        onRedo={() => engineRef.current?.redo()}
        onDuplicate={() => engineRef.current?.duplicateSelected()}
        onClear={handleClear}
      />

      {showColorPanel && engineState.tool === 'draw' && (
        <div className="absolute left-1/2 top-16 z-[999] flex -translate-x-1/2 items-center gap-1.5 rounded-2xl border border-neutral-200 bg-white/95 px-3 py-2 shadow-xl backdrop-blur">
          {COLORS.map((c) => (
            <button
              key={c.value}
              title={c.label}
              onClick={() => {
                engineRef.current?.setColor(c.css)
                setShowColorPanel(false)
              }}
              className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 active:scale-95"
              style={{
                backgroundColor: c.css,
                borderColor: engineState.color === c.css ? '#2563eb' : c.css === '#ffffff' ? '#d1d5db' : 'transparent',
                boxShadow: engineState.color === c.css ? '0 0 0 2px #93c5fd' : 'none',
              }}
            />
          ))}
        </div>
      )}

      <HomeButton onHome={handleHome} />

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

function Toolbar({
  state,
  onSelectTool,
  onUndo,
  onRedo,
  onDuplicate,
  onClear,
}: {
  state: EngineState
  onSelectTool: (tool: ToolId) => void
  onUndo: () => void
  onRedo: () => void
  onDuplicate: () => void
  onClear: () => void
}) {
  const tools: { id: ToolId; label: string; Icon: typeof Pencil }[] = [
    { id: 'select', label: 'Select', Icon: MousePointer2 },
    { id: 'draw', label: 'Draw', Icon: Pencil },
    { id: 'eraser', label: 'Eraser', Icon: Eraser },
    { id: 'hand', label: 'Hand', Icon: Hand },
  ]
  return (
    <div className="absolute left-1/2 top-3 z-[1000] flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-neutral-200 bg-white/95 px-2 py-1.5 shadow-lg backdrop-blur">
      {tools.map(({ id, label, Icon }) => {
        const active = state.tool === id
        return (
          <button
            key={id}
            title={label}
            onClick={() => onSelectTool(id)}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
              active ? 'bg-blue-100 text-blue-700' : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={2.25} />
          </button>
        )
      })}
      <span className="mx-1 h-6 w-px bg-neutral-200" />
      <button
        title="Undo"
        onClick={onUndo}
        disabled={!state.canUndo}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Undo2 className="h-4 w-4" strokeWidth={2.25} />
      </button>
      <button
        title="Redo"
        onClick={onRedo}
        disabled={!state.canRedo}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Redo2 className="h-4 w-4" strokeWidth={2.25} />
      </button>
      <button
        title="Duplicate selection"
        onClick={onDuplicate}
        disabled={!state.hasSelection}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Copy className="h-4 w-4" strokeWidth={2.25} />
      </button>
      <button
        title="Clear board"
        onClick={onClear}
        disabled={state.isEmpty}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Trash2 className="h-4 w-4" strokeWidth={2.25} />
      </button>
    </div>
  )
}

function HomeButton({ onHome }: { onHome?: () => void }) {
  return (
    <button
      onClick={onHome}
      className="absolute left-0 top-0 z-[1000] flex h-10 items-center gap-1 rounded-br-xl border-b border-r border-neutral-200 bg-white/95 px-3 text-sm font-medium text-neutral-700 shadow-sm backdrop-blur transition-colors hover:bg-neutral-100 hover:text-neutral-900"
      aria-label="Home"
      style={{ touchAction: 'manipulation' }}
    >
      <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
      <span className="leading-none">Home</span>
    </button>
  )
}

/**
 * GoodNotes-style affordance shown while the user drags past the last page.
 * A ring fills as they pull; at 100% the copy flips to "release to add page".
 * Purely decorative — pointer-events are off so it never eats the drag.
 */
function PullToAddPage({ progress }: { progress: number }) {
  const p = Math.min(1, Math.max(0, progress))
  const ready = p >= 1
  const r = 22
  const circumference = 2 * Math.PI * r
  const accent = ready ? '#16a34a' : '#2563eb'

  return (
    <div className="pointer-events-none absolute right-6 top-1/2 z-[1000] -translate-y-1/2">
      <div
        className="flex w-28 flex-col items-center gap-2 rounded-2xl border border-neutral-200 bg-white/95 px-3 py-3 text-center shadow-xl backdrop-blur"
        style={{ transform: `scale(${0.92 + 0.08 * p})` }}
      >
        <div className="relative flex h-13 w-13 items-center justify-center" style={{ height: 52, width: 52 }}>
          <svg className="absolute inset-0 -rotate-90" width="52" height="52" viewBox="0 0 52 52">
            <circle cx="26" cy="26" r={r} fill="none" stroke="#e5e7eb" strokeWidth="3" />
            <circle
              cx="26"
              cy="26"
              r={r}
              fill="none"
              stroke={accent}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - p)}
              style={{ transition: 'stroke-dashoffset 60ms linear' }}
            />
          </svg>
          <FilePlus className="h-5 w-5" strokeWidth={2.25} style={{ color: accent }} />
        </div>
        <span className="text-xs font-semibold leading-tight" style={{ color: ready ? '#16a34a' : '#6b7280' }}>
          {ready ? 'Release to add page' : 'Keep pulling…'}
        </span>
      </div>
    </div>
  )
}

/**
 * Bottom-center page pill ("Page X / N") with a delete-page button. Deleting
 * asks for confirmation first, since it discards a whole sheet of work.
 */
function PageControls({
  page,
  count,
  onDelete,
}: {
  page: number
  count: number
  onDelete: () => void
}) {
  // Confirm state resets when page/count changes: the parent keys this element
  // on both, so a swipe or delete remounts it fresh.
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="absolute bottom-6 left-1/2 z-[1000] -translate-x-1/2">
      {confirming && (
        <div className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 flex-col items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3 shadow-xl">
          <span className="whitespace-nowrap text-xs font-medium text-neutral-700">
            Delete page {page + 1}?
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirming(false)}
              className="rounded-lg px-3 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setConfirming(false)
                onDelete()
              }}
              className="rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      )}
      <div className="flex items-center gap-0.5 rounded-full border border-neutral-200 bg-white/90 py-1 pl-3 pr-1.5 shadow-md backdrop-blur">
        <span className="text-xs font-medium text-neutral-600">
          Page {page + 1} <span className="text-neutral-400">/ {count}</span>
        </span>
        <button
          onClick={() => setConfirming((v) => !v)}
          title="Delete this page"
          className={`ml-1 flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
            confirming
              ? 'bg-red-100 text-red-600'
              : 'text-neutral-500 hover:bg-red-50 hover:text-red-600'
          }`}
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
      </div>
    </div>
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
