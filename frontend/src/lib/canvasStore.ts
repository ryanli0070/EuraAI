/**
 * Canvas + folder index, persisted in localStorage.
 *
 * What lives here vs. elsewhere:
 *   - canvasStore: the *index* (which canvases/folders exist, names, ordering,
 *     parents, thumbnails) + per-canvas *chat* state.
 *   - tldraw store (drawing data): persisted by tldraw itself via the
 *     `persistenceKey` prop, keyed on canvas id. We never touch tldraw's
 *     IndexedDB directly — that's tldraw's contract.
 *
 * When we add real auth, swap the read/write helpers in this module for
 * fetch() calls; everything that touches state already goes through them.
 */

export type CanvasId = string
export type FolderId = string
export type ItemId = CanvasId | FolderId

export type ChatRole = 'user' | 'assistant'
export type ChatStatus = 'idle' | 'checking' | 'ok' | 'all_correct' | 'no_math' | 'error'
export type ChatMessage = { role: ChatRole; text: string; status?: ChatStatus }
export type ChatBox = {
  x: number
  y: number
  w: number
  h: number
  collapsed: boolean
  attached: boolean
}
export type ChatState = {
  latex: string
  messages: ChatMessage[]
  box?: ChatBox
}

export type CanvasMeta = {
  id: CanvasId
  kind: 'canvas'
  name: string
  parent: FolderId | null
  createdAt: number
  modifiedAt: number
  order: number
  thumbnail?: string  // data URL; optional, populated on home navigation
}

export type Folder = {
  id: FolderId
  kind: 'folder'
  name: string
  parent: FolderId | null
  createdAt: number
  modifiedAt: number
  order: number
}

export type Item = CanvasMeta | Folder

export type CanvasIndex = {
  version: 2
  canvases: CanvasMeta[]
  folders: Folder[]
}

const INDEX_KEY = 'euraai.index.v2'
const CHAT_KEY_PREFIX = 'euraai.canvas.chat.'  // append <canvasId>
const LEGACY_CHAT_KEY = 'euraai.chat.v1'

const DEFAULT_CANVAS_NAME = 'Untitled canvas'
const DEFAULT_FOLDER_NAME = 'New folder'

// -----------------------------
// Index read/write
// -----------------------------

const emptyIndex = (): CanvasIndex => ({ version: 2, canvases: [], folders: [] })

export function loadIndex(): CanvasIndex {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    if (!raw) return migrateLegacyIfNeeded(emptyIndex())
    const parsed = JSON.parse(raw) as Partial<CanvasIndex>
    if (parsed.version !== 2 || !Array.isArray(parsed.canvases) || !Array.isArray(parsed.folders)) {
      return migrateLegacyIfNeeded(emptyIndex())
    }
    return { version: 2, canvases: parsed.canvases, folders: parsed.folders }
  } catch {
    return emptyIndex()
  }
}

function saveIndex(idx: CanvasIndex): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(idx))
    notify()
  } catch (err) {
    console.error('[canvasStore] failed to save index', err)
  }
}

// One-time migration: if the user has the old single-canvas chat key but no
// new index, seed an "Untitled canvas" carrying that chat so they don't lose
// their existing conversation.
function migrateLegacyIfNeeded(blank: CanvasIndex): CanvasIndex {
  try {
    const raw = localStorage.getItem(LEGACY_CHAT_KEY)
    if (!raw) {
      saveIndex(blank)
      return blank
    }
    const meta = newCanvasMeta(null, 0)
    const idx: CanvasIndex = { ...blank, canvases: [meta] }
    saveIndex(idx)
    // Move the chat payload onto the new canvas key, then clear the legacy slot.
    localStorage.setItem(CHAT_KEY_PREFIX + meta.id, raw)
    localStorage.removeItem(LEGACY_CHAT_KEY)
    return idx
  } catch {
    return blank
  }
}

// -----------------------------
// Subscriptions (so menu re-renders after mutations from anywhere)
// -----------------------------

type Listener = () => void
const listeners = new Set<Listener>()

export function subscribe(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

function notify() {
  listeners.forEach((l) => l())
}

// -----------------------------
// IDs and factories
// -----------------------------

function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'c_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function newCanvasMeta(parent: FolderId | null, order: number, name = DEFAULT_CANVAS_NAME): CanvasMeta {
  const now = Date.now()
  return {
    id: uid(),
    kind: 'canvas',
    name,
    parent,
    createdAt: now,
    modifiedAt: now,
    order,
  }
}

function newFolder(parent: FolderId | null, order: number, name = DEFAULT_FOLDER_NAME): Folder {
  const now = Date.now()
  return {
    id: uid(),
    kind: 'folder',
    name,
    parent,
    createdAt: now,
    modifiedAt: now,
    order,
  }
}

// -----------------------------
// Queries
// -----------------------------

export function listChildren(parent: FolderId | null): Item[] {
  const idx = loadIndex()
  const items: Item[] = [
    ...idx.folders.filter((f) => f.parent === parent),
    ...idx.canvases.filter((c) => c.parent === parent),
  ]
  return items.sort((a, b) => a.order - b.order)
}

export function getFolder(id: FolderId): Folder | undefined {
  return loadIndex().folders.find((f) => f.id === id)
}

export function getCanvas(id: CanvasId): CanvasMeta | undefined {
  return loadIndex().canvases.find((c) => c.id === id)
}

export function folderPath(id: FolderId | null): Folder[] {
  if (id == null) return []
  const idx = loadIndex()
  const out: Folder[] = []
  let cursor: FolderId | null = id
  // Cap depth at the folder count to defeat any cycle that might somehow appear.
  for (let i = 0; i < idx.folders.length + 1 && cursor; i++) {
    const f = idx.folders.find((x) => x.id === cursor)
    if (!f) break
    out.unshift(f)
    cursor = f.parent
  }
  return out
}

// Search across the whole index (case-insensitive, name only for v1).
export function searchAll(query: string): Item[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const idx = loadIndex()
  const matches: Item[] = []
  for (const f of idx.folders) if (f.name.toLowerCase().includes(q)) matches.push(f)
  for (const c of idx.canvases) if (c.name.toLowerCase().includes(q)) matches.push(c)
  return matches.sort((a, b) => b.modifiedAt - a.modifiedAt)
}

// -----------------------------
// Mutations
// -----------------------------

function nextOrder(idx: CanvasIndex, parent: FolderId | null): number {
  const peers = [
    ...idx.folders.filter((f) => f.parent === parent),
    ...idx.canvases.filter((c) => c.parent === parent),
  ]
  return peers.length === 0 ? 0 : Math.max(...peers.map((p) => p.order)) + 1
}

export function createCanvas(parent: FolderId | null = null): CanvasMeta {
  const idx = loadIndex()
  const meta = newCanvasMeta(parent, nextOrder(idx, parent))
  idx.canvases.push(meta)
  saveIndex(idx)
  return meta
}

export function createFolder(parent: FolderId | null = null): Folder {
  const idx = loadIndex()
  const folder = newFolder(parent, nextOrder(idx, parent))
  idx.folders.push(folder)
  saveIndex(idx)
  return folder
}

export function renameItem(id: ItemId, name: string): void {
  const trimmed = name.trim()
  if (!trimmed) return
  const idx = loadIndex()
  const now = Date.now()
  const c = idx.canvases.find((x) => x.id === id)
  if (c) {
    c.name = trimmed
    c.modifiedAt = now
    saveIndex(idx)
    return
  }
  const f = idx.folders.find((x) => x.id === id)
  if (f) {
    f.name = trimmed
    f.modifiedAt = now
    saveIndex(idx)
  }
}

export function touchCanvas(id: CanvasId): void {
  const idx = loadIndex()
  const c = idx.canvases.find((x) => x.id === id)
  if (!c) return
  c.modifiedAt = Date.now()
  saveIndex(idx)
}

export function setThumbnail(id: CanvasId, dataUrl: string | undefined): void {
  const idx = loadIndex()
  const c = idx.canvases.find((x) => x.id === id)
  if (!c) return
  c.thumbnail = dataUrl
  saveIndex(idx)
}

export function deleteCanvas(id: CanvasId): void {
  const idx = loadIndex()
  idx.canvases = idx.canvases.filter((c) => c.id !== id)
  saveIndex(idx)
  // Best-effort cleanup of associated state.
  try { localStorage.removeItem(CHAT_KEY_PREFIX + id) } catch { /* ignore */ }
}

// Recursively delete a folder and everything inside it.
export function deleteFolder(id: FolderId): void {
  const idx = loadIndex()
  const toDeleteFolders = new Set<FolderId>([id])
  // Sweep until no new descendants are picked up.
  for (let pass = 0; pass < idx.folders.length; pass++) {
    const before = toDeleteFolders.size
    for (const f of idx.folders) {
      if (f.parent && toDeleteFolders.has(f.parent)) toDeleteFolders.add(f.id)
    }
    if (toDeleteFolders.size === before) break
  }
  const orphanCanvases = idx.canvases.filter((c) => c.parent && toDeleteFolders.has(c.parent))
  idx.canvases = idx.canvases.filter((c) => !c.parent || !toDeleteFolders.has(c.parent))
  idx.folders = idx.folders.filter((f) => !toDeleteFolders.has(f.id))
  saveIndex(idx)
  for (const c of orphanCanvases) {
    try { localStorage.removeItem(CHAT_KEY_PREFIX + c.id) } catch { /* ignore */ }
  }
}

export function deleteItem(id: ItemId): void {
  const idx = loadIndex()
  if (idx.canvases.some((c) => c.id === id)) deleteCanvas(id)
  else if (idx.folders.some((f) => f.id === id)) deleteFolder(id)
}

// Duplicate a canvas's metadata + chat. The tldraw drawing isn't copied — it
// lives in tldraw's IndexedDB keyed on canvas id, and we don't reach into that
// store. The user gets a new canvas with the same notes/conversation but a
// blank drawing surface; document this clearly in the UI tooltip.
export function duplicateCanvas(id: CanvasId): CanvasMeta | null {
  const idx = loadIndex()
  const src = idx.canvases.find((c) => c.id === id)
  if (!src) return null
  const copy = newCanvasMeta(src.parent, nextOrder(idx, src.parent), `${src.name} (copy)`)
  idx.canvases.push(copy)
  saveIndex(idx)
  // Copy chat payload by raw value.
  try {
    const srcChat = localStorage.getItem(CHAT_KEY_PREFIX + src.id)
    if (srcChat) localStorage.setItem(CHAT_KEY_PREFIX + copy.id, srcChat)
  } catch { /* ignore */ }
  return copy
}

export function moveItem(id: ItemId, parent: FolderId | null): void {
  const idx = loadIndex()
  // Disallow dropping a folder into one of its own descendants.
  if (parent != null) {
    const folder = idx.folders.find((f) => f.id === id)
    if (folder) {
      let cursor: FolderId | null = parent
      for (let i = 0; i < idx.folders.length + 1 && cursor; i++) {
        if (cursor === id) return
        const cur: Folder | undefined = idx.folders.find((f) => f.id === cursor)
        cursor = cur ? cur.parent : null
      }
    }
  }
  const c = idx.canvases.find((x) => x.id === id)
  const f = idx.folders.find((x) => x.id === id)
  const target = c ?? f
  if (!target) return
  if (target.parent === parent) return
  target.parent = parent
  target.order = nextOrder(idx, parent)
  target.modifiedAt = Date.now()
  saveIndex(idx)
}

// Reassign `order` based on the position in `orderedIds`, leaving items not
// listed alone. The caller passes the children of a single parent.
export function reorderItems(parent: FolderId | null, orderedIds: ItemId[]): void {
  const idx = loadIndex()
  const lookup = new Map<ItemId, number>()
  orderedIds.forEach((id, i) => lookup.set(id, i))
  const apply = <T extends { id: string; parent: FolderId | null; order: number }>(arr: T[]) => {
    for (const item of arr) {
      if (item.parent !== parent) continue
      const next = lookup.get(item.id)
      if (next != null) item.order = next
    }
  }
  apply(idx.canvases)
  apply(idx.folders)
  saveIndex(idx)
}

// -----------------------------
// Per-canvas chat state
// -----------------------------

export function loadChat(canvasId: CanvasId): ChatState {
  try {
    const raw = localStorage.getItem(CHAT_KEY_PREFIX + canvasId)
    if (!raw) return { latex: '', messages: [] }
    const parsed = JSON.parse(raw) as ChatState
    if (!Array.isArray(parsed.messages)) return { latex: '', messages: [] }
    return { latex: parsed.latex ?? '', messages: parsed.messages, box: parsed.box }
  } catch {
    return { latex: '', messages: [] }
  }
}

export function saveChat(canvasId: CanvasId, state: ChatState): void {
  try {
    localStorage.setItem(CHAT_KEY_PREFIX + canvasId, JSON.stringify(state))
  } catch {
    // quota / disabled — non-fatal
  }
}
