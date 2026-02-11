/**
 * API client for the FastAPI backend.
 * Uses Vite proxy: /api -> http://localhost:8000
 */

const BASE = '/api'

async function request(path, options = {}) {
  const url = `${BASE}${path}`
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    let detail = text
    try {
      const j = JSON.parse(text)
      detail = j.detail ?? text
    } catch (_) {}
    throw new Error(detail)
  }
  return res.json()
}

export const api = {
  getHealth() {
    return request('/health')
  },

  getExamples() {
    return request('/examples')
  },

  getExample(id) {
    return request(`/examples/${id}`)
  },

  createExample({ title, content }) {
    return request('/examples', {
      method: 'POST',
      body: JSON.stringify({ title, content: content ?? null }),
    })
  },

  chat({ prompt, system, model }) {
    return request('/openai/chat', {
      method: 'POST',
      body: JSON.stringify({ prompt, system, model }),
    })
  },
}
