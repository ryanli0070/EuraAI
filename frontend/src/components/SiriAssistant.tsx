/**
 * SiriAssistant — a "Liquid Glass" assistant entry point modeled on Apple's
 * iOS 27 Siri redesign. A compact glass pill lives in the top toolbar; tapping
 * it morphs the pill into a glassy conversational box that grows out of the
 * pill's position, supports typing + voice + follow-up turns, and collapses
 * back down.
 *
 * It does NOT replace the right-side ChatPanel — it's a separate, lightweight
 * affordance that routes messages into the same assistant backend via the
 * `sendToAssistant` prop (see the wiring note at the bottom of this file).
 *
 * Design notes:
 *  - The material is real frosted glass: heavy `backdrop-filter` blur over a
 *    dark translucent base, with a bright top rim, soft inner shadow, and a
 *    drifting multicolor "aura" (soft pink/blue/purple/orange) blended under
 *    the glass via `mix-blend-mode: screen`.
 *  - The "listening/thinking" wave is a luminous band that sweeps across the
 *    surface, layered over the drifting aura — contained inside the element.
 *  - All heavy animation (aura+wave) only mounts while the box is open, and the
 *    sweep only runs while `data-active` (listening or streaming), so we don't
 *    burn frames at idle. `prefers-reduced-motion` drops to a static glow.
 *  - The expanded box is portaled to <body> because the toolbar has a CSS
 *    `transform`, which would otherwise trap our full-screen tap-out backdrop.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Mic, Send, Sparkles, X } from 'lucide-react'

export type SiriHistoryMsg = { role: 'user' | 'assistant'; text: string }
type Msg = { role: 'user' | 'assistant'; text: string }

// Minimal Web Speech API typing (avoids `any`; the API is vendor-prefixed and
// not in the TS DOM lib). Unsupported (e.g. most iOS WKWebViews) → graceful
// fallback that just focuses the input so the native keyboard mic can be used.
type SpeechRec = {
  lang: string
  interimResults: boolean
  continuous: boolean
  start(): void
  stop(): void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}
type SpeechRecCtor = new () => SpeechRec

const BOX_W = 360

export function SiriAssistant({
  sendToAssistant,
}: {
  /** Wire to your assistant backend. Resolves with the full reply text (the box
   *  reveals it incrementally). Swap to a streaming variant easily — see note. */
  sendToAssistant: (question: string, history: SiriHistoryMsg[]) => Promise<string>
}) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [listening, setListening] = useState(false)
  const [reduced, setReduced] = useState(false)

  const pillRef = useRef<HTMLButtonElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const threadEndRef = useRef<HTMLDivElement | null>(null)
  const revealTimer = useRef<number | null>(null)
  const recRef = useRef<SpeechRec | null>(null)

  // Respect reduced-motion (drives both the wave + the typewriter reveal).
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(m.matches)
    sync()
    m.addEventListener?.('change', sync)
    return () => m.removeEventListener?.('change', sync)
  }, [])

  // Anchor the portaled box just below the pill, clamped on-screen.
  const computeAnchor = useCallback(() => {
    const r = pillRef.current?.getBoundingClientRect()
    if (!r) return
    const left = Math.max(12, Math.min(r.left, window.innerWidth - BOX_W - 12))
    setAnchor({ top: r.bottom + 8, left })
  }, [])

  const openBox = useCallback(() => {
    computeAnchor()
    setOpen(true)
  }, [computeAnchor])

  const closeBox = useCallback(() => {
    recRef.current?.stop()
    setListening(false)
    setOpen(false)
  }, [])

  // Keep the box anchored if the viewport changes while open.
  useEffect(() => {
    if (!open) return
    const onResize = () => computeAnchor()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open, computeAnchor])

  // Focus the input when the box opens; clean up any reveal timer on unmount.
  useLayoutEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])
  useEffect(() => () => { if (revealTimer.current) window.clearTimeout(revealTimer.current) }, [])

  // Auto-scroll the thread to the newest message.
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'end' })
  }, [messages, reduced])

  // Reveal the assistant reply into the last message — incremental "stream" feel
  // even though the backend returns the whole string. (If your backend truly
  // streams, call setLastAssistant() per token instead — see note at bottom.)
  const setLastAssistant = useCallback((text: string) => {
    setMessages((m) => {
      const next = m.slice()
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === 'assistant') { next[i] = { ...next[i], text }; break }
      }
      return next
    })
  }, [])

  const revealInto = useCallback(
    (full: string) =>
      new Promise<void>((resolve) => {
        if (reduced) { setLastAssistant(full); resolve(); return }
        let i = 0
        const stepSize = Math.max(1, Math.round(full.length / 120)) // ~120 frames total
        const tick = () => {
          i = Math.min(full.length, i + stepSize)
          setLastAssistant(full.slice(0, i))
          if (i < full.length) revealTimer.current = window.setTimeout(tick, 16)
          else resolve()
        }
        tick()
      }),
    [reduced, setLastAssistant],
  )

  const submit = useCallback(async () => {
    const q = input.trim()
    if (!q || thinking) return
    setInput('')
    const history = messages.map(({ role, text }) => ({ role, text }))
    // Append the user turn + an empty assistant turn to stream into.
    setMessages((m) => [...m, { role: 'user', text: q }, { role: 'assistant', text: '' }])
    setThinking(true)
    try {
      const reply = await sendToAssistant(q, history)
      await revealInto(reply)
    } catch (err) {
      setLastAssistant(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setThinking(false)
    }
  }, [input, thinking, messages, sendToAssistant, revealInto, setLastAssistant])

  // Voice: use Web Speech API where available; otherwise focus the input so the
  // user can dictate via the iOS keyboard's mic. Either way the wave animates.
  const toggleMic = useCallback(() => {
    if (listening) { recRef.current?.stop(); setListening(false); return }
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecCtor
      webkitSpeechRecognition?: SpeechRecCtor
    }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) { inputRef.current?.focus(); return }
    const rec = new Ctor()
    rec.lang = 'en-US'
    rec.interimResults = true
    rec.continuous = false
    rec.onresult = (e) => {
      let t = ''
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript
      setInput(t)
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recRef.current = rec
    rec.start()
    setListening(true)
  }, [listening])

  // Esc to close + a simple focus trap inside the open dialog.
  const onBoxKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeBox(); return }
      if (e.key !== 'Tab') return
      const root = boxRef.current
      if (!root) return
      const focusables = root.querySelectorAll<HTMLElement>(
        'button, textarea, [href], input, [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    },
    [closeBox],
  )

  const active = listening || thinking

  return (
    <div className="siri">
      <style>{STYLES}</style>

      {/* ---- Resting / hover pill (lives in the toolbar) ---- */}
      <button
        ref={pillRef}
        type="button"
        className="siri-pill siri-glass"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Ask the assistant"
        data-open={open}
        onClick={() => (open ? closeBox() : openBox())}
      >
        <span className="siri-aura" aria-hidden />
        <Sparkles className="siri-pill-icon" size={15} strokeWidth={2.25} />
        <span className="siri-pill-label">Ask</span>
      </button>

      {/* ---- Expanded glass box (portaled to <body>) ---- */}
      {createPortal(
        <AnimatePresence>
          {open && anchor && (
            <>
              {/* Tap-out layer. Transparent; closes on click. */}
              <motion.div
                className="siri-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeBox}
              />
              <motion.div
                ref={boxRef}
                className="siri-box siri-glass"
                role="dialog"
                aria-modal="true"
                aria-label="Assistant"
                data-active={active}
                style={{ top: anchor.top, left: anchor.left, width: BOX_W, transformOrigin: 'top left' }}
                // Morph: grow out of the pill (top-left origin) with a spring.
                initial={{ opacity: 0, scaleX: 0.18, scaleY: 0.12, y: -6 }}
                animate={{ opacity: 1, scaleX: 1, scaleY: 1, y: 0 }}
                exit={{ opacity: 0, scaleX: 0.18, scaleY: 0.12, y: -6 }}
                transition={{ type: 'spring', stiffness: 360, damping: 30, mass: 0.8 }}
                onKeyDown={onBoxKeyDown}
              >
                {/* Glow + wave layers, contained inside the glass. */}
                <span className="siri-aura" aria-hidden />
                <span className="siri-wave" aria-hidden />

                <header className="siri-head">
                  <span className="siri-head-title">
                    <Sparkles size={14} strokeWidth={2.25} />
                    Assistant
                  </span>
                  <button type="button" className="siri-icon-btn" aria-label="Close" onClick={closeBox}>
                    <X size={15} strokeWidth={2.5} />
                  </button>
                </header>

                <div className="siri-thread">
                  {messages.length === 0 && (
                    <div className="siri-empty">
                      <Sparkles size={20} strokeWidth={1.75} />
                      <p>Ask me anything about your work.</p>
                    </div>
                  )}
                  {messages.map((m, i) => (
                    <div key={i} className={`siri-msg ${m.role}`}>
                      {m.text === '' && m.role === 'assistant' ? (
                        <span className="siri-typing" aria-label="Thinking">
                          <i /><i /><i />
                        </span>
                      ) : (
                        m.text
                      )}
                    </div>
                  ))}
                  <div ref={threadEndRef} />
                </div>

                <div className="siri-input-row">
                  <button
                    type="button"
                    className={`siri-icon-btn mic ${listening ? 'on' : ''}`}
                    aria-label={listening ? 'Stop listening' : 'Start voice input'}
                    aria-pressed={listening}
                    onClick={toggleMic}
                  >
                    <Mic size={16} strokeWidth={2.25} />
                  </button>
                  <textarea
                    ref={inputRef}
                    className="siri-textarea"
                    rows={1}
                    placeholder={listening ? 'Listening…' : 'Message'}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit() }
                    }}
                    aria-label="Message the assistant"
                  />
                  <button
                    type="button"
                    className="siri-icon-btn send"
                    aria-label="Send"
                    disabled={!input.trim() || thinking}
                    onClick={() => void submit()}
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

const STYLES = `
.siri{
  /* ---- Tunable tokens ---- */
  --glass-opacity: 0.6;                 /* master frosted-intensity knob (0..1) */
  --glass-bg: rgba(17,19,27, var(--glass-opacity));
  --glass-blur: 22px;
  --glass-rim-highlight: rgba(255,255,255,0.55);
  /* Soft, desaturated glow palette (NOT neon). */
  --siri-glow-pink:   #e6a8c6;
  --siri-glow-blue:   #6f8ed4;
  --siri-glow-purple: #a690e0;
  --siri-glow-orange: #e6b289;
  --siri-glow-gradient: conic-gradient(from 200deg,
    var(--siri-glow-pink), var(--siri-glow-purple),
    var(--siri-glow-blue), var(--siri-glow-orange), var(--siri-glow-pink));
  --ease-spring: cubic-bezier(.2,.9,.2,1.1);
  --expand-duration: 420ms;
  --wave-duration: 5s;
  --ui:'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
  display:inline-flex;
}

/* ---- Glass material (shared by pill + box) ---- */
.siri-glass{
  position:relative;
  background: var(--glass-bg);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.35);
  backdrop-filter: blur(var(--glass-blur)) saturate(1.35);
  border: 1px solid rgba(255,255,255,0.10);
  box-shadow:
    inset 0 1px 0 var(--glass-rim-highlight),   /* bright top rim — light catching the edge */
    inset 0 -12px 26px rgba(0,0,0,0.34),        /* soft inner shadow */
    0 10px 38px rgba(8,10,18,0.45);             /* drop shadow */
  overflow:hidden;                              /* contain the aura + wave */
  isolation:isolate;                            /* keep blend modes local */
}
/* faint specular sheen across the top */
.siri-glass::after{
  content:""; position:absolute; inset:0; pointer-events:none; z-index:2;
  background: linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0) 38%);
}

/* ---- Drifting multicolor aura (the glow under the glass) ---- */
.siri-aura{
  position:absolute; inset:-45%; z-index:0; pointer-events:none;
  background:
    radial-gradient(38% 38% at 25% 30%, var(--siri-glow-pink),   transparent 70%),
    radial-gradient(42% 42% at 75% 22%, var(--siri-glow-blue),   transparent 70%),
    radial-gradient(46% 46% at 68% 74%, var(--siri-glow-purple), transparent 70%),
    radial-gradient(40% 40% at 28% 80%, var(--siri-glow-orange), transparent 70%);
  filter: blur(22px) saturate(1.1);
  mix-blend-mode: screen;                        /* glow reads as light on dark */
  opacity: .30;                                  /* idle: dim */
  animation: siriDrift var(--wave-duration) ease-in-out infinite alternate;
  will-change: transform;
}
@keyframes siriDrift{
  0%   { transform: translate3d(-4%,-3%,0) scale(1.05) rotate(0deg); }
  50%  { transform: translate3d(3%,2%,0)   scale(1.16) rotate(7deg); }
  100% { transform: translate3d(-2%,4%,0)  scale(1.08) rotate(-6deg); }
}

/* ---- Listening / thinking wave (luminous band sweeping the surface) ---- */
.siri-wave{
  position:absolute; inset:0; z-index:1; pointer-events:none;
  opacity:0; mix-blend-mode:screen; transition:opacity .3s ease;
  background: linear-gradient(100deg,
    transparent 18%,
    rgba(255,255,255,.16) 42%,
    var(--siri-glow-pink) 48%,
    var(--siri-glow-blue) 54%,
    transparent 82%);
  background-size: 250% 100%;
}

/* ===========================  PILL  =========================== */
.siri-pill{
  display:inline-flex; align-items:center; gap:6px;
  height:32px; padding:0 12px 0 9px; border-radius:999px;
  color:#f3f4fa; font:600 13px/1 var(--ui); letter-spacing:.01em;
  cursor:pointer; -webkit-tap-highlight-color:transparent;
  transition: transform .18s var(--ease-spring), box-shadow .25s ease;
}
.siri-pill .siri-aura{ opacity:.34; }
.siri-pill .siri-pill-icon, .siri-pill .siri-pill-label{ position:relative; z-index:2; }
.siri-pill .siri-pill-icon{ color:#fbe6f0; filter: drop-shadow(0 0 6px rgba(230,168,198,.55)); }
.siri-pill:hover{ transform: scale(1.05); }
.siri-pill:hover .siri-aura{ opacity:.5; }        /* hover: glow brightens */
.siri-pill:active{ transform: scale(.97); }
.siri-pill[data-open="true"] .siri-aura{ opacity:.55; }

/* ===========================  BOX  =========================== */
.siri-backdrop{ position:fixed; inset:0; z-index:1190; background:transparent; }
.siri-box{
  position:fixed; z-index:1200;
  display:flex; flex-direction:column;
  max-height:min(70vh, 520px);
  border-radius:20px; color:#eceef6;
}
.siri-box.siri-glass{ --glass-blur: 26px; }
.siri-box[data-active="true"] .siri-aura{ opacity:.6; animation-duration: 3.2s; }  /* brighten + speed up */
.siri-box[data-active="true"] .siri-wave{ opacity:.5; animation: siriSweep 2.4s linear infinite; }
@keyframes siriSweep{ from{ background-position:120% 0 } to{ background-position:-120% 0 } }

.siri-head{
  position:relative; z-index:3;
  display:flex; align-items:center; justify-content:space-between;
  padding:11px 12px 9px 14px; border-bottom:1px solid rgba(255,255,255,.08);
}
.siri-head-title{ display:inline-flex; align-items:center; gap:7px; font:600 13px/1 var(--ui); color:#f1eef8; }
.siri-head-title svg{ color: var(--siri-glow-purple); }

.siri-thread{
  position:relative; z-index:3;
  display:flex; flex-direction:column; gap:8px;
  padding:12px; overflow-y:auto; -webkit-overflow-scrolling:touch;
  min-height:80px;
}
.siri-empty{
  margin:auto; display:flex; flex-direction:column; align-items:center; gap:8px;
  color:rgba(236,238,246,.55); text-align:center; padding:18px 8px;
}
.siri-empty svg{ color: var(--siri-glow-pink); opacity:.8; }
.siri-empty p{ margin:0; font:500 13px/1.4 var(--ui); max-width:200px; }

.siri-msg{
  max-width:86%; padding:8px 11px; border-radius:14px;
  font:450 13.5px/1.45 var(--ui); white-space:pre-wrap; overflow-wrap:anywhere;
}
.siri-msg.user{ align-self:flex-end; background:rgba(255,255,255,.15); color:#fff; border-bottom-right-radius:5px; }
.siri-msg.assistant{ align-self:flex-start; background:rgba(255,255,255,.055); color:#e8eaf3; border-bottom-left-radius:5px; }

/* typing dots while awaiting the first token */
.siri-typing{ display:inline-flex; gap:4px; align-items:center; padding:2px 0; }
.siri-typing i{ width:6px; height:6px; border-radius:50%; background:rgba(255,255,255,.6); animation: siriBlink 1.2s infinite ease-in-out; }
.siri-typing i:nth-child(2){ animation-delay:.18s } .siri-typing i:nth-child(3){ animation-delay:.36s }
@keyframes siriBlink{ 0%,80%,100%{ opacity:.25; transform:translateY(0) } 40%{ opacity:1; transform:translateY(-2px) } }

.siri-input-row{
  position:relative; z-index:3;
  display:flex; align-items:flex-end; gap:8px;
  padding:10px; border-top:1px solid rgba(255,255,255,.08);
}
.siri-textarea{
  flex:1; resize:none; max-height:96px;
  background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12); border-radius:12px;
  padding:8px 11px; color:#fff; font:450 14px/1.35 var(--ui); outline:none;
}
.siri-textarea::placeholder{ color:rgba(255,255,255,.45) }
.siri-textarea:focus{ border-color:rgba(166,144,224,.6); box-shadow:0 0 0 3px rgba(166,144,224,.18) }

.siri-icon-btn{
  display:inline-flex; align-items:center; justify-content:center;
  width:34px; height:34px; flex:0 0 auto; border-radius:11px;
  background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.1);
  color:#e9ebf4; cursor:pointer; transition: background .15s ease, transform .12s ease, opacity .2s ease;
}
.siri-icon-btn:hover{ background:rgba(255,255,255,.13) }
.siri-icon-btn:active{ transform:scale(.94) }
.siri-icon-btn:disabled{ opacity:.4; cursor:default }
.siri-icon-btn.send{ background:rgba(166,144,224,.85); border-color:transparent; color:#1a1430 }
.siri-icon-btn.send:hover:not(:disabled){ background:rgba(176,156,232,1) }
.siri-icon-btn.mic.on{ background:rgba(230,168,198,.9); border-color:transparent; color:#2a1422; }
.siri-icon-btn.mic.on{ animation: siriMicPulse 1.4s ease-in-out infinite; }
@keyframes siriMicPulse{ 0%,100%{ box-shadow:0 0 0 0 rgba(230,168,198,.5) } 50%{ box-shadow:0 0 0 6px rgba(230,168,198,0) } }

/* ---- Light-mode fallback (dark is the hero; this keeps it legible) ---- */
@media (prefers-color-scheme: light){
  .siri{ --glass-bg: rgba(28,30,40, calc(var(--glass-opacity) + 0.08)); }
}

/* ---- Reduced motion: static glow, no drift/sweep/pulse ---- */
@media (prefers-reduced-motion: reduce){
  .siri-aura{ animation:none !important; opacity:.3 !important; }
  .siri-wave{ animation:none !important; opacity:0 !important; }
  .siri-typing i, .siri-icon-btn.mic.on{ animation:none !important; }
}
`

/*
 * ── Wiring sendToAssistant ─────────────────────────────────────────────────
 * Pass a function that forwards to your existing assistant. In this app that's
 * the same backend the right-side ChatPanel uses:
 *
 *   const sendToAssistant = useCallback(
 *     async (question, history) => {
 *       const res = await apiFetch('/api/chat', {
 *         method: 'POST',
 *         headers: { 'Content-Type': 'application/json' },
 *         body: JSON.stringify({ latex, history, question }),
 *       })
 *       if (!res.ok) throw new Error(`Server responded ${res.status}`)
 *       const { reply } = (await res.json()) as { reply: string }
 *       return reply
 *     },
 *     [latex],
 *   )
 *
 * If/when the backend streams (e.g. text/event-stream), change `sendToAssistant`
 * to accept an `onToken` callback and call `setLastAssistant(accumulated)` per
 * chunk instead of using the local `revealInto` typewriter — the UI is already
 * built to render an assistant message that grows over time.
 */
