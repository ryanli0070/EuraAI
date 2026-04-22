import { PenLine, ScanSearch, Lightbulb } from 'lucide-react'
import { Features } from './ui/features'
import { HandwritingAnimation } from './HandwritingAnimation'
import { RobotThinkingAnimation } from './RobotThinkingAnimation'

const HOW_IT_WORKS = [
  {
    id: 1,
    icon: PenLine,
    title: "Draw your steps",
    description: "Write equations step-by-step on an infinite graph-paper canvas. Use a mouse, touch, or Apple Pencil — just like a real whiteboard.",
    custom: <HandwritingAnimation />,
  },
  {
    id: 2,
    icon: ScanSearch,
    title: "EuraAI finds the mistake",
    description: "Hit Check Work and EuraAI reads your handwriting, parses every step, and pinpoints exactly where the logic breaks down.",
    custom: <RobotThinkingAnimation />,
  },
  {
    id: 3,
    icon: Lightbulb,
    title: "A question, not an answer",
    description: "You get a targeted Socratic question about your own work — never the solution. You figure it out yourself and actually learn it.",
    image: "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=600&h=400&fit=crop&auto=format",
  },
]

type LandingProps = {
  onEnter: () => void
}

export function Landing({ onEnter }: LandingProps) {
  return (
    <div className="min-h-screen w-full overflow-y-auto bg-white text-neutral-900">

      {/* Nav */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white text-sm font-bold">
            E
          </div>
          <span className="text-base font-semibold tracking-tight">EuraAI</span>
        </div>
        <button
          onClick={onEnter}
          className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors shadow-sm"
        >
          Open whiteboard
        </button>
      </header>

      {/* Hero — graph paper background */}
      <section
        className="relative overflow-hidden border-b border-neutral-200"
        style={{
          backgroundImage: `
            linear-gradient(to right, #e5e7eb 1px, transparent 1px),
            linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)
          `,
          backgroundSize: '32px 32px',
        }}
      >
        {/* Fade edges */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/60 via-transparent to-white" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white via-transparent to-white" />

        <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 pb-20 pt-20 text-center">
          <span className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-medium uppercase tracking-widest text-blue-600 shadow-sm">
            Socratic math tutor
          </span>

          <h1 className="max-w-4xl text-5xl font-bold leading-[1.1] tracking-tight sm:text-7xl">
            Work through it.{' '}
            <span className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
              Don't be handed it.
            </span>
          </h1>

          <p className="max-w-xl text-lg leading-relaxed text-neutral-500">
            Draw your math steps on an infinite whiteboard. EuraAI finds your first mistake
            and asks the question that helps you see it — never gives you the answer.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={onEnter}
              className="rounded-full bg-blue-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-200 transition-all hover:bg-blue-700 active:scale-95"
            >
              Try the whiteboard →
            </button>
            <button
              onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
              className="rounded-full px-6 py-3.5 text-base font-medium text-neutral-400 hover:text-neutral-700 transition-colors"
            >
              How it works
            </button>
          </div>
        </div>
      </section>

      {/* Mockup — sits on grid */}
      <section
        className="relative border-b border-neutral-200"
        style={{
          backgroundImage: `
            linear-gradient(to right, #f3f4f6 1px, transparent 1px),
            linear-gradient(to bottom, #f3f4f6 1px, transparent 1px)
          `,
          backgroundSize: '32px 32px',
        }}
      >
        <div className="mx-auto max-w-4xl px-6 py-16">
          <div className="rounded-2xl border border-neutral-200 bg-white shadow-xl overflow-hidden">
            {/* Window chrome */}
            <div className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50 px-4 py-3">
              <div className="h-3 w-3 rounded-full bg-red-300" />
              <div className="h-3 w-3 rounded-full bg-yellow-300" />
              <div className="h-3 w-3 rounded-full bg-green-300" />
              <span className="ml-3 text-xs text-neutral-400">EuraAI whiteboard</span>
            </div>

            {/* Graph paper canvas area */}
            <div
              style={{
                backgroundImage: `
                  linear-gradient(to right, #d1d5db 1px, transparent 1px),
                  linear-gradient(to bottom, #d1d5db 1px, transparent 1px)
                `,
                backgroundSize: '24px 24px',
                backgroundPosition: '0 0',
                padding: '0',
              }}
            >
              {/* Steps snapped to grid — each row is 48px (2 grid cells) */}
              <div style={{ fontFamily: "'Caveat', cursive", fontSize: '22px' }}>

                {/* Step 1 */}
                <div className="flex items-center" style={{ height: '48px', paddingLeft: '24px', paddingRight: '16px', borderBottom: '1px solid transparent' }}>
                  <span style={{ color: '#9ca3af', fontSize: '11px', width: '20px', fontFamily: 'system-ui' }}>1</span>
                  <span style={{ marginLeft: '12px', color: '#1e3a5f' }}>2x + 3 = 7</span>
                  <span className="ml-auto rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-emerald-600 shrink-0" style={{ fontSize: '11px', fontFamily: 'system-ui' }}>✓ correct</span>
                </div>

                {/* Step 2 */}
                <div className="flex items-center" style={{ height: '48px', paddingLeft: '24px', paddingRight: '16px' }}>
                  <span style={{ color: '#9ca3af', fontSize: '11px', width: '20px', fontFamily: 'system-ui' }}>2</span>
                  <span style={{ marginLeft: '12px', color: '#1e3a5f' }}>2x = 10</span>
                  <span className="ml-auto rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-red-500 shrink-0" style={{ fontSize: '11px', fontFamily: 'system-ui' }}>✗ error</span>
                </div>

                {/* Step 3 */}
                <div className="flex items-center" style={{ height: '48px', paddingLeft: '24px', paddingRight: '16px' }}>
                  <span style={{ color: '#9ca3af', fontSize: '11px', width: '20px', fontFamily: 'system-ui' }}>3</span>
                  <span style={{ marginLeft: '12px', color: '#d1d5db', textDecoration: 'line-through' }}>x = 5</span>
                </div>

              </div>

              {/* Hint card — also grid-aligned */}
              <div className="border-t border-blue-200 bg-blue-50 px-6 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-500 mb-1" style={{ fontFamily: 'system-ui' }}>Hint</p>
                <p className="text-sm text-neutral-600 leading-relaxed" style={{ fontFamily: 'system-ui' }}>
                  In{' '}
                  <span className="text-blue-600" style={{ fontFamily: "'Caveat', cursive", fontSize: '17px' }}>2x = 10</span>
                  , when you moved the{' '}
                  <span className="text-blue-600" style={{ fontFamily: "'Caveat', cursive", fontSize: '17px' }}>+3</span>
                  {' '}across the equals sign, what operation should you have performed on the other side?
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="how-it-works" className="border-b border-neutral-200">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="mb-10 text-center text-2xl font-bold tracking-tight">How it works</h2>
          <Features features={HOW_IT_WORKS} />
        </div>
      </section>

      {/* Math symbols strip */}
      <section className="border-b border-neutral-200 overflow-hidden">
        <div className="flex select-none items-center gap-10 px-8 py-5 text-2xl text-neutral-200 whitespace-nowrap">
          {['∫', 'Σ', '√', 'π', '∂', 'θ', '±', '∞', '≠', '≈', '∈', '⊂', 'dx', 'f(x)', 'lim', '∇', 'λ', 'α', 'β', 'γ', '∫', 'Σ', '√', 'π', '∂', 'θ', '±', '∞', '≠', '≈'].map((sym, i) => (
            <span key={i} className="font-mono">{sym}</span>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section
        className="relative"
        style={{
          backgroundImage: `
            linear-gradient(to right, #e5e7eb 1px, transparent 1px),
            linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)
          `,
          backgroundSize: '32px 32px',
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/50 to-white/90" />
        <div className="relative mx-auto max-w-xl px-6 py-24 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Ready to think for yourself?</h2>
          <p className="mt-3 text-neutral-500">No sign-in needed. Open the whiteboard and start writing.</p>
          <button
            onClick={onEnter}
            className="mt-8 rounded-full bg-blue-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-200 transition-all hover:bg-blue-700 active:scale-95"
          >
            Open whiteboard
          </button>
        </div>
      </section>

      <footer className="border-t border-neutral-200 py-8 text-center text-sm text-neutral-400">
        © {new Date().getFullYear()} EuraAI
      </footer>
    </div>
  )
}

