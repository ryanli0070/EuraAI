/**
 * OrionAssistant — the single AI assistant surface for the whiteboard.
 *
 * Replaces the old right-side chat panel. A small frosted-glass "Orion" pill in
 * the toolbar morphs open into a light glass conversational box that shows the
 * shared message thread (free-text chat AND Hint/Help results from Check Work)
 * and a text input. It's a *controlled* component: all chat state lives in
 * Whiteboard and is passed in, so Check Work's Hint/Help — which append to the
 * same `messages` — show up here too (Whiteboard auto-opens the box for them).
 *
 * Design: light frosted glass (translucent cream + blur) with dark ink text for
 * readability over the bright canvas, a soft Orion-colored glow accent, and a
 * framer-motion spring morph that grows the box out of the pill. The expanded
 * box is portaled to <body> because the toolbar has a CSS transform, which would
 * otherwise trap the full-screen tap-out backdrop.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Send, X } from 'lucide-react'
import katex from 'katex'
import type { ChatMessage } from '../lib/canvasStore'

const BOX_W = 468

export function OrionAssistant({
  messages,
  input,
  setInput,
  onSend,
  onClear,
  sending,
  checking,
  open,
  onOpenChange,
}: {
  messages: ChatMessage[]
  input: string
  setInput: (s: string) => void
  onSend: () => void
  onClear: () => void
  sending: boolean
  checking: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null)
  const pillRef = useRef<HTMLButtonElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const hasMessages = messages.length > 0
  const busy = sending || checking

  // Center the box in the top-middle of the screen. The pill only toggles it
  // open/closed — it is NOT the pivot the box grows from (that's top-center).
  const computeAnchor = () => {
    const width = Math.min(BOX_W, window.innerWidth - 24)
    const r = pillRef.current?.getBoundingClientRect()
    const top = r ? r.bottom + 8 : 64 // sit just below the toolbar
    setAnchor({ top, left: Math.round((window.innerWidth - width) / 2), width })
  }

  // Recompute when opening + on viewport changes while open.
  useLayoutEffect(() => {
    if (open) computeAnchor()
  }, [open])
  useEffect(() => {
    if (!open) return
    const onResize = () => computeAnchor()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open])

  // Focus the input when the box opens.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Keep the thread pinned to the newest message / typing indicator.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy, open])

  // Esc to close + a simple focus trap inside the open dialog.
  const onBoxKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onOpenChange(false); return }
    if (e.key !== 'Tab') return
    const root = boxRef.current
    if (!root) return
    const f = root.querySelectorAll<HTMLElement>(
      'button, textarea, [href], input, [tabindex]:not([tabindex="-1"])',
    )
    if (f.length === 0) return
    const first = f[0]
    const last = f[f.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  return (
    <div className="orion">
      <style>{STYLES}</style>

      {/* Toolbar pill */}
      <button
        ref={pillRef}
        type="button"
        className="orion-pill orion-glass"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Open Orion assistant"
        data-open={open}
        onClick={() => onOpenChange(!open)}
      >
        <span className="orion-glow" aria-hidden />
        <img src="/images/Orion_Icon.png" alt="" className="orion-pill-logo" />
        <span className="orion-pill-label">Orion</span>
      </button>

      {createPortal(
        <AnimatePresence>
          {open && anchor && (
            <>
              <motion.div
                className="orion-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => onOpenChange(false)}
              />
              <motion.div
                ref={boxRef}
                className="orion-box orion-glass"
                role="dialog"
                aria-modal="true"
                aria-label="Orion assistant"
                style={{ top: anchor.top, left: anchor.left, width: anchor.width, transformOrigin: 'top center' }}
                initial={{ opacity: 0, scaleX: 0.2, scaleY: 0.12, y: -6 }}
                animate={{ opacity: 1, scaleX: 1, scaleY: 1, y: 0 }}
                exit={{ opacity: 0, scaleX: 0.2, scaleY: 0.12, y: -6 }}
                transition={{ type: 'spring', stiffness: 360, damping: 30, mass: 0.8 }}
                onKeyDown={onBoxKeyDown}
              >
                <span className="orion-glow" aria-hidden />

                <header className="orion-head">
                  <span className="orion-head-actions">
                    {hasMessages && (
                      <button type="button" className="orion-clear" onClick={onClear}>
                        Clear
                      </button>
                    )}
                    <button
                      type="button"
                      className="orion-icon-btn"
                      aria-label="Close"
                      onClick={() => onOpenChange(false)}
                    >
                      <X size={15} strokeWidth={2.5} />
                    </button>
                  </span>
                </header>

                <div ref={scrollRef} className="orion-thread">
                  {!hasMessages && (
                    <div className="orion-empty">
                      <p className="orion-empty-lead">Draw your work, then hit Check Work.</p>
                      <p>Ask a follow-up here any time — I&apos;ll nudge, not solve.</p>
                    </div>
                  )}
                  {messages.map((m, i) => (
                    <MessageBubble key={i} message={m} />
                  ))}
                  {busy && (
                    <div className="orion-row left">
                      <div className="orion-msg assistant">
                        <TypingDots />
                      </div>
                    </div>
                  )}
                </div>

                <div className="orion-input-row">
                  <textarea
                    ref={inputRef}
                    className="orion-textarea"
                    rows={1}
                    placeholder="Ask a follow-up…"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() }
                    }}
                    aria-label="Message Orion"
                  />
                  <button
                    type="button"
                    className="orion-send"
                    aria-label="Send"
                    disabled={!input.trim() || sending}
                    onClick={onSend}
                  >
                    <Send size={16} strokeWidth={2.25} />
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}

// ── Message rendering (moved from the old ChatPanel) ────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="orion-row right">
        <div className="orion-msg user">{message.text}</div>
      </div>
    )
  }
  const tone =
    message.status === 'all_correct' ? 'ok'
    : message.status === 'error' ? 'error'
    : message.status === 'no_math' ? 'warn'
    : 'assistant'
  return (
    <div className="orion-row left">
      <div className={`orion-msg ${tone} select-text`}>
        <RichText text={message.text} />
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <span className="orion-typing" aria-label="Thinking">
      <i /><i /><i />
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
            dangerouslySetInnerHTML={{ __html: katex.renderToString(p.value, { throwOnError: false }) }}
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

const STYLES = `
.orion{
  /* ---- Light frosted-glass tokens ---- */
  --orion-glass: rgba(252,250,246,0.82);   /* translucent cream — matches the app */
  --orion-blur: 20px;
  --orion-ink: #18243f;                     /* readable dark text */
  --orion-ink-soft: #4a5872;
  --orion-line: rgba(24,36,63,0.10);
  --orion-accent: #2d5ad9;
  /* soft, desaturated glow accent (subtle — kept off the text) */
  --orion-glow-a: #c9b8ec; --orion-glow-b: #a7c3ea; --orion-glow-c: #edc4d6;
  --ui:'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
  display:inline-flex;
}

.orion-glass{
  position:relative;
  background: var(--orion-glass);
  -webkit-backdrop-filter: blur(var(--orion-blur)) saturate(1.4);
  backdrop-filter: blur(var(--orion-blur)) saturate(1.4);
  border: 1px solid var(--orion-line);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.75), 0 12px 40px rgba(24,36,63,0.16);
  overflow:hidden; isolation:isolate;
  color: var(--orion-ink);
}

/* soft glow accent — a faint colored halo at the top, never under the text */
.orion-glow{
  position:absolute; left:0; right:0; top:-40%; height:90%; z-index:0; pointer-events:none;
  background:
    radial-gradient(40% 60% at 22% 30%, var(--orion-glow-c), transparent 70%),
    radial-gradient(44% 64% at 60% 18%, var(--orion-glow-b), transparent 70%),
    radial-gradient(40% 60% at 85% 32%, var(--orion-glow-a), transparent 70%);
  filter: blur(20px); opacity:.5; mix-blend-mode:multiply;
}

/* ---------------- Pill ---------------- */
.orion-pill{
  display:inline-flex; align-items:center; gap:6px;
  height:32px; padding:0 12px 0 8px; border-radius:999px;
  font:600 13px/1 var(--ui); color:var(--orion-ink); letter-spacing:.01em;
  cursor:pointer; -webkit-tap-highlight-color:transparent;
  transition: transform .18s cubic-bezier(.2,.9,.2,1.1), box-shadow .25s ease;
}
.orion-pill .orion-glow{ opacity:.55; top:-60%; height:200%; }
.orion-pill-logo{ width:18px; height:18px; object-fit:contain; position:relative; z-index:1; }
.orion-pill-label{ position:relative; z-index:1; }
.orion-pill:hover{ transform: scale(1.04); }
.orion-pill:active{ transform: scale(.97); }

/* ---------------- Box ---------------- */
.orion-backdrop{ position:fixed; inset:0; z-index:1190; background:transparent; }
.orion-box{
  position:fixed; z-index:1200;
  display:flex; flex-direction:column;
  /* Short, content-height up to a modest cap, so it sits compact in the
     top-middle ON TOP of the work rather than covering it. */
  max-height:min(42vh, 340px);
  border-radius:18px;
  /* Solid white pop-out (not frosted glass) — override the .orion-glass look. */
  background: #fff;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}
/* No colored halo inside the solid panel; keep it clean white. */
.orion-box .orion-glow{ display:none; }

.orion-head{
  position:relative; z-index:2;
  display:flex; align-items:center; justify-content:flex-end;
  padding:8px 10px; border-bottom:1px solid var(--orion-line);
}
.orion-head-actions{ display:inline-flex; align-items:center; gap:4px; }
.orion-clear{ font:500 12px/1 var(--ui); color:var(--orion-ink-soft); background:transparent; border:none; padding:5px 8px; border-radius:7px; cursor:pointer; }
.orion-clear:hover{ background:rgba(24,36,63,0.06); }
.orion-icon-btn{ display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:8px; background:transparent; border:none; color:var(--orion-ink-soft); cursor:pointer; }
.orion-icon-btn:hover{ background:rgba(24,36,63,0.06); }

.orion-thread{
  position:relative; z-index:2;
  display:flex; flex-direction:column; gap:10px;
  padding:14px 12px; overflow-y:auto; -webkit-overflow-scrolling:touch;
  /* flex:1 + min-height:0 lets the thread actually scroll within the capped
     box instead of overflowing the input row off the bottom (the "cutoff"). */
  flex:1 1 auto; min-height:0;
}
/* Extra bottom padding lifts the centered placeholder text upward so it reads
   as vertically balanced within the box (header above eats visual space). */
.orion-empty{ margin:auto; text-align:center; color:var(--orion-ink-soft); padding:14px 8px 46px; }
.orion-empty p{ margin:0; font:450 13px/1.5 var(--ui); }
.orion-empty-lead{ font-weight:600 !important; color:var(--orion-ink) !important; margin-bottom:4px !important; }

.orion-row{ display:flex; }
.orion-row.right{ justify-content:flex-end; }
.orion-row.left{ justify-content:flex-start; }
.orion-msg{
  max-width:86%; padding:8px 11px; border-radius:14px;
  font:450 13.5px/1.45 var(--ui); white-space:pre-wrap; overflow-wrap:anywhere;
}
.orion-msg.user{ background:var(--orion-accent); color:#fff; border-bottom-right-radius:5px; }
.orion-msg.assistant{ background:rgba(24,36,63,0.06); color:var(--orion-ink); border-bottom-left-radius:5px; }
.orion-msg.ok{ background:#e7f6ee; color:#0f5132; border:1px solid #b7e3c9; border-bottom-left-radius:5px; }
.orion-msg.error{ background:#fdeaea; color:#842029; border:1px solid #f1c2c2; border-bottom-left-radius:5px; }
.orion-msg.warn{ background:#fbf2dc; color:#7a5b13; border:1px solid #ecd9a6; border-bottom-left-radius:5px; }

.orion-typing{ display:inline-flex; gap:4px; align-items:center; padding:2px 0; }
.orion-typing i{ width:6px; height:6px; border-radius:50%; background:rgba(24,36,63,.4); animation:orionBlink 1.2s infinite ease-in-out; }
.orion-typing i:nth-child(2){ animation-delay:.18s } .orion-typing i:nth-child(3){ animation-delay:.36s }
@keyframes orionBlink{ 0%,80%,100%{ opacity:.25; transform:translateY(0) } 40%{ opacity:1; transform:translateY(-2px) } }

.orion-input-row{
  position:relative; z-index:2;
  display:flex; align-items:flex-end; gap:8px;
  padding:10px; border-top:1px solid var(--orion-line);
}
.orion-textarea{
  flex:1; resize:none; max-height:120px;
  background:rgba(255,255,255,0.75); border:1px solid var(--orion-line); border-radius:11px;
  padding:8px 11px; color:var(--orion-ink); font:450 14px/1.35 var(--ui); outline:none;
}
.orion-textarea::placeholder{ color:var(--orion-ink-soft); opacity:.7 }
.orion-textarea:focus{ border-color:rgba(45,90,217,.55); box-shadow:0 0 0 3px rgba(45,90,217,.14) }
.orion-send{
  display:inline-flex; align-items:center; justify-content:center;
  width:36px; height:36px; flex:0 0 auto; border-radius:11px;
  background:var(--orion-accent); border:none; color:#fff; cursor:pointer;
  transition: background .15s ease, transform .12s ease, opacity .2s ease;
}
.orion-send:hover:not(:disabled){ background:#244bbd } .orion-send:active{ transform:scale(.94) }
.orion-send:disabled{ opacity:.4; cursor:default }

@media (prefers-reduced-motion: reduce){
  .orion-glow{ filter:blur(20px); }
}
`
