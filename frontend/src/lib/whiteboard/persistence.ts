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
    await deleteBackgrounds(canvasId)
  } catch {
    /* non-fatal */
  }
}

// ============================================================================
// Imported page backgrounds (PDF pages / photos)
//
// Stored in the same private `drawings` bucket, under a per-canvas subfolder:
//   drawings/{user_id}/{canvas_id}/bg/{page}.png
// The RLS policy keys on the first path segment (the user id), so the existing
// "own files only" rules already cover these without a new bucket or migration.
// ============================================================================

function bgFolderFor(userId: string, canvasId: string): string {
  return `${userId}/${canvasId}/bg`
}

function bgPathFor(userId: string, canvasId: string, page: number): string {
  return `${bgFolderFor(userId, canvasId)}/${page}.png`
}

/** Upload one rendered page image. Returns its Storage object key, or null. */
export async function uploadBackground(
  canvasId: string,
  page: number,
  blob: Blob,
): Promise<string | null> {
  try {
    const userId = await currentUserId()
    if (!userId) return null
    const path = bgPathFor(userId, canvasId, page)
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { upsert: true, contentType: 'image/png' })
    if (error) {
      console.warn('[whiteboard] uploadBackground', error)
      return null
    }
    return path
  } catch (err) {
    console.warn('[whiteboard] uploadBackground failed', err)
    return null
  }
}

/**
 * Download a background image as a Blob (via the SDK, not a public URL). The
 * caller turns it into an object URL — same-origin, so the canvas it's drawn
 * onto never gets tainted and PNG export / thumbnails keep working.
 */
export async function downloadBackground(path: string): Promise<Blob | null> {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(path)
    if (error || !data) {
      if (error && !isNotFound(error)) console.warn('[whiteboard] downloadBackground', error)
      return null
    }
    return data
  } catch (err) {
    console.warn('[whiteboard] downloadBackground failed', err)
    return null
  }
}

/** Best-effort removal of a canvas's whole background folder (on canvas delete). */
export async function deleteBackgrounds(canvasId: string): Promise<void> {
  try {
    const userId = await currentUserId()
    if (!userId) return
    const folder = bgFolderFor(userId, canvasId)
    const { data, error } = await supabase.storage.from(BUCKET).list(folder)
    if (error || !data || data.length === 0) return
    const paths = data.map((f) => `${folder}/${f.name}`)
    await supabase.storage.from(BUCKET).remove(paths)
  } catch {
    /* non-fatal */
  }
}
