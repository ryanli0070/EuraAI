import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'katex/dist/katex.min.css'
import './index.css'
import App from './App.tsx'
import { initNative } from './lib/native'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Style status bar + dismiss the native splash on the iOS build (no-op on web).
initNative()
