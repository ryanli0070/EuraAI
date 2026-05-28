/**
 * Thin wrapper around `fetch` that attaches the current Supabase access token
 * and prefixes the configured backend base URL. Backend routes verify this
 * token via the Supabase JWT secret and 401 if it's missing or invalid.
 */
import { supabase } from './supabase'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  const headers = new Headers(init.headers ?? {})
  if (token) headers.set('Authorization', `Bearer ${token}`)
  // Don't set Content-Type for FormData — the browser must add the multipart
  // boundary itself. JSON callers pass their own Content-Type via `init`.

  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`
  return fetch(url, { ...init, headers })
}
