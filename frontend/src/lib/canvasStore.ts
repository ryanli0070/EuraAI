/**
 * Canvas + folder index, backed by Supabase.
 *
 * Public surface:
 *   - `loadIndex()` is async and returns a snapshot of the user's folders and
 *     canvases. Pure helpers (`listChildren`, `folderPath`, `searchAll`,
 *     `getCanvas`, `getFolder`) operate on that snapshot in memory so a single
 *     load can drive multiple derived views without N+1 round trips.
 *   - Mutations are async and call `notify()` so subscribers refetch.
 *   - Per-canvas chat state is split: messages live in `chat_messages`;
 *     `chat_box` and `chat_latex_draft` live on the canvas row. `saveChat`
 *     debounces writes so chat input keystrokes don't fan out to network calls.
 *   - Drawing and thumbnail file lifecycles are handled here too — drawings
 *     are deleted alongside their owning canvas row, thumbnails are uploaded
 *     by callers via `setThumbnail` and resolved to signed URLs on demand via
 *     `getThumbnailUrl`.
 */
import { supabase } from './supabase'
import { deleteDoc } from './whiteboard/persistence'

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
  thumbnailPath?: string
  drawingPath?: string
}

export type Folder = {
  id: FolderId
  kind: 'folder'
  name: string
  parent: FolderId | null
  createdAt: number
  modifiedAt: number
  order: number
  // Palette key (see FOLDER_COLORS in CanvasMenu). Undefined = default manila.
  color?: string
}

export type Item = CanvasMeta | Folder

export type CanvasIndex = {
  version: 2
  canvases: CanvasMeta[]
  folders: Folder[]
}

const DEFAULT_CANVAS_NAME = 'Untitled canvas'
const DEFAULT_FOLDER_NAME = 'New folder'
const CHAT_SAVE_DEBOUNCE_MS = 500
const THUMB_SIGNED_URL_TTL_S = 3600

// =============================================================
// Row mappers
// =============================================================

type CanvasRow = {
  id: string
  parent_id: string | null
  name: string
  sort_order: number
  thumbnail_path: string | null
  drawing_path: string | null
  created_at: string
  modified_at: string
}

type FolderRow = {
  id: string
  parent_id: string | null
  name: string
  sort_order: number
  color: string | null
  created_at: string
  modified_at: string
}

const toMillis = (iso: string): number => new Date(iso).getTime()

function mapCanvas(row: CanvasRow): CanvasMeta {
  return {
    id: row.id,
    kind: 'canvas',
    name: row.name,
    parent: row.parent_id,
    createdAt: toMillis(row.created_at),
    modifiedAt: toMillis(row.modified_at),
    order: row.sort_order,
    thumbnailPath: row.thumbnail_path ?? undefined,
    drawingPath: row.drawing_path ?? undefined,
  }
}

function mapFolder(row: FolderRow): Folder {
  return {
    id: row.id,
    kind: 'folder',
    name: row.name,
    parent: row.parent_id,
    createdAt: toMillis(row.created_at),
    modifiedAt: toMillis(row.modified_at),
    order: row.sort_order,
    color: row.color ?? undefined,
  }
}

// =============================================================
// Auth helper — many ops need the current user_id to build a Storage path.
// =============================================================

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('No authenticated user')
  return data.user.id
}

// =============================================================
// Subscriptions — same in-memory listener pattern as before; every mutation
// calls notify() and subscribers (CanvasMenu) reload from the network.
// =============================================================

type Listener = () => void
const listeners = new Set<Listener>()

export function subscribe(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

function notify(): void {
  listeners.forEach((l) => l())
}

// Clear in-memory caches when the user signs out.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
    thumbnailUrlCache.clear()
  }
  if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') notify()
})

// =============================================================
// Index loading + pure helpers
// =============================================================

const emptyIndex = (): CanvasIndex => ({ version: 2, canvases: [], folders: [] })

export async function loadIndex(): Promise<CanvasIndex> {
  const [foldersRes, canvasesRes] = await Promise.all([
    supabase.from('folders').select('*'),
    supabase.from('canvases').select('*'),
  ])
  if (foldersRes.error) {
    console.error('[canvasStore] loadIndex folders', foldersRes.error)
    return emptyIndex()
  }
  if (canvasesRes.error) {
    console.error('[canvasStore] loadIndex canvases', canvasesRes.error)
    return emptyIndex()
  }
  return {
    version: 2,
    folders: (foldersRes.data as FolderRow[]).map(mapFolder),
    canvases: (canvasesRes.data as CanvasRow[]).map(mapCanvas),
  }
}

export function getCanvas(idx: CanvasIndex, id: CanvasId): CanvasMeta | undefined {
  return idx.canvases.find((c) => c.id === id)
}

export function getFolder(idx: CanvasIndex, id: FolderId): Folder | undefined {
  return idx.folders.find((f) => f.id === id)
}

export function listChildren(idx: CanvasIndex, parent: FolderId | null): Item[] {
  const items: Item[] = [
    ...idx.folders.filter((f) => f.parent === parent),
    ...idx.canvases.filter((c) => c.parent === parent),
  ]
  return items.sort((a, b) => a.order - b.order)
}

export function folderPath(idx: CanvasIndex, id: FolderId | null): Folder[] {
  if (id == null) return []
  const out: Folder[] = []
  let cursor: FolderId | null = id
  for (let i = 0; i < idx.folders.length + 1 && cursor; i++) {
    const f = idx.folders.find((x) => x.id === cursor)
    if (!f) break
    out.unshift(f)
    cursor = f.parent
  }
  return out
}

export function searchAll(idx: CanvasIndex, query: string): Item[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const matches: Item[] = []
  for (const f of idx.folders) if (f.name.toLowerCase().includes(q)) matches.push(f)
  for (const c of idx.canvases) if (c.name.toLowerCase().includes(q)) matches.push(c)
  return matches.sort((a, b) => b.modifiedAt - a.modifiedAt)
}

// =============================================================
// Mutations
// =============================================================

function nextOrder(idx: CanvasIndex, parent: FolderId | null): number {
  const peers = [
    ...idx.folders.filter((f) => f.parent === parent),
    ...idx.canvases.filter((c) => c.parent === parent),
  ]
  return peers.length === 0 ? 0 : Math.max(...peers.map((p) => p.order)) + 1
}

export async function createCanvas(
  parent: FolderId | null = null,
  name: string = DEFAULT_CANVAS_NAME,
): Promise<CanvasMeta | null> {
  const userId = await requireUserId()
  const idx = await loadIndex()
  const order = nextOrder(idx, parent)
  const { data, error } = await supabase
    .from('canvases')
    .insert({
      user_id: userId,
      parent_id: parent,
      name: name.trim() || DEFAULT_CANVAS_NAME,
      sort_order: order,
    })
    .select()
    .single()
  if (error || !data) {
    console.error('[canvasStore] createCanvas', error)
    return null
  }
  notify()
  return mapCanvas(data as CanvasRow)
}

export async function createFolder(parent: FolderId | null = null): Promise<Folder | null> {
  const userId = await requireUserId()
  const idx = await loadIndex()
  const order = nextOrder(idx, parent)
  const { data, error } = await supabase
    .from('folders')
    .insert({
      user_id: userId,
      parent_id: parent,
      name: DEFAULT_FOLDER_NAME,
      sort_order: order,
    })
    .select()
    .single()
  if (error || !data) {
    console.error('[canvasStore] createFolder', error)
    return null
  }
  notify()
  return mapFolder(data as FolderRow)
}

export async function renameItem(id: ItemId, name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  // Try canvases first; if no row updated, fall back to folders.
  const canvasUpd = await supabase
    .from('canvases')
    .update({ name: trimmed })
    .eq('id', id)
    .select('id')
  if (canvasUpd.error) console.error('[canvasStore] renameItem canvases', canvasUpd.error)
  if (canvasUpd.data && canvasUpd.data.length > 0) {
    notify()
    return
  }
  const folderUpd = await supabase
    .from('folders')
    .update({ name: trimmed })
    .eq('id', id)
    .select('id')
  if (folderUpd.error) console.error('[canvasStore] renameItem folders', folderUpd.error)
  notify()
}

// Set a folder's color to a palette key, or null to reset to the default manila.
export async function setFolderColor(id: FolderId, color: string | null): Promise<void> {
  const { error } = await supabase
    .from('folders')
    .update({ color })
    .eq('id', id)
  if (error) console.error('[canvasStore] setFolderColor', error)
  notify()
}

export async function setThumbnail(canvasId: CanvasId, blob: Blob | null): Promise<void> {
  const userId = await requireUserId()
  const path = `${userId}/${canvasId}.png`

  if (blob == null) {
    await supabase.storage.from('thumbnails').remove([path]).then(({ error }) => {
      if (error && !isNotFound(error)) console.warn('[canvasStore] thumbnail remove', error)
    })
    thumbnailUrlCache.delete(path)
    const { error } = await supabase
      .from('canvases')
      .update({ thumbnail_path: null })
      .eq('id', canvasId)
    if (error) console.error('[canvasStore] setThumbnail clear', error)
    notify()
    return
  }

  const { error: uploadErr } = await supabase.storage
    .from('thumbnails')
    .upload(path, blob, { upsert: true, contentType: 'image/png' })
  if (uploadErr) {
    console.error('[canvasStore] thumbnail upload', uploadErr)
    return
  }
  thumbnailUrlCache.delete(path)
  const { error } = await supabase
    .from('canvases')
    .update({ thumbnail_path: path })
    .eq('id', canvasId)
  if (error) console.error('[canvasStore] setThumbnail', error)
  notify()
}

const thumbnailUrlCache = new Map<string, { url: string; expires: number }>()

export async function getThumbnailUrl(canvas: CanvasMeta): Promise<string | null> {
  const path = canvas.thumbnailPath
  if (!path) return null
  const cached = thumbnailUrlCache.get(path)
  if (cached && cached.expires > Date.now() + 60_000) return cached.url
  const { data, error } = await supabase.storage
    .from('thumbnails')
    .createSignedUrl(path, THUMB_SIGNED_URL_TTL_S)
  if (error || !data?.signedUrl) {
    if (error && !isNotFound(error)) console.warn('[canvasStore] thumbnail signed url', error)
    return null
  }
  thumbnailUrlCache.set(path, {
    url: data.signedUrl,
    expires: Date.now() + THUMB_SIGNED_URL_TTL_S * 1000,
  })
  return data.signedUrl
}

export async function deleteCanvas(id: CanvasId): Promise<void> {
  const userId = await requireUserId()
  // Best-effort Storage cleanup runs first so a successful DB delete doesn't
  // leave orphans behind when Storage was reachable.
  const drawingPath = `${userId}/${id}.json`
  const thumbnailPath = `${userId}/${id}.png`
  await Promise.allSettled([
    supabase.storage.from('drawings').remove([drawingPath]),
    supabase.storage.from('thumbnails').remove([thumbnailPath]),
    deleteDoc(id),
  ])
  thumbnailUrlCache.delete(thumbnailPath)
  const { error } = await supabase.from('canvases').delete().eq('id', id)
  if (error) console.error('[canvasStore] deleteCanvas', error)
  notify()
}

export async function deleteFolder(id: FolderId): Promise<void> {
  const userId = await requireUserId()
  // Gather descendant canvases up front so we can clean their Storage files.
  // The DB delete cascades via FK; this is just for blob cleanup.
  const idx = await loadIndex()
  const toDelete = new Set<FolderId>([id])
  for (let pass = 0; pass < idx.folders.length; pass++) {
    const before = toDelete.size
    for (const f of idx.folders) if (f.parent && toDelete.has(f.parent)) toDelete.add(f.id)
    if (toDelete.size === before) break
  }
  const orphanCanvases = idx.canvases.filter((c) => c.parent && toDelete.has(c.parent))

  await Promise.allSettled(
    orphanCanvases.flatMap((c) => [
      supabase.storage.from('drawings').remove([`${userId}/${c.id}.json`]),
      supabase.storage.from('thumbnails').remove([`${userId}/${c.id}.png`]),
      deleteDoc(c.id),
    ]),
  )
  for (const c of orphanCanvases) thumbnailUrlCache.delete(`${userId}/${c.id}.png`)

  const { error } = await supabase.from('folders').delete().eq('id', id)
  if (error) console.error('[canvasStore] deleteFolder', error)
  notify()
}

export async function deleteItem(id: ItemId): Promise<void> {
  const idx = await loadIndex()
  if (idx.canvases.some((c) => c.id === id)) await deleteCanvas(id)
  else if (idx.folders.some((f) => f.id === id)) await deleteFolder(id)
}

export async function duplicateCanvas(id: CanvasId): Promise<CanvasMeta | null> {
  const userId = await requireUserId()
  const idx = await loadIndex()
  const src = idx.canvases.find((c) => c.id === id)
  if (!src) return null

  const order = nextOrder(idx, src.parent)
  // Insert the new row first so we have its id for the Storage copy.
  const { data: insertRow, error: insertErr } = await supabase
    .from('canvases')
    .insert({
      user_id: userId,
      parent_id: src.parent,
      name: `${src.name} (copy)`,
      sort_order: order,
    })
    .select()
    .single()
  if (insertErr || !insertRow) {
    console.error('[canvasStore] duplicateCanvas insert', insertErr)
    return null
  }
  const copy = mapCanvas(insertRow as CanvasRow)

  const srcDrawing = `${userId}/${src.id}.json`
  const dstDrawing = `${userId}/${copy.id}.json`
  const drawingCopy = await supabase.storage.from('drawings').copy(srcDrawing, dstDrawing)
  if (!drawingCopy.error) {
    await supabase.from('canvases').update({ drawing_path: dstDrawing }).eq('id', copy.id)
  } else if (!isNotFound(drawingCopy.error)) {
    console.warn('[canvasStore] duplicateCanvas drawing copy', drawingCopy.error)
  }

  if (src.thumbnailPath) {
    const dstThumb = `${userId}/${copy.id}.png`
    const thumbCopy = await supabase.storage.from('thumbnails').copy(src.thumbnailPath, dstThumb)
    if (!thumbCopy.error) {
      await supabase.from('canvases').update({ thumbnail_path: dstThumb }).eq('id', copy.id)
    } else if (!isNotFound(thumbCopy.error)) {
      console.warn('[canvasStore] duplicateCanvas thumbnail copy', thumbCopy.error)
    }
  }

  // Copy chat messages.
  const { data: msgs } = await supabase
    .from('chat_messages')
    .select('role, text, status, sort_index')
    .eq('canvas_id', src.id)
  if (msgs && msgs.length > 0) {
    const rows = msgs.map((m) => ({ ...m, canvas_id: copy.id }))
    const { error: chatErr } = await supabase.from('chat_messages').insert(rows)
    if (chatErr) console.warn('[canvasStore] duplicateCanvas chat copy', chatErr)
  }

  notify()
  return copy
}

export async function moveItem(id: ItemId, parent: FolderId | null): Promise<void> {
  const idx = await loadIndex()
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

  const order = nextOrder(idx, parent)
  const table = c ? 'canvases' : 'folders'
  const { error } = await supabase
    .from(table)
    .update({ parent_id: parent, sort_order: order })
    .eq('id', id)
  if (error) console.error('[canvasStore] moveItem', error)
  notify()
}

export async function reorderItems(parent: FolderId | null, orderedIds: ItemId[]): Promise<void> {
  const idx = await loadIndex()
  const inSet = new Set(orderedIds)
  // Determine table per id from the current index.
  const updates = orderedIds.map((id, i) => {
    const isCanvas = idx.canvases.some((c) => c.id === id && c.parent === parent)
    const isFolder = idx.folders.some((f) => f.id === id && f.parent === parent)
    if (!isCanvas && !isFolder) return null
    return { table: isCanvas ? 'canvases' : 'folders', id, order: i }
  })

  // Bail if any id wasn't found in the right parent — caller passed bad data.
  if (updates.some((u) => u === null)) {
    console.warn('[canvasStore] reorderItems got ids not in parent', { parent, orderedIds })
  }

  // Run updates in parallel; small batches per typical folder.
  await Promise.all(
    updates
      .filter((u): u is { table: string; id: ItemId; order: number } => u !== null)
      .map(({ table, id, order }) =>
        supabase.from(table).update({ sort_order: order }).eq('id', id),
      ),
  )
  // Suppress unused-warning for inSet on type-tightening builds.
  void inSet
  notify()
}

// =============================================================
// Per-canvas chat state
// =============================================================

export async function loadChat(canvasId: CanvasId): Promise<ChatState> {
  const [canvasRes, msgsRes] = await Promise.all([
    supabase
      .from('canvases')
      .select('chat_box, chat_latex_draft')
      .eq('id', canvasId)
      .single(),
    supabase
      .from('chat_messages')
      .select('role, text, status, sort_index')
      .eq('canvas_id', canvasId)
      .order('sort_index'),
  ])
  if (canvasRes.error && canvasRes.error.code !== 'PGRST116') {
    // PGRST116 = no rows (e.g., right after delete); not worth logging.
    console.warn('[canvasStore] loadChat canvas', canvasRes.error)
  }
  if (msgsRes.error) {
    console.warn('[canvasStore] loadChat messages', msgsRes.error)
  }
  const messages: ChatMessage[] = (msgsRes.data ?? []).map((m) => ({
    role: m.role as ChatRole,
    text: m.text as string,
    status: (m.status as ChatStatus | null) ?? undefined,
  }))
  const latex = (canvasRes.data?.chat_latex_draft as string | undefined) ?? ''
  const box = (canvasRes.data?.chat_box as ChatBox | undefined) ?? undefined
  return { latex, messages, box }
}

// saveChat is debounced per canvas. The caller can fire-and-forget on every
// state change without saturating the network — a common pattern for chat
// input as the user types.
const saveChatTimers = new Map<string, number>()
const saveChatLatest = new Map<string, ChatState>()

export function saveChat(canvasId: CanvasId, state: ChatState): void {
  saveChatLatest.set(canvasId, state)
  const existing = saveChatTimers.get(canvasId)
  if (existing) window.clearTimeout(existing)
  const timer = window.setTimeout(() => {
    saveChatTimers.delete(canvasId)
    const final = saveChatLatest.get(canvasId)
    if (!final) return
    saveChatLatest.delete(canvasId)
    void persistChat(canvasId, final)
  }, CHAT_SAVE_DEBOUNCE_MS)
  saveChatTimers.set(canvasId, timer)
}

async function persistChat(canvasId: CanvasId, state: ChatState): Promise<void> {
  const { error: canvasErr } = await supabase
    .from('canvases')
    .update({ chat_box: state.box ?? null, chat_latex_draft: state.latex })
    .eq('id', canvasId)
  if (canvasErr) {
    console.warn('[canvasStore] persistChat canvas update', canvasErr)
    return
  }

  // Simple correctness model: replace the canvas's message log on every flush.
  // Rows are small and call rate is low (post-debounce).
  const { error: delErr } = await supabase
    .from('chat_messages')
    .delete()
    .eq('canvas_id', canvasId)
  if (delErr) {
    console.warn('[canvasStore] persistChat delete', delErr)
    return
  }
  if (state.messages.length > 0) {
    const rows = state.messages.map((m, i) => ({
      canvas_id: canvasId,
      role: m.role,
      text: m.text,
      status: m.status ?? null,
      sort_index: i,
    }))
    const { error: insErr } = await supabase.from('chat_messages').insert(rows)
    if (insErr) console.warn('[canvasStore] persistChat insert', insErr)
  }
  notify()
}

// =============================================================
// Misc
// =============================================================

// Storage SDK errors on "not found" come through as a regular error object;
// we suppress those because they're expected (e.g., delete on missing object).
function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { message?: string; statusCode?: string | number }
  const code = String(e.statusCode ?? '')
  if (code === '404') return true
  return typeof e.message === 'string' && /not[_ ]?found/i.test(e.message)
}
