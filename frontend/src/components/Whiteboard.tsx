import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DefaultColorStyle, Editor, Tldraw } from 'tldraw'
import type { TLDefaultColorStyle } from 'tldraw'
import 'tldraw/tldraw.css'
import katex from 'katex'

type CheckStatus = 'idle' | 'checking' | 'ok' | 'all_correct' | 'no_math' | 'error'

type CheckResponse = {
  latex: string
  hint: string
  step_index: number
  status: 'ok' | 'all_correct' | 'no_math' | 'error'
}

type ChatRole = 'user' | 'assistant'
type ChatMessage = { role: ChatRole; text: string; status?: CheckStatus }

type StoredChat = { latex: string; messages: ChatMessage[] }

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
const STORAGE_KEY = 'euraai.chat.v1'

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


function loadChat(): StoredChat {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { latex: '', messages: [] }
    const parsed = JSON.parse(raw) as StoredChat
    if (!Array.isArray(parsed.messages)) return { latex: '', messages: [] }
    return { latex: parsed.latex ?? '', messages: parsed.messages }
  } catch {
    return { latex: '', messages: [] }
  }
}

function saveChat(c: StoredChat) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c))
  } catch {
    // storage quota / disabled — not fatal
  }
}

export function Whiteboard({ onHome }: { onHome?: () => void }) {
  const editorRef = useRef<Editor | null>(null)
  const initial = useMemo(loadChat, [])
  const [latex, setLatex] = useState<string>(initial.latex)
  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages)
  const [checkStatus, setCheckStatus] = useState<CheckStatus>('idle')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showColorPanel, setShowColorPanel] = useState(false)
  const [activeColor, setActiveColor] = useState<TLDefaultColorStyle>('black')
  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor

    let prevToolId = ''
    editor.store.listen(() => {
      const toolId = editor.getCurrentToolId()
      if (toolId === 'draw' && prevToolId !== 'draw') {
        setShowColorPanel(true)
      } else if (toolId !== 'draw') {
        setShowColorPanel(false)
      }
      prevToolId = toolId
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
    saveChat({ latex, messages })
  }, [latex, messages])

  const appendMessage = useCallback((m: ChatMessage) => {
    setMessages((prev) => [...prev, m])
  }, [])

  const clearChat = useCallback(() => {
    setMessages([])
    setLatex('')
    setCheckStatus('idle')
  }, [])

  const handleCheckWork = useCallback(async () => {
    const editor = editorRef.current
    if (!editor) return
    setCheckStatus('checking')

    try {
      const shapeIds = Array.from(editor.getCurrentPageShapeIds())
      if (shapeIds.length === 0) {
        appendMessage({
          role: 'assistant',
          text: 'Canvas is empty — draw something first.',
          status: 'no_math',
        })
        setCheckStatus('no_math')
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
      if (!res.ok) throw new Error(`Server responded ${res.status}`)
      const data = (await res.json()) as CheckResponse

      if (data.latex) setLatex(data.latex)
      const text =
        data.status === 'all_correct'
          ? 'Looks right ✓ — every step you wrote checks out.'
          : data.hint ||
            "I couldn't produce a hint — try re-writing the step you're unsure about."
      appendMessage({ role: 'assistant', text, status: data.status })
      setCheckStatus(data.status)
    } catch (err) {
      console.error('[EuraAI] check failed', err)
      appendMessage({
        role: 'assistant',
        text: err instanceof Error ? err.message : 'Unknown error',
        status: 'error',
      })
      setCheckStatus('error')
    }
  }, [appendMessage])

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

  return (
    <div className="fixed inset-0">
      <Tldraw onMount={handleMount} components={{ StylePanel: null }} />

      {showColorPanel && (
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

      <button
        onClick={onHome}
        className="absolute bottom-6 left-6 z-[999] rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm backdrop-blur hover:text-neutral-900"
      >
        ← Home
      </button>

      <button
        onClick={handleCheckWork}
        disabled={checkStatus === 'checking'}
        className="absolute bottom-6 right-6 z-[999] rounded-full bg-blue-600 px-6 py-4 text-base font-semibold text-white shadow-lg transition-transform active:scale-95 disabled:opacity-60"
        style={{ touchAction: 'manipulation' }}
      >
        {checkStatus === 'checking' ? 'Checking…' : 'Check Work'}
      </button>

      <ChatPanel
        messages={messages}
        input={input}
        setInput={setInput}
        onSend={handleSend}
        onClear={clearChat}
        sending={sending}
        checking={checkStatus === 'checking'}
      />
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
}: {
  messages: ChatMessage[]
  input: string
  setInput: (s: string) => void
  onSend: () => void
  onClear: () => void
  sending: boolean
  checking: boolean
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, sending, checking])

  const hasMessages = messages.length > 0

  return (
    <div
      className="absolute right-6 top-20 bottom-28 z-[999] flex w-[380px] max-w-[90vw] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl"
      style={{ maxHeight: 'calc(100vh - 180px)' }}
    >
      <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-600 text-xs font-bold text-white">
            E
          </div>
          <span className="text-sm font-semibold text-neutral-800">EuraAI</span>
        </div>
        {hasMessages && (
          <button
            onClick={onClear}
            className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
          >
            Clear chat
          </button>
        )}
      </div>

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
        className={`max-w-[85%] rounded-2xl rounded-tl-sm px-3 py-2 text-sm leading-snug ${toneClass}`}
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
