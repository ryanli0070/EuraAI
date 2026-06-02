/**
 * Per-canvas drawing persistence in Supabase Storage.
 *
 * One JSON object per canvas at `drawings/{user_id}/{canvas_id}.json`. The
 * bucket is private; RLS in Postgres enforces that a user can only read/write
 * objects under their own user-id prefix. The engine debounces calls to
 * `saveDoc` so on-the-fly writes don't saturate the network.
 *
 * Public API mirrors the previous IndexedDB module so callers in
 * `engine.ts` and `Canvas.tsx` are untouched.
 */
import { supabase } from '../supabase'
import { emptyDoc, type WhiteboardDoc } from './types'

const BUCKET = 'drawings'

async function currentUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return data.user.id
}

function pathFor(userId: string, canvasId: string): string {
  return `${userId}/${canvasId}.json`
}

function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { message?: string; statusCode?: string | number }
  const code = String(e.statusCode ?? '')
  if (code === '404') return true
  return typeof e.message === 'string' && /not[_ ]?found/i.test(e.message)
}

/** Load a canvas's drawing, or an empty document if none exists / on error. */
export async function loadDoc(canvasId: string): Promise<WhiteboardDoc> {
  try {
    const userId = await currentUserId()
    if (!userId) return emptyDoc()
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .download(pathFor(userId, canvasId))
    if (error || !data) {
      if (error && !isNotFound(error)) console.warn('[whiteboard] loadDoc', error)
      return emptyDoc()
    }
    const text = await data.text()
    const parsed = JSON.parse(text) as WhiteboardDoc
    if (parsed.version === 1 && Array.isArray(parsed.strokes)) return parsed
    return emptyDoc()
  } catch (err) {
    console.warn('[whiteboard] loadDoc failed', err)
    return emptyDoc()
  }
}

/** Write a canvas's drawing. Callers should debounce; the engine does. */
export async function saveDoc(canvasId: string, doc: WhiteboardDoc): Promise<void> {
  try {
    const userId = await currentUserId()
    if (!userId) return
    const blob = new Blob([JSON.stringify(doc)], { type: 'application/json' })
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(pathFor(userId, canvasId), blob, {
        upsert: true,
        contentType: 'application/json',
      })
    if (error) console.warn('[whiteboard] saveDoc', error)
  } catch (err) {
    console.warn('[whiteboard] saveDoc failed', err)
  }
}

/** Drop a canvas's drawing — called from canvasStore.deleteCanvas. */
export async function deleteDoc(canvasId: string): Promise<void> {
  try {
    const userId = await currentUserId()
    if (!userId) return
    const { error } = await supabase.storage
      .from(BUCKET)
      .remove([pathFor(userId, canvasId)])
    if (error && !isNotFound(error)) console.warn('[whiteboard] deleteDoc', error)
  } catch {
    /* non-fatal */
  }
}
