import { useCallback, useRef, useState } from 'react'
import { Landing } from './components/Landing'
import { Whiteboard } from './components/Whiteboard'

type Route = 'landing' | 'whiteboard'
type SlideDir = 'forward' | 'backward' | null

function App() {
  const [route, setRoute] = useState<Route>('landing')
  const [slideDir, setSlideDir] = useState<SlideDir>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const navigate = useCallback((to: Route) => {
    const dir: SlideDir = to === 'whiteboard' ? 'forward' : 'backward'
    setSlideDir(dir)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setRoute(to)
      setSlideDir(null)
    }, 400)
  }, [])

  const landingX =
    slideDir === 'forward' ? '-100%' :
    slideDir === 'backward' ? '0%' :
    route === 'whiteboard' ? '-100%' : '0%'

  const whiteboardX =
    slideDir === 'forward' ? '0%' :
    slideDir === 'backward' ? '100%' :
    route === 'whiteboard' ? '0%' : '100%'

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div
        className="absolute inset-0 overflow-y-auto transition-transform duration-400 ease-in-out"
        style={{ transform: `translateX(${landingX})` }}
      >
        <Landing onEnter={() => navigate('whiteboard')} />
      </div>

      <div
        className="absolute inset-0 transition-transform duration-400 ease-in-out"
        style={{ transform: `translateX(${whiteboardX})` }}
      >
        {(route === 'whiteboard' || slideDir === 'forward') && (
          <Whiteboard onHome={() => navigate('landing')} />
        )}
      </div>
    </div>
  )
}

export default App
