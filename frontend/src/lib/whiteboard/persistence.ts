/**
 * Per-canvas drawing persistence in IndexedDB.
 *
 * This replaces what tldraw's `persistenceKey` prop did for us. Drawing data
 * can outgrow localStorage's ~5MB ceiling on a busy board, so it lives in
 * IndexedDB — one record per canvas, keyed by canvas id. The canvas *index*
 * and chat state still live in localStorage via canvasStore.ts.
 */
import { emptyDoc, type WhiteboardDoc } from './types'

const DB_NAME = 'euraai-whiteboard'
const DB_VERSION = 1
const STORE = 'docs'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

/** Load a canvas's drawing, or an empty document if none exists / on error. */
export async function loadDoc(canvasId: string): Promise<WhiteboardDoc> {
  try {
    const db = await openDb()
    return await new Promise<WhiteboardDoc>((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(canvasId)
      req.onsuccess = () => {
        const val = req.result as WhiteboardDoc | undefined
        resolve(val && val.version === 1 && Array.isArray(val.strokes) ? val : emptyDoc())
      }
      req.onerror = () => resolve(emptyDoc())
    })
  } catch (err) {
    console.warn('[whiteboard] loadDoc failed', err)
    return emptyDoc()
  }
}

/** Write a canvas's drawing. Callers should debounce; the engine does. */
export async function saveDoc(canvasId: string, doc: WhiteboardDoc): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(doc, canvasId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('[whiteboard] saveDoc failed', err)
  }
}

/** Drop a canvas's drawing — call this from canvasStore.deleteCanvas. */
export async function deleteDoc(canvasId: string): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(canvasId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
    /* non-fatal */
  }
}
