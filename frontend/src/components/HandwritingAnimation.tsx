import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

type Stroke = { d: string }

const GLYPHS: Record<string, Stroke[]> = {
  '3': [
    { d: 'M 8,15 Q 22,4 33,12 Q 38,24 22,28 Q 38,32 33,45 Q 22,58 8,50' },
  ],
  '2': [
    { d: 'M 8,18 Q 22,4 33,14 Q 38,30 15,46 L 8,54 L 36,54' },
  ],
  '7': [
    { d: 'M 5,13 L 35,13' },
    { d: 'M 35,13 L 18,55' },
  ],
  '4': [
    { d: 'M 26,10 L 5,40 L 32,40' },
    { d: 'M 26,10 L 26,55' },
  ],
  x: [
    { d: 'M 6,15 L 32,50' },
    { d: 'M 32,15 L 6,50' },
  ],
  '-': [{ d: 'M 5,35 L 30,35' }],
  '=': [
    { d: 'M 5,28 L 30,28' },
    { d: 'M 5,40 L 30,40' },
  ],
}

type Element =
  | { type: 'glyph'; char: string; x: number }
  | { type: 'fraction'; num: string; den: string; x: number }

const EQ_1: Element[] = [
  { type: 'glyph', char: '3', x: 143 },
  { type: 'glyph', char: 'x', x: 198 },
  { type: 'glyph', char: '-', x: 253 },
  { type: 'glyph', char: '7', x: 308 },
  { type: 'glyph', char: '=', x: 363 },
  { type: 'glyph', char: '2', x: 418 },
]

const EQ_2: Element[] = [
  { type: 'fraction', num: '7', den: '2', x: 170 },
  { type: 'glyph', char: '-', x: 225 },
  { type: 'fraction', num: '3', den: '4', x: 280 },
  { type: 'glyph', char: '=', x: 335 },
  { type: 'glyph', char: 'x', x: 390 },
]

const EQUATIONS = [EQ_1, EQ_2]

const BASE_Y = 167
const FRAC_NUM_Y = 157
const FRAC_BAR_Y = 200
const FRAC_DEN_Y = 198
const FRAC_SCALE = 0.7

const STROKE_DURATION = 0.28
const HOLD_DURATION = 1.0
const FADE_DURATION = 1.0
const STROKE_COLOR = '#1e3a5f'
const STROKE_WIDTH = 3.5

type RenderStroke = { key: string; d: string; transform: string; delay: number }

function buildStrokes(equation: Element[]) {
  const strokes: RenderStroke[] = []
  let i = 0
  for (const el of equation) {
    if (el.type === 'glyph') {
      GLYPHS[el.char].forEach((s, si) => {
        strokes.push({
          key: `${el.x}-g-${si}`,
          d: s.d,
          transform: `translate(${el.x} ${BASE_Y})`,
          delay: i * STROKE_DURATION,
        })
        i++
      })
    } else {
      GLYPHS[el.num].forEach((s, si) => {
        strokes.push({
          key: `${el.x}-n-${si}`,
          d: s.d,
          transform: `translate(${el.x + 6} ${FRAC_NUM_Y}) scale(${FRAC_SCALE})`,
          delay: i * STROKE_DURATION,
        })
        i++
      })
      strokes.push({
        key: `${el.x}-bar`,
        d: 'M 0,0 L 36,0',
        transform: `translate(${el.x + 2} ${FRAC_BAR_Y})`,
        delay: i * STROKE_DURATION,
      })
      i++
      GLYPHS[el.den].forEach((s, si) => {
        strokes.push({
          key: `${el.x}-d-${si}`,
          d: s.d,
          transform: `translate(${el.x + 6} ${FRAC_DEN_Y}) scale(${FRAC_SCALE})`,
          delay: i * STROKE_DURATION,
        })
        i++
      })
    }
  }
  return { strokes, writeDuration: i * STROKE_DURATION }
}

function EquationDisplay({
  equation,
  onDone,
}: {
  equation: Element[]
  onDone: () => void
}) {
  const { strokes, writeDuration } = buildStrokes(equation)
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  })

  useEffect(() => {
    const t = window.setTimeout(
      () => onDoneRef.current(),
      (writeDuration + HOLD_DURATION) * 1000,
    )
    return () => window.clearTimeout(t)
  }, [writeDuration])

  return (
    <motion.g
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: FADE_DURATION, ease: 'easeInOut' }}
    >
      {strokes.map((s) => (
        <motion.path
          key={s.key}
          d={s.d}
          transform={s.transform}
          stroke={STROKE_COLOR}
          strokeWidth={STROKE_WIDTH}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{
            pathLength: {
              duration: STROKE_DURATION,
              delay: s.delay,
              ease: 'easeOut',
            },
            opacity: { duration: 0.01, delay: s.delay },
          }}
        />
      ))}
    </motion.g>
  )
}

export function HandwritingAnimation() {
  const [index, setIndex] = useState(0)
  const next = useCallback(
    () => setIndex((i) => (i + 1) % EQUATIONS.length),
    [],
  )

  return (
    <div
      className="rounded-2xl border border-gray-100 shadow-lg w-full overflow-hidden bg-white"
      style={{
        backgroundImage: `
          linear-gradient(to right, #e5e7eb 1px, transparent 1px),
          linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)
        `,
        backgroundSize: '30px 30px',
      }}
    >
      <svg
        viewBox="0 0 600 400"
        className="w-full block"
        preserveAspectRatio="xMidYMid meet"
      >
        <AnimatePresence mode="wait">
          <EquationDisplay
            key={index}
            equation={EQUATIONS[index]}
            onDone={next}
          />
        </AnimatePresence>
      </svg>
    </div>
  )
}
