import { useEffect, useRef } from 'react'

type LandingProps = {
  onEnter: () => void
}

const STYLES = `
.landing-root{
  --paper:#f6f1e6;
  --paper-2:#efe8d6;
  --ink:#18243f;
  --ink-soft:#3a4a69;
  --pencil:#6b7284;
  --rule:#d9cfb6;
  --rule-soft:#e7dfc9;
  --red:#b4453d;
  --red-soft:#e2a8a2;
  --accent:#2d5ad9;
  --sans:'Fraunces','Iowan Old Style',Georgia,serif;
  --hand:'Caveat','Comic Sans MS',cursive;
  --mono:'JetBrains Mono',ui-monospace,monospace;
  font-family:var(--sans);
  color:var(--ink);
  background:var(--paper);
  font-size:17px;
  line-height:1.55;
  -webkit-font-smoothing:antialiased;
  overflow-x:hidden;
  position:relative;
  min-height:100vh;
}
.landing-root *{box-sizing:border-box}
.landing-root::before{
  content:"";position:absolute;inset:0;pointer-events:none;z-index:0;
  background-image:
    radial-gradient(rgba(24,36,63,0.035) 1px, transparent 1.2px),
    radial-gradient(rgba(24,36,63,0.02) 1px, transparent 1.2px);
  background-size:3px 3px,7px 7px;
  background-position:0 0,1px 2px;
  mix-blend-mode:multiply;
}
.landing-root main,
.landing-root header,
.landing-root footer,
.landing-root section{position:relative;z-index:1}

.landing-root .container{max-width:1180px;margin:0 auto;padding:0 36px}
.landing-root .mono{font-family:var(--mono);font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:var(--pencil)}
.landing-root .hand{font-family:var(--hand)}
.landing-root .serif{font-family:var(--sans)}
.landing-root .ink{color:var(--ink)}
.landing-root .pencil{color:var(--pencil)}
.landing-root .red{color:var(--red)}

.landing-root nav.top{
  display:flex;align-items:center;justify-content:space-between;
  padding:26px 36px;max-width:1180px;margin:0 auto;
}
.landing-root .logo{display:flex;align-items:center;gap:10px}
.landing-root .logo-mark{width:36px;height:36px;position:relative}
.landing-root .logo-mark svg{width:100%;height:100%;display:block}
.landing-root .logo-word{font-family:var(--sans);font-weight:500;font-size:20px;letter-spacing:-0.01em}
.landing-root .logo-word em{font-style:italic;font-weight:400;color:var(--pencil)}
.landing-root .nav-links{display:flex;gap:36px;align-items:center;font-family:var(--sans);font-size:15px;color:var(--ink-soft)}
.landing-root .nav-links a{color:inherit;text-decoration:none;position:relative;padding:4px 0;cursor:pointer}
.landing-root .nav-links a:hover{color:var(--ink)}
.landing-root .nav-links a.underlined::after{
  content:"";position:absolute;left:-4px;right:-4px;bottom:-2px;height:8px;
  background:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 10'><path d='M2 6 Q 30 1 60 5 T 118 4' stroke='%2318243f' stroke-width='1.5' fill='none' stroke-linecap='round'/></svg>") no-repeat center/100% 100%;
}
.landing-root .btn{
  font-family:var(--sans);font-weight:500;font-size:15px;
  padding:10px 20px;border-radius:999px;border:1.5px solid var(--ink);
  background:var(--ink);color:var(--paper);cursor:pointer;
  display:inline-flex;align-items:center;gap:10px;
  text-decoration:none;transition:transform .15s ease,background .2s ease;
}
.landing-root .btn:hover{transform:translateY(-1px)}
.landing-root .btn.ghost{background:transparent;color:var(--ink)}
.landing-root .btn.ghost:hover{background:var(--ink);color:var(--paper)}
.landing-root .btn .arrow{display:inline-block;transition:transform .2s ease}
.landing-root .btn:hover .arrow{transform:translateX(3px)}

.landing-root .hero{padding:40px 0 120px;position:relative}
.landing-root .hero-eyebrow{display:flex;align-items:center;gap:14px;margin-bottom:28px}
.landing-root .hero-eyebrow .dot{width:6px;height:6px;border-radius:999px;background:var(--red);display:inline-block}
.landing-root .hero h1{
  font-family:var(--sans);font-weight:300;
  font-size:clamp(40px,5.8vw,88px);line-height:0.98;letter-spacing:-0.035em;
  margin:0 0 32px;max-width:11ch;
  font-variation-settings:"opsz" 144,"SOFT" 50;
}
.landing-root .hero h1 .strike,
.landing-root .hero h1 .hand-word{white-space:nowrap}
.landing-root .hero h1 .it{font-style:italic;font-weight:400}
.landing-root .hero h1 .hand-word{
  font-family:var(--hand);font-weight:600;letter-spacing:-0.01em;color:var(--ink);
  font-style:normal;position:relative;display:inline-block;
}
.landing-root .hero h1 .strike{position:relative;color:var(--pencil)}
.landing-root .hero h1 .strike::after{
  content:"";position:absolute;left:-4%;right:-4%;top:54%;height:10px;
  background:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 10' preserveAspectRatio='none'><path d='M2 5 Q 80 1 150 6 T 298 4' stroke='%23b4453d' stroke-width='2.4' fill='none' stroke-linecap='round'/></svg>") no-repeat center/100% 100%;
  transform-origin:left center;
  animation:euraai-strike-in 0.7s 1.6s cubic-bezier(.6,.1,.3,1) both;
}
@keyframes euraai-strike-in{from{transform:scaleX(0)}to{transform:scaleX(1)}}

.landing-root .hero-sub{
  max-width:540px;font-size:19px;line-height:1.55;color:var(--ink-soft);font-weight:400;margin:0 0 44px;
}
.landing-root .hero-sub em{font-style:italic}
.landing-root .hero-cta{display:flex;align-items:center;gap:22px;flex-wrap:wrap}

.landing-root .hero-grid{display:grid;grid-template-columns:1.15fr 1fr;gap:56px;align-items:center}
@media (max-width:960px){.landing-root .hero-grid{grid-template-columns:1fr;gap:40px}}

.landing-root .demo-card{
  position:relative;background:#fdfaf2;border:1.5px solid var(--ink);border-radius:6px;
  padding:26px 28px 30px;
  box-shadow:6px 8px 0 rgba(24,36,63,0.08),0 30px 60px -30px rgba(24,36,63,0.25);
  transform:rotate(-0.6deg);
}
.landing-root .demo-card::before{
  content:"";position:absolute;left:38px;top:-14px;width:90px;height:26px;
  background:rgba(180,69,61,0.15);border:1px dashed rgba(180,69,61,0.5);transform:rotate(-3deg);
}
.landing-root .demo-card .paper{
  background-image:
    linear-gradient(to right,var(--rule-soft) 1px,transparent 1px),
    linear-gradient(to bottom,var(--rule-soft) 1px,transparent 1px);
  background-size:28px 28px;
  border:1px dashed var(--rule);border-radius:3px;padding:22px 24px 26px;
  position:relative;min-height:320px;
}
.landing-root .demo-card .page-label{position:absolute;top:-10px;left:16px;background:#fdfaf2;padding:0 8px}

.landing-root .hint-card{
  margin-top:18px;border:1.5px solid var(--ink);border-radius:4px;background:#fffaee;padding:14px 16px;
  position:relative;opacity:0;transform:translateY(8px);
  animation:euraai-rise 0.6s 3.6s forwards;
}
@keyframes euraai-rise{to{opacity:1;transform:translateY(0)}}
.landing-root .hint-card .label{
  font-family:var(--mono);font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:var(--red);margin-bottom:6px;
}
.landing-root .hint-card .q{font-family:var(--sans);font-size:15px;line-height:1.5;color:var(--ink-soft)}
.landing-root .hint-card .q em{color:var(--ink);font-style:italic;font-weight:500}
.landing-root .hint-card::before{
  content:"";position:absolute;left:-34px;top:10px;width:28px;height:30px;
  background:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 32'><path d='M28 28 Q 10 24 4 4' stroke='%2318243f' stroke-width='1.6' fill='none' stroke-linecap='round'/><path d='M6 10 L 4 4 L 10 6' stroke='%2318243f' stroke-width='1.6' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>") no-repeat center/contain;
}

.landing-root .hero-svg{overflow:visible;display:block}
.landing-root .hero-svg path{fill:none;stroke:var(--ink);stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.landing-root .hero-svg path.red{stroke:var(--red)}
.landing-root .hero-svg .draw{stroke-dasharray:var(--len);stroke-dashoffset:var(--len);animation:euraai-draw 1s forwards cubic-bezier(.65,.05,.36,1)}
@keyframes euraai-draw{to{stroke-dashoffset:0}}

.landing-root .math-strip{
  border-top:1.5px dashed var(--rule);border-bottom:1.5px dashed var(--rule);
  overflow:hidden;white-space:nowrap;padding:18px 0;margin-top:16px;
  background:repeating-linear-gradient(-45deg,transparent 0 22px,rgba(180,69,61,0.035) 22px 24px);
}
.landing-root .math-strip .track{display:inline-flex;gap:56px;animation:euraai-scroll 45s linear infinite;padding-left:56px}
.landing-root .math-strip span{font-family:var(--hand);font-size:36px;color:var(--ink-soft)}
.landing-root .math-strip span.accent{color:var(--red)}
@keyframes euraai-scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}

.landing-root .sec{padding:110px 0}
.landing-root .sec h2{
  font-family:var(--sans);font-weight:300;font-size:clamp(36px,5vw,64px);
  line-height:1.05;letter-spacing:-0.025em;margin:0 0 24px;
}
.landing-root .sec h2 .it{font-style:italic;font-weight:400}
.landing-root .sec h2 .under{position:relative;white-space:nowrap}
.landing-root .sec h2 .under::after{
  content:"";position:absolute;left:-2%;right:-2%;bottom:-6px;height:12px;
  background:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 12' preserveAspectRatio='none'><path d='M3 7 Q 60 2 140 7 T 297 5' stroke='%23b4453d' stroke-width='2.5' fill='none' stroke-linecap='round'/></svg>") no-repeat center/100% 100%;
  transform-origin:left;transform:scaleX(0);transition:transform 1s cubic-bezier(.6,.1,.3,1);
}
.landing-root .sec.in h2 .under::after{transform:scaleX(1)}
.landing-root .sec .lede{max-width:620px;font-size:19px;color:var(--ink-soft)}
.landing-root .sec-head{display:flex;align-items:flex-end;justify-content:space-between;gap:40px;margin-bottom:72px;flex-wrap:wrap}
.landing-root .sec-head .kicker{display:flex;align-items:center;gap:12px;margin-bottom:18px}
.landing-root .sec-head .kicker .rule{width:40px;height:1px;background:var(--ink)}

.landing-root .steps{
  display:grid;grid-template-columns:repeat(3,1fr);gap:0;
  border-top:1.5px solid var(--ink);
}
.landing-root .step{
  padding:36px 28px 40px;border-right:1px dashed var(--rule);position:relative;
  min-height:460px;display:flex;flex-direction:column;
}
.landing-root .step:last-child{border-right:none}
.landing-root .step .num{
  font-family:var(--sans);font-size:13px;font-weight:500;color:var(--pencil);
  letter-spacing:0.04em;margin-bottom:22px;display:flex;align-items:center;gap:10px;
}
.landing-root .step .num .circle{
  width:26px;height:26px;border-radius:50%;border:1.5px solid var(--ink);
  display:inline-flex;align-items:center;justify-content:center;
  font-family:var(--hand);font-size:17px;color:var(--ink);background:var(--paper-2);
}
.landing-root .step h3{
  font-family:var(--sans);font-weight:400;font-size:28px;line-height:1.1;
  letter-spacing:-0.015em;margin:0 0 12px;
}
.landing-root .step h3 .it{font-style:italic}
.landing-root .step p{color:var(--ink-soft);font-size:16px;line-height:1.55;margin:0 0 28px;max-width:340px}
.landing-root .step .art{margin-top:auto;align-self:stretch}
@media (max-width:960px){
  .landing-root .steps{grid-template-columns:1fr}
  .landing-root .step{border-right:none;border-bottom:1px dashed var(--rule)}
  .landing-root .step:last-child{border-bottom:none}
}

.landing-root .art-frame{
  border:1.5px solid var(--ink);border-radius:4px;background:#fdfaf2;
  padding:14px;overflow:hidden;box-shadow:3px 4px 0 rgba(24,36,63,0.06);
}
.landing-root .art-frame svg{display:block;width:100%;height:auto}

.landing-root .two{display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:center}
@media (max-width:960px){.landing-root .two{grid-template-columns:1fr;gap:48px}}
.landing-root .two .card{
  background:#fdfaf2;border:1.5px solid var(--ink);border-radius:6px;
  padding:36px;position:relative;box-shadow:4px 6px 0 rgba(24,36,63,0.07);
}
.landing-root .two .card .mono{margin-bottom:12px;display:block}
.landing-root .two .card h4{
  font-family:var(--sans);font-weight:400;font-size:28px;line-height:1.15;
  letter-spacing:-0.015em;margin:0 0 14px;
}
.landing-root .two .card p{color:var(--ink-soft);font-size:16px;margin:0}
.landing-root .two .card.bad{transform:rotate(-0.4deg)}
.landing-root .two .card.good{transform:rotate(0.4deg);background:#f8f4e6}
.landing-root .bad h4 .cross{position:relative;color:var(--pencil)}
.landing-root .bad h4 .cross::after{
  content:"";position:absolute;left:-4%;right:-4%;top:54%;height:8px;
  background:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 8' preserveAspectRatio='none'><path d='M2 4 Q 80 1 150 5 T 298 3' stroke='%23b4453d' stroke-width='2.2' fill='none' stroke-linecap='round'/></svg>") no-repeat center/100% 100%;
}

.landing-root .feat{
  display:grid;grid-template-columns:repeat(3,1fr);gap:0;
  border-top:1.5px solid var(--ink);border-bottom:1.5px solid var(--ink);
}
.landing-root .feat > div{padding:36px 28px;border-right:1px dashed var(--rule)}
.landing-root .feat > div:last-child{border-right:none}
.landing-root .feat .ico{width:48px;height:48px;margin-bottom:22px}
.landing-root .feat h5{font-family:var(--sans);font-weight:500;font-size:20px;margin:0 0 8px;letter-spacing:-0.01em}
.landing-root .feat p{color:var(--ink-soft);font-size:15px;margin:0}
@media (max-width:960px){
  .landing-root .feat{grid-template-columns:1fr}
  .landing-root .feat > div{border-right:none;border-bottom:1px dashed var(--rule)}
  .landing-root .feat > div:last-child{border-bottom:none}
}

.landing-root .cta{padding:120px 0 140px;text-align:center;position:relative}
.landing-root .cta h2{font-size:clamp(48px,7vw,96px);font-weight:300;letter-spacing:-0.035em;line-height:1}
.landing-root .cta h2 .it{font-style:italic}
.landing-root .cta .sub{font-size:19px;color:var(--ink-soft);max-width:520px;margin:24px auto 40px}

.landing-root footer.foot{
  border-top:1.5px solid var(--ink);padding:32px 36px;
  display:flex;justify-content:space-between;align-items:center;
  font-size:13px;color:var(--pencil);max-width:1180px;margin:0 auto;font-family:var(--sans);
}
.landing-root footer.foot .links{display:flex;gap:28px}
.landing-root footer.foot a{color:inherit;text-decoration:none}
.landing-root footer.foot a:hover{color:var(--ink)}

.landing-root .doodle{position:absolute;pointer-events:none}
.landing-root .doodle path{fill:none;stroke:var(--ink);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.landing-root .doodle path.red{stroke:var(--red)}

.landing-root .reveal{opacity:0;transform:translateY(14px);transition:opacity .8s ease,transform .8s ease}
.landing-root .reveal.in{opacity:1;transform:none}
`

export function Landing({ onEnter }: LandingProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    // Stagger handwriting-draw animations in hero equations
    const stagger = (el: Element | null, base: number) => {
      if (!el) return
      el.querySelectorAll<SVGPathElement>('path.draw').forEach((p, i) => {
        p.style.animationDelay = `${base + i * 0.22}s`
      })
    }
    stagger(root.querySelector('#eq1'), 0.3)
    stagger(root.querySelector('#eq2'), 2.0)

    // Pre-set dashoffset so step-diagram paths don't flash before the observer fires
    root.querySelectorAll<SVGPathElement>('[data-anim] path, [data-anim] .mark').forEach(el => {
      try {
        const len = el.getTotalLength()
        el.style.strokeDasharray = String(len)
        el.style.strokeDashoffset = String(len)
      } catch {
        /* non-path element */
      }
    })
    root.querySelectorAll<SVGGElement>('[data-anim] .fade-text').forEach(el => {
      el.style.opacity = '0'
    })

    const timeouts: number[] = []
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('in')
        const marks = entry.target.querySelectorAll<SVGElement>(
          '[data-anim] path, [data-anim] .mark, [data-anim] .fade-text'
        )
        marks.forEach(el => {
          const delay = parseFloat(el.getAttribute('data-delay') || '0')
          if (el.classList.contains('fade-text')) {
            el.style.opacity = '0'
            el.style.transition = 'opacity .5s ease'
            timeouts.push(window.setTimeout(() => { el.style.opacity = '1' }, (0.4 + delay) * 1000))
          } else {
            try {
              const p = el as SVGPathElement
              const len = p.getTotalLength()
              p.style.strokeDasharray = String(len)
              p.style.strokeDashoffset = String(len)
              p.style.transition = 'stroke-dashoffset 1s cubic-bezier(.65,.05,.36,1)'
              timeouts.push(window.setTimeout(() => { p.style.strokeDashoffset = '0' }, (0.2 + delay) * 1000))
            } catch {
              /* non-path */
            }
          }
        })
        io.unobserve(entry.target)
      })
    }, { threshold: 0.3 })

    root.querySelectorAll('.reveal, .sec').forEach(el => io.observe(el))

    return () => {
      io.disconnect()
      timeouts.forEach(t => window.clearTimeout(t))
    }
  }, [])

  const scrollTo = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    rootRef.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const go = (e: React.MouseEvent) => {
    e.preventDefault()
    onEnter()
  }

  return (
    <div ref={rootRef} className="landing-root">
      <style>{STYLES}</style>

      <nav className="top">
        <div className="logo">
          <div className="logo-mark">
            <svg viewBox="0 0 40 40" fill="none">
              <path d="M 20 3 C 30 3, 37 11, 37 20 C 37 31, 29 37, 20 37 C 9 37, 3 29, 3 20 C 3 10, 11 3, 20 3 Z" stroke="#18243f" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M 13 12 L 27 12 M 13 20 L 24 20 M 13 28 L 27 28" stroke="#18243f" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </div>
          <span className="logo-word">Eura<em>AI</em></span>
        </div>
        <div className="nav-links">
          <a href="#how" className="underlined" onClick={scrollTo('how')}>How it works</a>
          <a href="#why" onClick={scrollTo('why')}>Why</a>
          <a href="#features" onClick={scrollTo('features')}>Features</a>
          <a href="#start" className="btn ghost" style={{ padding: '8px 18px' }} onClick={go}>Open whiteboard →</a>
        </div>
      </nav>

      <main>
        <section className="hero">
          <div className="container">
            <svg className="doodle" style={{ top: '-10px', right: '6%', width: '120px', height: '90px' }} viewBox="0 0 120 90">
              <path d="M 10 70 Q 40 10 100 30" />
              <path d="M 92 22 L 100 30 L 92 40" />
            </svg>
            <svg className="doodle" style={{ top: '40%', left: '-30px', width: '70px', height: '70px' }} viewBox="0 0 70 70">
              <path d="M 35 10 L 35 60 M 10 35 L 60 35 M 18 18 L 52 52 M 52 18 L 18 52" strokeWidth="1.4" opacity="0.35" />
            </svg>

            <div className="hero-grid">
              <div>
                <div className="hero-eyebrow">
                  <span className="dot"></span>
                  <span className="mono">A Socratic whiteboard for math</span>
                </div>
                <h1>
                  <span className="it">Work</span> through it.<br />
                  <span className="strike">Don't</span><br />
                  <span className="hand-word">be handed it.</span>
                </h1>
                <p className="hero-sub">
                  Scribble your math on an infinite sheet of graph paper. Orion reads your handwriting, finds your <em>first</em> wrong step, and asks the one question that makes you see it — <em>never</em> the answer.
                </p>
                <div className="hero-cta">
                  <a href="#start" className="btn" onClick={go}>Open the whiteboard <span className="arrow">→</span></a>
                </div>
              </div>

              <div className="demo-card">
                <div className="paper">
                  <span className="mono page-label">scratch.pad — pg 01</span>

                  <svg className="hero-svg" viewBox="0 0 420 70" style={{ width: '100%', height: '70px', marginBottom: '6px' }}>
                    <g id="eq1">
                      <path className="draw" style={{ ['--len' as string]: 110 } as React.CSSProperties} d="M 10 18 Q 24 2 38 12 Q 44 32 16 50 L 8 58 L 42 58" />
                      <path className="draw" style={{ ['--len' as string]: 70 } as React.CSSProperties} d="M 54 18 L 80 52" />
                      <path className="draw" style={{ ['--len' as string]: 70 } as React.CSSProperties} d="M 80 18 L 54 52" />
                      <path className="draw" style={{ ['--len' as string]: 30 } as React.CSSProperties} d="M 96 22 L 96 48" />
                      <path className="draw" style={{ ['--len' as string]: 30 } as React.CSSProperties} d="M 83 35 L 109 35" />
                      <path className="draw" style={{ ['--len' as string]: 130 } as React.CSSProperties} d="M 120 18 Q 134 2 148 12 Q 156 28 135 33 Q 158 36 152 52 Q 138 63 120 54" />
                      <path className="draw" style={{ ['--len' as string]: 50 } as React.CSSProperties} d="M 170 28 L 198 28" />
                      <path className="draw" style={{ ['--len' as string]: 50 } as React.CSSProperties} d="M 170 42 L 198 42" />
                      <path className="draw" style={{ ['--len' as string]: 70 } as React.CSSProperties} d="M 212 18 L 248 18" />
                      <path className="draw" style={{ ['--len' as string]: 70 } as React.CSSProperties} d="M 248 18 L 228 58" />
                    </g>
                  </svg>

                  <svg className="hero-svg" viewBox="0 0 420 70" style={{ width: '100%', height: '70px', marginBottom: '6px' }}>
                    <g id="eq2">
                      <path className="draw" style={{ ['--len' as string]: 110 } as React.CSSProperties} d="M 10 18 Q 24 2 38 12 Q 44 32 16 50 L 8 58 L 42 58" />
                      <path className="draw" style={{ ['--len' as string]: 70 } as React.CSSProperties} d="M 54 18 L 80 52" />
                      <path className="draw" style={{ ['--len' as string]: 70 } as React.CSSProperties} d="M 80 18 L 54 52" />
                      <path className="draw" style={{ ['--len' as string]: 50 } as React.CSSProperties} d="M 100 28 L 128 28" />
                      <path className="draw" style={{ ['--len' as string]: 50 } as React.CSSProperties} d="M 100 42 L 128 42" />
                      <path className="draw" style={{ ['--len' as string]: 70 } as React.CSSProperties} d="M 142 14 L 142 58" />
                      <path className="draw red" style={{ ['--len' as string]: 160 } as React.CSSProperties} d="M 170 18 Q 158 38 176 54 Q 196 52 196 34 Q 194 12 172 18 Z" />
                      <path className="red" d="M 142 66 Q 160 74 178 66 T 210 66" strokeDasharray="120" strokeDashoffset="120" style={{ animation: 'euraai-draw 0.8s 3.1s forwards' }} />
                    </g>
                  </svg>

                  <div className="hint-card">
                    <div className="label">Orion asks</div>
                    <div className="q">You moved <em>+3</em> across the equals — what did you do on the <em>other side</em>?</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="math-strip">
          <div className="track">
            <span>∫ f(x) dx</span><span>2x + 3 = 7</span><span className="accent">Σ = ?</span>
            <span>√(a² + b²)</span><span>lim → ∞</span><span>dy/dx</span>
            <span>π ≈ 3.14</span><span className="accent">θ + φ</span><span>∂f/∂x</span>
            <span>(x − 2)²</span><span>e^(iπ) = −1</span><span>∇·F</span>
            <span>∫ f(x) dx</span><span>2x + 3 = 7</span><span className="accent">Σ = ?</span>
            <span>√(a² + b²)</span><span>lim → ∞</span><span>dy/dx</span>
            <span>π ≈ 3.14</span><span className="accent">θ + φ</span><span>∂f/∂x</span>
            <span>(x − 2)²</span><span>e^(iπ) = −1</span><span>∇·F</span>
          </div>
        </div>

        <section className="sec" id="how">
          <div className="container">
            <div className="sec-head">
              <div>
                <div className="kicker"><span className="rule"></span><span className="mono">Ch. 01 — How it works</span></div>
                <h2>Three steps. <span className="it">No shortcuts</span> to <span className="under">the answer</span>.</h2>
              </div>
              <p className="lede">You write, Orion reads, Orion asks. The answer stays yours to find — because that's the part where the learning actually happens.</p>
            </div>
          </div>

          <div className="container">
            <div className="steps">
              <div className="step reveal">
                <div className="num"><span className="circle">1</span> Draw</div>
                <h3>Write it by <span className="it">hand</span>.</h3>
                <p>Scribble equations step-by-step on an infinite graph-paper canvas. Mouse, trackpad, finger, or Apple Pencil — whatever you'd use on a real sheet.</p>
                <div className="art art-frame">
                  <svg viewBox="0 0 260 140" data-anim="step1">
                    <defs>
                      <pattern id="grid1" width="20" height="20" patternUnits="userSpaceOnUse">
                        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e7dfc9" strokeWidth="1" />
                      </pattern>
                    </defs>
                    <rect width="260" height="140" fill="url(#grid1)" />
                    <g stroke="#18243f" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M 30 40 Q 44 24 58 34 Q 64 50 45 55 Q 68 58 62 74 Q 48 85 32 76" />
                      <path d="M 80 42 L 106 78" />
                      <path d="M 106 42 L 80 78" />
                      <path d="M 120 60 L 144 60" />
                      <path d="M 158 42 L 192 42" />
                      <path d="M 192 42 L 172 82" />
                      <path d="M 205 52 L 232 52" />
                      <path d="M 205 64 L 232 64" />
                      <path d="M 246 42 Q 248 28 258 38" opacity="0" />
                    </g>
                  </svg>
                </div>
              </div>

              <div className="step reveal">
                <div className="num"><span className="circle">2</span> Check</div>
                <h3>Orion finds the <span className="it">first</span> slip.</h3>
                <p>Hit Check Work. Orion reads every step like a patient tutor — not scanning for the final answer, but tracing your reasoning until something snaps.</p>
                <div className="art art-frame">
                  <svg viewBox="0 0 260 160" data-anim="step2">
                    <defs>
                      <pattern id="grid2" width="20" height="20" patternUnits="userSpaceOnUse">
                        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e7dfc9" strokeWidth="1" />
                      </pattern>
                    </defs>
                    <rect width="260" height="160" fill="url(#grid2)" />
                    <g fontFamily="'Caveat', cursive" fontSize="24" fill="#18243f">
                      <text x="30" y="36">2x + 3 = 7</text>
                      <text x="30" y="74">2x = <tspan>10</tspan></text>
                      <text x="30" y="112" fill="#b0b7c3">x = 5</text>
                    </g>
                    <path className="mark" data-delay="0.2" d="M 170 28 L 178 40 L 198 20" stroke="#2e6b4c" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    <path className="mark" data-delay="0.9" d="M 95 42 Q 68 44 70 62 Q 72 86 95 88 Q 122 88 124 62 Q 122 42 95 42" stroke="#b4453d" strokeWidth="2" fill="none" strokeLinecap="round" />
                    <path className="mark" data-delay="1.4" d="M 124 74 Q 155 80 168 100 Q 174 120 158 132" stroke="#b4453d" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                    <path className="mark" data-delay="1.6" d="M 154 126 L 158 132 L 164 128" stroke="#b4453d" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    <g className="fade-text" data-delay="1.9" fontFamily="'Caveat', cursive" fontSize="18" fill="#b4453d">
                      <text x="70" y="144">first slip —</text>
                      <text x="70" y="158">should be 4</text>
                    </g>
                  </svg>
                </div>
              </div>

              <div className="step reveal">
                <div className="num"><span className="circle">3</span> Think</div>
                <h3>A <span className="it">question</span>, not an answer.</h3>
                <p>You get one Socratic nudge — pointed at your own work. You spot the mistake, fix it yourself, and actually remember it next time.</p>
                <div className="art art-frame">
                  <svg viewBox="0 0 260 140" data-anim="step3">
                    <path className="mark" data-delay="0" d="M 22 30 Q 22 18 36 18 L 220 18 Q 234 18 234 30 L 234 80 Q 234 92 220 92 L 90 92 L 70 112 L 74 92 L 36 92 Q 22 92 22 80 Z"
                      stroke="#18243f" strokeWidth="2" fill="#fdfaf2" strokeLinecap="round" strokeLinejoin="round" />
                    <g fontFamily="'Fraunces', serif" fontSize="13" fill="#18243f">
                      <text x="36" y="44" className="fade-text" data-delay="1.2">When you moved the</text>
                      <text x="36" y="62" className="fade-text" data-delay="1.6"><tspan fontFamily="'Caveat', cursive" fontSize="20" fill="#b4453d">+3</tspan><tspan dx="4">across the </tspan><tspan fontStyle="italic">equals</tspan>,</text>
                      <text x="36" y="80" className="fade-text" data-delay="2.0">what did the other side owe?</text>
                    </g>
                    <g className="mark" data-delay="2.6" transform="translate(185 110)" stroke="#b4453d" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M -8 -4 Q -8 -14 0 -14 Q 8 -14 8 -4 Q 8 2 4 6 L 4 10 L -4 10 L -4 6 Q -8 2 -8 -4 Z" />
                      <path d="M -3 14 L 3 14" />
                      <path d="M -14 -8 L -18 -10" />
                      <path d="M 14 -8 L 18 -10" />
                      <path d="M 0 -20 L 0 -24" />
                    </g>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="sec" id="why" style={{ paddingTop: 40 }}>
          <div className="container">
            <div className="sec-head">
              <div>
                <div className="kicker"><span className="rule"></span><span className="mono">Ch. 02 — Why Socratic</span></div>
                <h2>Most homework help <span className="it">hands you</span> <span className="under">the fish</span>.</h2>
              </div>
              <p className="lede">Orion is built the opposite way. The goal isn't a correct line on the page — it's the <em>click</em> in your head the moment you see your own error.</p>
            </div>

            <div className="two">
              <div className="card bad">
                <span className="mono">Other tools</span>
                <h4>"<span className="cross">Here's the answer</span>." <br />Two seconds, nothing learned.</h4>
                <p>You paste a problem, it spits out x = 5. The assignment gets done. The understanding doesn't.</p>
                <svg width="100%" height="60" viewBox="0 0 300 60" style={{ marginTop: 14 }}>
                  <text x="10" y="32" fontFamily="'Caveat', cursive" fontSize="26" fill="#8b94a6">problem → </text>
                  <text x="130" y="32" fontFamily="'Caveat', cursive" fontSize="26" fill="#b4453d">answer</text>
                  <path d="M 200 28 L 280 28" stroke="#b4453d" strokeWidth="2" fill="none" strokeLinecap="round" />
                  <path d="M 270 22 L 280 28 L 270 34" stroke="#b4453d" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="card good">
                <span className="mono">Orion</span>
                <h4>A question that points at <span className="it">your own work</span>.</h4>
                <p>You do the thinking. Orion is the tutor in the margins — pointing, asking, waiting. The answer arrives in your own handwriting.</p>
                <svg width="100%" height="80" viewBox="0 0 320 80" style={{ marginTop: 14 }}>
                  <text x="10" y="34" fontFamily="'Caveat', cursive" fontSize="26" fill="#3a4a69">your work</text>
                  <path d="M 110 28 Q 140 10 170 28" stroke="#18243f" strokeWidth="2" fill="none" strokeLinecap="round" />
                  <path d="M 163 22 L 170 28 L 163 34" stroke="#18243f" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  <text x="182" y="34" fontFamily="'Caveat', cursive" fontSize="26" fill="#18243f">your aha!</text>
                </svg>
              </div>
            </div>
          </div>
        </section>

        <section className="sec" id="features">
          <div className="container">
            <div className="sec-head">
              <div>
                <div className="kicker"><span className="rule"></span><span className="mono">Ch. 03 — In the margins</span></div>
                <h2>Small things that <span className="it">feel right</span>.</h2>
              </div>
            </div>
          </div>

          <div className="container">
            <div className="feat">
              <div>
                <svg className="ico" viewBox="0 0 48 48" fill="none" stroke="#18243f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M 6 38 L 6 10 L 42 10 L 42 38 Z" />
                  <path d="M 12 16 L 36 16 M 12 22 L 30 22 M 12 28 L 34 28" />
                  <path d="M 38 38 L 44 44" stroke="#b4453d" />
                </svg>
                <h5>Handwriting, read aloud</h5>
                <p>OCR + a reasoning pass. It doesn't just transcribe — it understands the step.</p>
              </div>
              <div>
                <svg className="ico" viewBox="0 0 48 48" fill="none" stroke="#18243f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="24" cy="24" r="18" />
                  <path d="M 24 14 L 24 24 L 32 28" />
                </svg>
                <h5>Infinite canvas</h5>
                <p>Pan, zoom, 12 colours, an eraser. No step count, no cell limits.</p>
              </div>
              <div>
                <svg className="ico" viewBox="0 0 48 48" fill="none" stroke="#18243f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M 8 30 Q 20 10 40 18" />
                  <path d="M 36 14 L 40 18 L 36 22" />
                  <circle cx="14" cy="36" r="3" fill="#b4453d" stroke="none" />
                </svg>
                <h5>Targeted hints</h5>
                <p>The hint always points at one specific step — not a vague "try again".</p>
              </div>
            </div>
          </div>
        </section>

        <section className="cta" id="start">
          <svg className="doodle" style={{ top: '30px', left: '10%', width: '120px', height: '80px' }} viewBox="0 0 120 80">
            <path d="M 10 70 Q 40 10 110 20" />
            <path d="M 100 14 L 110 20 L 100 28" />
          </svg>
          <svg className="doodle" style={{ top: '50px', right: '8%', width: '140px', height: '100px' }} viewBox="0 0 140 100">
            <path d="M 130 80 Q 80 20 10 30" />
            <path d="M 22 24 L 10 30 L 20 38" />
          </svg>

          <div className="container">
            <h2>So. <span className="it">Shall we</span><br />work through it?</h2>
            <p className="sub">No account. No paywall. Just an empty sheet of graph paper and a tutor who won't hand you the answer.</p>
            <a className="btn" href="#" onClick={go} style={{ padding: '14px 28px', fontSize: '17px' }}>Open the whiteboard <span className="arrow">→</span></a>
            <div style={{ marginTop: 22 }} className="hand pencil">⇡ or press <span style={{ border: '1px solid var(--ink)', padding: '2px 8px', borderRadius: 4, fontFamily: 'var(--mono)', fontSize: 11, margin: '0 4px' }}>Space</span> to start writing</div>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div>© {new Date().getFullYear()} EuraAI — made for the students who want to <span className="hand" style={{ fontSize: 16 }}>figure it out</span>.</div>
        <div className="links">
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <a href="#">hi@euraai.app</a>
        </div>
      </footer>
    </div>
  )
}
