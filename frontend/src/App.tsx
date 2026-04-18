import { useCallback, useEffect, useState } from 'react'
import { Landing } from './components/Landing'
import { Whiteboard } from './components/Whiteboard'

type Route = 'landing' | 'whiteboard'

function routeFromHash(): Route {
  return window.location.hash === '#/whiteboard' ? 'whiteboard' : 'landing'
}

function App() {
  const [route, setRoute] = useState<Route>(routeFromHash)

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const enterWhiteboard = useCallback(() => {
    window.location.hash = '#/whiteboard'
  }, [])

  if (route === 'whiteboard') {
    return <Whiteboard />
  }
  return <Landing onEnter={enterWhiteboard} />
}

export default App
