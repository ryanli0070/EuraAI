type LandingProps = {
  onEnter: () => void
}

export function Landing({ onEnter }: LandingProps) {
  return (
    <div className="min-h-screen w-full overflow-y-auto bg-gradient-to-b from-violet-50 via-white to-white text-neutral-900">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-violet-600" />
          <span className="text-lg font-semibold tracking-tight">EuraAI</span>
        </div>
        <button
          onClick={onEnter}
          className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-sm hover:border-neutral-300"
        >
          Open whiteboard
        </button>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="flex flex-col items-center gap-6 py-20 text-center">
          <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium uppercase tracking-wide text-violet-700">
            Math tutor, on your whiteboard
          </span>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
            Work through problems. <span className="text-violet-600">Get a hint, not the answer.</span>
          </h1>
          <p className="max-w-2xl text-lg text-neutral-600">
            Sketch your steps on an infinite canvas. EuraAI checks your work and nudges you toward the next move
            — so you learn the math instead of copying it.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={onEnter}
              className="rounded-full bg-violet-600 px-7 py-3 text-base font-semibold text-white shadow-lg transition-transform hover:bg-violet-700 active:scale-95"
            >
              Enter whiteboard →
            </button>
            <a
              href="#how-it-works"
              className="rounded-full px-6 py-3 text-base font-medium text-neutral-700 hover:text-neutral-900"
            >
              How it works
            </a>
          </div>
        </section>

        <section id="how-it-works" className="grid gap-6 py-12 sm:grid-cols-3">
          <Feature
            title="Draw freely"
            body="Scribble equations, diagrams, and steps on a tldraw canvas — pen, touch, or mouse."
          />
          <Feature
            title="Check your work"
            body="One tap captures your canvas and asks the model to review the latest step."
          />
          <Feature
            title="Guided hints"
            body="If something's off, you get a targeted nudge — never the full solution."
          />
        </section>

        <section className="py-16 text-center">
          <div className="mx-auto max-w-xl rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-semibold tracking-tight">Ready to try?</h2>
            <p className="mt-2 text-neutral-600">Jump into the whiteboard — no sign-in needed.</p>
            <button
              onClick={onEnter}
              className="mt-5 rounded-full bg-violet-600 px-7 py-3 text-base font-semibold text-white shadow-lg transition-transform hover:bg-violet-700 active:scale-95"
            >
              Open whiteboard
            </button>
          </div>
        </section>

        <footer className="py-10 text-center text-sm text-neutral-500">
          © {new Date().getFullYear()} EuraAI
        </footer>
      </main>
    </div>
  )
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">{body}</p>
    </div>
  )
}
