import { useState, useEffect } from 'react'
import { api } from './api/client'
import './App.css'

export default function App() {
  const [health, setHealth] = useState(null)
  const [examples, setExamples] = useState([])
  const [prompt, setPrompt] = useState('')
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.getHealth().then(setHealth).catch(() => setHealth({ status: 'error' }))
    api.getExamples().then(setExamples).catch(() => setExamples([]))
  }, [])

  async function handleChat(e) {
    e.preventDefault()
    if (!prompt.trim()) return
    setLoading(true)
    setReply('')
    try {
      const res = await api.chat({ prompt: prompt.trim() })
      setReply(res.reply)
    } catch (err) {
      setReply('Error: ' + (err.message || 'Request failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1>EuraAI</h1>
        <p className="subtitle">React + FastAPI boilerplate</p>
        {health && (
          <span className={`badge ${health.status === 'ok' ? 'ok' : 'err'}`}>
            API {health.status}
          </span>
        )}
      </header>

      <main className="main">
        <section className="card">
          <h2>OpenAI chat</h2>
          <form onSubmit={handleChat}>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask something..."
              disabled={loading}
            />
            <button type="submit" disabled={loading}>
              {loading ? 'Sending…' : 'Send'}
            </button>
          </form>
          {reply && <div className="reply">{reply}</div>}
        </section>

        <section className="card">
          <h2>Database examples</h2>
          <ul>
            {examples.length === 0 && <li>No items. Add some via API or seed script.</li>}
            {examples.map((ex) => (
              <li key={ex.id}>
                <strong>{ex.title}</strong>
                {ex.content && ` — ${ex.content}`}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}
