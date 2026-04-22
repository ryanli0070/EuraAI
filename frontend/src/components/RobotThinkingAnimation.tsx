import { motion } from 'framer-motion'

const STROKE = '#1e3a5f'
const ACCENT = '#3b82f6'
const VISOR_BG = '#eff6ff'

function Gear({ r, teeth = 10 }: { r: number; teeth?: number }) {
  const toothHeight = r * 0.22
  const points: string[] = []
  for (let i = 0; i < teeth * 2; i++) {
    const angle = (i / (teeth * 2)) * Math.PI * 2
    const radius = i % 2 === 0 ? r + toothHeight : r
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`)
  }
  return (
    <>
      <polygon
        points={points.join(' ')}
        fill="white"
        stroke={ACCENT}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <circle cx={0} cy={0} r={r * 0.28} fill="white" stroke={ACCENT} strokeWidth={2.5} />
    </>
  )
}

function ThoughtBubble({
  cx,
  cy,
  r,
  delay,
}: {
  cx: number
  cy: number
  r: number
  delay: number
}) {
  return (
    <motion.circle
      cx={cx}
      cy={cy}
      r={r}
      fill="white"
      stroke={STROKE}
      strokeWidth={2}
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: [0, 1, 1, 0],
        scale: [0.4, 1, 1, 1.15],
      }}
      transition={{
        duration: 2.6,
        repeat: Infinity,
        delay,
        ease: 'easeInOut',
        times: [0, 0.25, 0.75, 1],
      }}
    />
  )
}

export function RobotThinkingAnimation() {
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
        {/* Thought bubbles rising to upper right */}
        <ThoughtBubble cx={425} cy={180} r={5} delay={0} />
        <ThoughtBubble cx={455} cy={145} r={9} delay={0.35} />
        <ThoughtBubble cx={495} cy={100} r={15} delay={0.7} />

        {/* Subtle head-bob wrapper */}
        <motion.g
          animate={{ y: [0, -3, 0, -2, 0] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          {/* Antenna */}
          <line
            x1={300}
            y1={95}
            x2={300}
            y2={70}
            stroke={STROKE}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <motion.circle
            cx={300}
            cy={62}
            r={7}
            fill={ACCENT}
            animate={{ scale: [1, 1.4, 1], opacity: [1, 0.55, 1] }}
            transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Head */}
          <rect
            x={230}
            y={95}
            width={140}
            height={115}
            rx={18}
            fill="white"
            stroke={STROKE}
            strokeWidth={3.5}
          />

          {/* Ear bolts */}
          <circle cx={226} cy={150} r={5} fill="white" stroke={STROKE} strokeWidth={2.5} />
          <circle cx={374} cy={150} r={5} fill="white" stroke={STROKE} strokeWidth={2.5} />

          {/* Visor / screen */}
          <rect
            x={247}
            y={118}
            width={106}
            height={52}
            rx={8}
            fill={VISOR_BG}
            stroke={STROKE}
            strokeWidth={2.5}
          />

          {/* Eyes scanning left-right inside visor */}
          <motion.g
            animate={{ x: [-14, 14, 14, -14, -14] }}
            transition={{
              duration: 3.2,
              repeat: Infinity,
              ease: 'easeInOut',
              times: [0, 0.25, 0.55, 0.85, 1],
            }}
          >
            <motion.circle
              cx={282}
              cy={144}
              r={7}
              fill={ACCENT}
              animate={{ scaleY: [1, 1, 0.1, 1, 1] }}
              transition={{
                duration: 4,
                repeat: Infinity,
                times: [0, 0.45, 0.5, 0.55, 1],
                ease: 'easeInOut',
              }}
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            />
            <motion.circle
              cx={318}
              cy={144}
              r={7}
              fill={ACCENT}
              animate={{ scaleY: [1, 1, 0.1, 1, 1] }}
              transition={{
                duration: 4,
                repeat: Infinity,
                times: [0, 0.45, 0.5, 0.55, 1],
                ease: 'easeInOut',
              }}
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            />
          </motion.g>

          {/* Mouth */}
          <line
            x1={285}
            y1={190}
            x2={315}
            y2={190}
            stroke={STROKE}
            strokeWidth={3}
            strokeLinecap="round"
          />

          {/* Neck */}
          <rect
            x={285}
            y={210}
            width={30}
            height={12}
            fill="white"
            stroke={STROKE}
            strokeWidth={2.5}
          />

          {/* Body */}
          <rect
            x={210}
            y={222}
            width={180}
            height={125}
            rx={18}
            fill="white"
            stroke={STROKE}
            strokeWidth={3.5}
          />

          {/* Arms */}
          <line
            x1={210}
            y1={250}
            x2={180}
            y2={270}
            stroke={STROKE}
            strokeWidth={3.5}
            strokeLinecap="round"
          />
          <line
            x1={390}
            y1={250}
            x2={420}
            y2={270}
            stroke={STROKE}
            strokeWidth={3.5}
            strokeLinecap="round"
          />
          <circle cx={180} cy={270} r={6} fill="white" stroke={STROKE} strokeWidth={2.5} />
          <circle cx={420} cy={270} r={6} fill="white" stroke={STROKE} strokeWidth={2.5} />

          {/* Gears inside body */}
          <g transform="translate(260 285)">
            <motion.g
              animate={{ rotate: 360 }}
              transition={{ duration: 4.5, repeat: Infinity, ease: 'linear' }}
            >
              <Gear r={26} teeth={10} />
            </motion.g>
          </g>
          <g transform="translate(335 300)">
            <motion.g
              animate={{ rotate: -360 }}
              transition={{ duration: 3.2, repeat: Infinity, ease: 'linear' }}
            >
              <Gear r={18} teeth={8} />
            </motion.g>
          </g>
        </motion.g>
      </svg>
    </div>
  )
}
