import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import {
  type CanvasIndex,
  type CanvasMeta,
  type Folder,
  type FolderId,
  type Item,
  type ItemId,
  createCanvas,
  createFolder,
  deleteItem,
  duplicateCanvas,
  folderPath,
  getThumbnailUrl,
  listChildren,
  loadIndex,
  moveItem,
  renameItem,
  reorderItems,
  searchAll,
  setFolderColor,
  subscribe,
} from '../lib/canvasStore'
import { signOut } from '../lib/auth'
import { hapticTap } from '../lib/native'
import { importFile, type ImportProgress } from '../lib/import'
import { AccountScreen, type AccountScreenId } from './AccountScreen'

// Drag tuning. Touch needs a deliberate long-press to pick a card up (so an
// ordinary swipe scrolls the grid instead of dragging); mouse/pen pick up as
// soon as the pointer travels a few px.
const LONG_PRESS_MS = 240
const TOUCH_MOVE_CANCEL = 12 // touch: travel past this before the press fires = a scroll, abandon drag
const MOUSE_DRAG_START = 6 // mouse/pen: travel past this begins a drag
const REMOVE_ANIM_MS = 180 // fade-out before a deleted card leaves the grid

// Folder color palette. Muted, paper-like tones that read against the dark ink
// border. The stored value is the `key`; `manila` is the default and is stored
// as null so a fresh folder has no color row. Page sheets stay cream regardless
// so they read as paper tucked inside any folder color.
const FOLDER_COLORS: { key: string; label: string; value: string }[] = [
  { key: 'manila', label: 'Default', value: '#f3ecd6' },
  { key: 'red', label: 'Red', value: '#e6b9b0' },
  { key: 'orange', label: 'Orange', value: '#ecc9a6' },
  { key: 'yellow', label: 'Yellow', value: '#e6d79b' },
  { key: 'green', label: 'Green', value: '#c2d6b4' },
  { key: 'blue', label: 'Blue', value: '#b6ccdd' },
  { key: 'purple', label: 'Purple', value: '#ccc0de' },
  { key: 'pink', label: 'Pink', value: '#e6c2d4' },
]

// Resolve a stored palette key to its hex. Unknown/undefined keys return
// undefined so the CSS `var(--folder-color, …)` fallback takes over.
function folderColorValue(key?: string): string | undefined {
  return FOLDER_COLORS.find((c) => c.key === key)?.value
}

// ---------------------------------------------------------------------------
// Optimistic index transforms — mirror the store mutations on the in-memory
// snapshot so the grid reacts the instant you drop or delete, instead of
// freezing until the network round-trip + refetch lands. The subsequent store
// notify → reload reconciles with server truth (which matches), so there's no
// flash.
// ---------------------------------------------------------------------------

function nextOrderLocal(index: CanvasIndex, parent: FolderId | null): number {
  const peers = [
    ...index.folders.filter((f) => f.parent === parent),
    ...index.canvases.filter((c) => c.parent === parent),
  ]
  return peers.length === 0 ? 0 : Math.max(...peers.map((p) => p.order)) + 1
}

function reindexOrder(index: CanvasIndex, parent: FolderId | null, orderedIds: ItemId[]): CanvasIndex {
  const pos = new Map(orderedIds.map((id, i) => [id, i] as const))
  return {
    ...index,
    canvases: index.canvases.map((c) =>
      c.parent === parent && pos.has(c.id) ? { ...c, order: pos.get(c.id)! } : c,
    ),
    folders: index.folders.map((f) =>
      f.parent === parent && pos.has(f.id) ? { ...f, order: pos.get(f.id)! } : f,
    ),
  }
}

function applyMoveLocal(index: CanvasIndex, id: ItemId, parent: FolderId | null): CanvasIndex {
  const order = nextOrderLocal(index, parent)
  return {
    ...index,
    canvases: index.canvases.map((c) => (c.id === id ? { ...c, parent, order } : c)),
    folders: index.folders.map((f) => (f.id === id ? { ...f, parent, order } : f)),
  }
}

function removeItemLocal(index: CanvasIndex, id: ItemId): CanvasIndex {
  // A folder takes its whole subtree with it (the DB cascades; mirror that here).
  const doomed = new Set<ItemId>([id])
  for (let pass = 0; pass < index.folders.length; pass++) {
    const before = doomed.size
    for (const f of index.folders) if (f.parent && doomed.has(f.parent)) doomed.add(f.id)
    if (doomed.size === before) break
  }
  return {
    ...index,
    folders: index.folders.filter((f) => !doomed.has(f.id)),
    canvases: index.canvases.filter((c) => !doomed.has(c.id) && !(c.parent && doomed.has(c.parent))),
  }
}

// A folder can't be dropped into itself or one of its own descendants.
function canMoveInto(index: CanvasIndex, draggingId: ItemId, targetFolderId: FolderId): boolean {
  let cursor: FolderId | null = targetFolderId
  for (let i = 0; i < index.folders.length + 1 && cursor; i++) {
    if (cursor === draggingId) return false
    const f: Folder | undefined = index.folders.find((x) => x.id === cursor)
    cursor = f ? f.parent : null
  }
  return true
}

const STYLES = `
.canvas-menu{
  --paper:#f6f1e6;
  --paper-2:#efe8d6;
  --ink:#18243f;
  --ink-soft:#3a4a69;
  --pencil:#6b7284;
  --rule:#d9cfb6;
  --rule-soft:#e7dfc9;
  --red:#b4453d;
  --accent:#2d5ad9;
  --sans:'Fraunces','Iowan Old Style',Georgia,serif;
  --hand:'Caveat','Comic Sans MS',cursive;
  --mono:'JetBrains Mono',ui-monospace,monospace;
  --ui:'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
  background:var(--paper);
  color:var(--ink);
  min-height:100vh;
  font-family:var(--ui);
  position:relative;
}
.canvas-menu::before{
  content:"";position:fixed;inset:0;pointer-events:none;z-index:0;
  background-image:
    radial-gradient(rgba(24,36,63,0.035) 1px, transparent 1.2px),
    radial-gradient(rgba(24,36,63,0.02) 1px, transparent 1.2px);
  background-size:3px 3px,7px 7px;
  background-position:0 0,1px 2px;
  mix-blend-mode:multiply;
}
.canvas-menu > *{position:relative;z-index:1}
.canvas-menu .container{max-width:1180px;margin:0 auto;padding:0 28px}

.canvas-menu header.bar{
  display:flex;align-items:center;gap:18px;padding:22px 28px;
  border-bottom:1.5px solid var(--ink);background:var(--paper);
  position:sticky;top:0;z-index:10;
}
.canvas-menu header.bar .brand{display:flex;align-items:center;gap:2px}
.canvas-menu header.bar .brand .word{font-family:var(--sans);font-weight:500;font-size:20px;letter-spacing:-0.01em}
.canvas-menu header.bar .brand .menu-toggle{
  display:inline-flex;align-items:center;justify-content:center;
  width:36px;height:36px;border-radius:10px;cursor:pointer;
  background:transparent;border:1.5px solid transparent;color:var(--ink);
  transition:background .15s ease, border-color .15s ease;
}
@media (hover: hover){ .canvas-menu header.bar .brand .menu-toggle:hover{background:var(--paper-2);border-color:var(--rule)} }

.canvas-menu .sidebar-backdrop{
  position:fixed;inset:0;background:rgba(24,36,63,0.28);
  opacity:0;pointer-events:none;transition:opacity .2s ease;z-index:50;
}
.canvas-menu .sidebar-backdrop.open{opacity:1;pointer-events:auto}
.canvas-menu .sidebar{
  position:fixed;top:0;left:0;bottom:0;width:280px;
  background:var(--paper);border-right:1.5px solid var(--ink);
  transform:translateX(-100%);transition:transform .25s ease;
  z-index:60;display:flex;flex-direction:column;
  box-shadow:2px 0 12px rgba(24,36,63,0.08);
}
.canvas-menu .sidebar.open{transform:translateX(0)}
.canvas-menu .sidebar-header{
  display:flex;align-items:center;justify-content:space-between;
  padding:20px 22px;border-bottom:1.5px solid var(--rule);
}
.canvas-menu .sidebar-title{
  font-family:var(--sans);font-weight:500;font-size:18px;letter-spacing:-0.01em;color:var(--ink);
}
.canvas-menu .sidebar-close{
  display:inline-flex;align-items:center;justify-content:center;
  width:30px;height:30px;border-radius:8px;cursor:pointer;
  background:transparent;border:none;color:var(--ink-soft);
  transition:background .15s ease, color .15s ease;
}
@media (hover: hover){ .canvas-menu .sidebar-close:hover{background:var(--paper-2);color:var(--ink)} }
.canvas-menu .sidebar-nav{display:flex;flex-direction:column;padding:12px 10px;gap:2px}
.canvas-menu .sidebar-item{
  display:flex;align-items:center;gap:12px;
  padding:11px 14px;border-radius:10px;cursor:pointer;
  background:transparent;border:none;color:var(--ink);
  font-family:var(--ui);font-size:14px;font-weight:500;text-align:left;
  transition:background .15s ease;
}
@media (hover: hover){ .canvas-menu .sidebar-item:hover{background:var(--paper-2)} }
.canvas-menu .sidebar-item-icon{
  display:inline-flex;align-items:center;justify-content:center;
  width:22px;height:22px;color:var(--ink-soft);flex-shrink:0;
}
.canvas-menu header.bar .search{
  flex:1;max-width:520px;display:flex;align-items:center;gap:10px;
  border:1.5px solid var(--ink);border-radius:999px;background:#fdfaf2;
  padding:8px 16px;
}
.canvas-menu header.bar .search input{
  flex:1;border:none;background:transparent;outline:none;font-size:14px;color:var(--ink);
  font-family:var(--ui);
}
.canvas-menu header.bar .search input::placeholder{color:var(--pencil)}
.canvas-menu header.bar .actions{display:flex;align-items:center;gap:10px;margin-left:auto}
.canvas-menu .btn{
  display:inline-flex;align-items:center;gap:8px;cursor:pointer;
  font-family:var(--ui);font-weight:500;font-size:14px;
  padding:9px 16px;border-radius:999px;border:1.5px solid var(--ink);
  background:var(--ink);color:var(--paper);
  transition:background .2s ease, color .2s ease;
}
.canvas-menu .btn.ghost{background:transparent;color:var(--ink)}
/* Hover lift + ghost color-inversion are desktop-only. On iPad there is no real
   hover, so :hover sticks after a tap — the Import / New folder buttons would
   flip dark and stay dark. Confine every hover effect to a true pointer. */
@media (hover: hover){
  .canvas-menu .btn:hover{transform:translateY(-1px)}
  .canvas-menu .btn.ghost:hover{background:var(--ink);color:var(--paper)}
}

.canvas-menu .breadcrumbs{
  display:flex;align-items:center;gap:6px;
  padding:24px 0 4px;font-size:14px;color:var(--ink-soft);
}
.canvas-menu .breadcrumbs button{
  background:none;border:none;cursor:pointer;color:inherit;font:inherit;
  padding:4px 8px;border-radius:4px;
}
@media (hover: hover){ .canvas-menu .breadcrumbs button:hover{background:rgba(24,36,63,0.06);color:var(--ink)} }
.canvas-menu .breadcrumbs .sep{color:var(--pencil)}
.canvas-menu .breadcrumbs .current{color:var(--ink);font-weight:500;padding:4px 8px}

.canvas-menu .grid{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(220px,1fr));
  align-items:start;
  gap:18px;
  padding:18px 0 80px;
}

.canvas-menu .card{
  position:relative;background:#fdfaf2;border:1.5px solid var(--ink);border-radius:8px;
  overflow:hidden;cursor:pointer;
  display:flex;flex-direction:column;
  transition:transform .15s ease, box-shadow .15s ease;
  box-shadow:3px 4px 0 rgba(24,36,63,0.06);
  /* Long-press to pick up a card must not summon the iOS text-selection
     callout/magnifier or select the card's label. */
  -webkit-touch-callout:none;-webkit-user-select:none;user-select:none;
  touch-action:manipulation;
}
/* Hover lift is desktop-only. On iPad there is no real hover, so :hover sticks
   after a tap and the card stays lifted until you tap elsewhere — choppy. Gate
   it behind a pointer that can actually hover. */
@media (hover: hover){
  .canvas-menu .card:hover{transform:translate(-1px,-2px);box-shadow:5px 7px 0 rgba(24,36,63,0.08)}
}
.canvas-menu .card.dragging{opacity:0.4}
.canvas-menu .card.drop-target{outline:2px dashed var(--accent);outline-offset:-4px}
/* Deleted cards fade + shrink out before they leave the grid, so removal reads
   as a deliberate animation instead of an abrupt pop + reflow. */
.canvas-menu .card.removing{
  opacity:0;transform:scale(.92);pointer-events:none;
  transition:opacity .18s ease, transform .18s ease;
}
/* The floating "picked-up" chip that follows the finger while dragging a card.
   Positioned imperatively via transform; pointer-events:none so it never blocks
   elementFromPoint hit-testing of the cards underneath. */
.canvas-menu .drag-ghost{
  position:fixed;left:0;top:0;z-index:200;pointer-events:none;
  max-width:240px;display:flex;align-items:center;gap:10px;
  padding:10px 14px;border-radius:10px;
  background:#fff;border:1.5px solid var(--ink);
  box-shadow:6px 10px 0 rgba(24,36,63,0.16);
  font-family:var(--ui);font-size:14px;font-weight:600;color:var(--ink);
  will-change:transform;
}
.canvas-menu .drag-ghost .g-icon{flex-shrink:0;display:inline-flex;color:var(--ink-soft)}
.canvas-menu .drag-ghost .g-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

.canvas-menu .import-overlay{
  position:fixed;inset:0;z-index:300;display:flex;align-items:center;justify-content:center;
  background:rgba(24,36,63,0.28);
}
.canvas-menu .import-card{
  background:#fff;border:1.5px solid var(--ink);border-radius:12px;
  padding:22px 26px;min-width:260px;text-align:center;
  box-shadow:6px 10px 0 rgba(24,36,63,0.16);font-family:var(--ui);
}
.canvas-menu .import-card .title{font-weight:600;font-size:15px;color:var(--ink);margin-bottom:12px}
.canvas-menu .import-card .bar{height:6px;border-radius:3px;background:var(--paper-2);overflow:hidden}
.canvas-menu .import-card .bar > span{display:block;height:100%;background:var(--accent);transition:width .2s ease}
.canvas-menu .import-card .sub{
  margin-top:10px;font-family:var(--mono);font-size:11px;color:var(--pencil);
  letter-spacing:0.06em;text-transform:uppercase;
}
/* While the kebab menu is open, lift the whole card above sibling cards so the
   overflowing dropdown isn't covered. Hover applies a transform, which creates
   a stacking context and would otherwise trap the menu's z-index inside the
   card. Kept below the sticky header (z-index:10). */
.canvas-menu .card.menu-open{z-index:8;overflow:visible}

.canvas-menu .thumb{
  height:140px;display:flex;align-items:center;justify-content:center;
  background:
    linear-gradient(to right,var(--rule-soft) 1px,transparent 1px) 0 0/22px 22px,
    linear-gradient(to bottom,var(--rule-soft) 1px,transparent 1px) 0 0/22px 22px,
    #fffaee;
  border-bottom:1px dashed var(--rule);
  overflow:hidden;
}
.canvas-menu .thumb img{
  width:100%;height:100%;object-fit:cover;display:block;
}
.canvas-menu .thumb .empty{
  font-family:var(--hand);font-size:22px;color:var(--pencil);transform:rotate(-2deg);
}
/* Folders get a real folder silhouette: a tab on top + a manila body. */
.canvas-menu .card.folder-card{
  overflow:visible;
  margin-top:14px;
  background:var(--folder-color,#f3ecd6);
}
.canvas-menu .card.folder-card::before{
  content:"";position:absolute;left:16px;top:-14px;
  width:42%;height:16px;
  background:var(--folder-color,#f3ecd6);
  border:1.5px solid var(--ink);border-bottom:none;
  border-radius:7px 9px 0 0;
  z-index:2;
}
.canvas-menu .thumb.folder{
  height:126px;
  position:relative;
  background:var(--folder-color,#f3ecd6);
  border-bottom:none;
  border-radius:6.5px 6.5px 0 0;
}
.canvas-menu .folder-inside{position:absolute;inset:0}
.canvas-menu .folder-inside .page{
  position:absolute;left:50%;transform:translateX(-50%);
  width:84%;height:56px;
  background:#fffdf6;border:1.5px solid var(--ink);border-radius:4px 4px 0 0;
}
.canvas-menu .folder-inside .p1{top:24px;z-index:1;background:#f6efdd}
.canvas-menu .folder-inside .p2{top:30px;z-index:2;background:#fbf6ea}
.canvas-menu .folder-inside .p3{top:36px;z-index:3;background:#fffdf6}
.canvas-menu .folder-inside .folder-front{
  position:absolute;left:0;right:0;top:46px;bottom:0;
  background:var(--folder-color,#f3ecd6);border-top:1.5px solid var(--ink);z-index:4;
}

.canvas-menu .card-body{
  padding:12px 14px;
  display:flex;flex-direction:row;align-items:center;gap:8px;
}
.canvas-menu .card-text{
  flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:4px;
}
.canvas-menu .card-actions{position:relative;flex-shrink:0}
.canvas-menu .card-name{
  font-family:var(--ui);font-size:14px;font-weight:600;color:var(--ink);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.canvas-menu .card-meta{
  font-family:var(--mono);font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--pencil);
}
.canvas-menu .card-name input{
  width:100%;border:1px solid var(--ink);border-radius:4px;padding:2px 6px;
  font:inherit;color:inherit;background:#fff;outline:none;
}

.canvas-menu .kebab{
  display:inline-flex;align-items:center;justify-content:center;
  width:28px;height:28px;border-radius:8px;flex-shrink:0;
  background:transparent;border:none;cursor:pointer;
  color:var(--pencil);
  transition:background .15s ease, color .15s ease;
}
.canvas-menu .kebab.open{background:var(--paper-2);color:var(--ink)}
@media (hover: hover){ .canvas-menu .kebab:hover{background:var(--paper-2);color:var(--ink)} }

.canvas-menu .menu{
  position:absolute;top:calc(100% + 6px);right:0;z-index:20;
  background:#fff;border:1.5px solid var(--ink);border-radius:8px;
  box-shadow:4px 6px 0 rgba(24,36,63,0.1);
  min-width:160px;overflow:hidden;
  font-family:var(--ui);font-size:13px;
}
.canvas-menu .menu button{
  display:flex;align-items:center;gap:8px;
  width:100%;text-align:left;background:none;border:none;cursor:pointer;
  padding:9px 14px;color:var(--ink);font:inherit;
}
@media (hover: hover){ .canvas-menu .menu button:hover{background:rgba(24,36,63,0.06)} }
.canvas-menu .menu button.danger{color:var(--red)}
@media (hover: hover){ .canvas-menu .menu button.danger:hover{background:rgba(180,69,61,0.08)} }
.canvas-menu .menu .sep{height:1px;background:var(--rule)}

.canvas-menu .menu-colors-label{
  padding:8px 14px 2px;
  font-family:var(--mono);font-size:10px;letter-spacing:0.08em;
  text-transform:uppercase;color:var(--pencil);
}
.canvas-menu .menu-colors{
  display:grid;grid-template-columns:repeat(4,1fr);gap:10px;
  justify-items:center;
  padding:6px 14px 12px;
}
/* Scoped under .menu-colors (0,3,0) so width/padding/border win over the
   generic ".menu button" rule (0,2,1) — otherwise swatches stretch to full
   width and render as ovals instead of circles. */
.canvas-menu .menu-colors .swatch{
  display:block;width:24px;height:24px;border-radius:50%;
  padding:0;cursor:pointer;
  border:1.5px solid var(--ink);
  box-shadow:1px 1px 0 rgba(24,36,63,0.12);
  transition:transform .1s ease;
}
@media (hover: hover){ .canvas-menu .menu-colors .swatch:hover{transform:translateY(-1px)} }
.canvas-menu .menu-colors .swatch.active{outline:2px solid var(--accent);outline-offset:2px}

.canvas-menu .empty-state{
  padding:80px 24px;text-align:center;color:var(--ink-soft);
}
.canvas-menu .empty-state h3{
  font-family:var(--sans);font-weight:300;font-size:32px;letter-spacing:-0.02em;
  color:var(--ink);margin:0 0 12px;
}
.canvas-menu .empty-state h3 .it{font-style:italic}
.canvas-menu .empty-state p{margin:0 0 24px;font-size:15px}

.canvas-menu .root-drop{
  margin-top:14px;border:1.5px dashed transparent;border-radius:6px;
  padding:8px 12px;font-size:12px;color:var(--pencil);
  font-family:var(--mono);letter-spacing:0.06em;text-transform:uppercase;
}
.canvas-menu .root-drop.active{border-color:var(--accent);color:var(--accent)}
`

type CanvasMenuProps = {
  onOpenCanvas: (id: string) => void
}

const EMPTY_INDEX: CanvasIndex = { version: 2, canvases: [], folders: [] }

export function CanvasMenu({ onOpenCanvas }: CanvasMenuProps) {
  const [index, setIndex] = useState<CanvasIndex>(EMPTY_INDEX)
  const [indexLoaded, setIndexLoaded] = useState(false)
  const [parent, setParent] = useState<FolderId | null>(null)
  const [search, setSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [accountScreen, setAccountScreen] = useState<AccountScreenId | null>(null)
  const [openMenuId, setOpenMenuId] = useState<ItemId | null>(null)
  const [renamingId, setRenamingId] = useState<ItemId | null>(null)
  const [draggingId, setDraggingId] = useState<ItemId | null>(null)
  const [dropTargetId, setDropTargetId] = useState<ItemId | null>(null)
  const [rootDropActive, setRootDropActive] = useState(false)
  // Cards mid fade-out after a delete (still rendered, animating away).
  const [removingIds, setRemovingIds] = useState<Set<ItemId>>(() => new Set())
  // Non-null while an import (PDF/image → canvas) is in flight.
  const [importing, setImporting] = useState<ImportProgress | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Live mirrors the drag controller reads. The controller is built once and
  // must always see current values, so it reads these refs rather than closing
  // over render-time state. Synced after each commit; the controller only reads
  // them inside pointer handlers, which always fire after the commit lands.
  const indexRef = useRef(index)
  const parentRef = useRef(parent)
  const searchRef = useRef(search)
  const renamingRef = useRef(renamingId)
  useEffect(() => {
    indexRef.current = index
    parentRef.current = parent
    searchRef.current = search
    renamingRef.current = renamingId
  })

  // Load the index on mount and whenever the store notifies a change.
  useEffect(() => {
    let cancelled = false
    const reload = async () => {
      const next = await loadIndex()
      if (cancelled) return
      setIndex(next)
      setIndexLoaded(true)
    }
    void reload()
    const unsub = subscribe(() => void reload())
    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  // Reset transient UI state when navigating between folders.
  useEffect(() => {
    setOpenMenuId(null)
    setRenamingId(null)
    setDraggingId(null)
    setDropTargetId(null)
  }, [parent])

  // If the current parent folder gets deleted, fall back to root.
  useEffect(() => {
    if (parent == null) return
    if (!index.folders.some((f) => f.id === parent)) setParent(null)
  }, [parent, index])

  // Close any open kebab menu when clicking outside the cards.
  useEffect(() => {
    if (!openMenuId) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('.menu') || target.closest('.kebab')) return
      setOpenMenuId(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openMenuId])

  const items: Item[] = useMemo(() => {
    return search.trim() ? searchAll(index, search) : listChildren(index, parent)
  }, [parent, search, index])

  const path = useMemo(() => folderPath(index, parent), [parent, index])

  const handleNewCanvas = useCallback(async () => {
    const meta = await createCanvas(parent)
    if (meta) onOpenCanvas(meta.id)
  }, [parent, onOpenCanvas])

  const handleNewFolder = useCallback(async () => {
    const f = await createFolder(parent)
    if (f) setRenamingId(f.id)
  }, [parent])

  // Import one or more PDFs/images into the current folder, then open the last
  // one. Progress drives a blocking overlay so the user knows it's working
  // (PDF rasterization + uploads can take a beat).
  const handleImportFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setImporting({ phase: 'rendering', done: 0, total: 1 })
    let lastId: string | null = null
    try {
      for (const file of Array.from(files)) {
        const meta = await importFile({ name: file.name, blob: file }, parent, setImporting)
        if (meta) lastId = meta.id
      }
    } catch (err) {
      console.error('[import] failed', err)
      alert('Sorry — that file could not be imported.')
    } finally {
      setImporting(null)
    }
    if (lastId) onOpenCanvas(lastId)
  }, [parent, onOpenCanvas])

  const handleOpen = useCallback((item: Item) => {
    if (item.kind === 'folder') {
      setParent(item.id)
      setSearch('')
    } else {
      onOpenCanvas(item.id)
    }
  }, [onOpenCanvas])

  // Delete with an optimistic fade: the card animates out and is dropped from
  // the local index right away, so the grid never sits frozen waiting on the
  // network. The background delete + reload reconciles.
  const handleDelete = useCallback((item: Item) => {
    const label = item.kind === 'folder'
      ? `the folder "${item.name}" and everything inside it`
      : `"${item.name}"`
    if (!confirm(`Delete ${label}? This can't be undone.`)) return
    setOpenMenuId(null)
    setRemovingIds((prev) => new Set(prev).add(item.id))
    window.setTimeout(() => {
      setIndex((prev) => removeItemLocal(prev, item.id))
      setRemovingIds((prev) => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
      void deleteItem(item.id)
    }, REMOVE_ANIM_MS)
  }, [])

  // ---- pointer-based drag-and-drop ----
  // HTML5 drag events don't fire for touch, so cards were undraggable on iPad.
  // This drives the whole gesture off pointer events: long-press (touch) or a
  // few px of travel (mouse/pen) picks a card up; a floating ghost follows the
  // finger; the card under the finger is found with elementFromPoint; on
  // release we move-into-folder, reorder, or move-to-root — all optimistic.
  const pointerPosRef = useRef({ x: 0, y: 0 })
  const dropRef = useRef<{ targetId: ItemId | null; root: boolean }>({ targetId: null, root: false })
  const ghostRef = useRef<HTMLDivElement | null>(null)
  const justDraggedRef = useRef(false)
  const pressRef = useRef<{
    id: ItemId
    pointerId: number
    pointerType: string
    startX: number
    startY: number
    dragging: boolean
    timer: number
  } | null>(null)

  const drag = useMemo(() => {
    const positionGhost = () => {
      const el = ghostRef.current
      if (!el) return
      const { x, y } = pointerPosRef.current
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -62%) rotate(-2deg) scale(1.03)`
    }

    const hitTest = (x: number, y: number) => {
      const p = pressRef.current
      if (!p) return
      const el = document.elementFromPoint(x, y) as HTMLElement | null
      if (el?.closest('.root-drop')) {
        dropRef.current = { targetId: null, root: true }
        setRootDropActive(true)
        setDropTargetId(null)
        return
      }
      const card = el?.closest('.card') as HTMLElement | null
      const id = card?.getAttribute('data-item-id') ?? null
      if (id && id !== p.id) {
        dropRef.current = { targetId: id, root: false }
        setRootDropActive(false)
        setDropTargetId(id)
        return
      }
      dropRef.current = { targetId: null, root: false }
      setRootDropActive(false)
      setDropTargetId(null)
    }

    const preventScroll = (e: TouchEvent) => e.preventDefault()

    const finish = () => {
      const p = pressRef.current
      if (!p) return
      if (p.timer) window.clearTimeout(p.timer)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      document.removeEventListener('touchmove', preventScroll)
      pressRef.current = null
      dropRef.current = { targetId: null, root: false }
      setDraggingId(null)
      setDropTargetId(null)
      setRootDropActive(false)
    }

    const beginDrag = () => {
      const p = pressRef.current
      if (!p || p.dragging) return
      p.dragging = true
      if (p.timer) window.clearTimeout(p.timer)
      // Suppress the page scroll for the rest of the gesture (touchmove is the
      // only reliably cancelable scroll source on iOS WKWebView).
      document.addEventListener('touchmove', preventScroll, { passive: false })
      void hapticTap()
      setDraggingId(p.id)
    }

    const commitDrop = (draggingId: ItemId) => {
      const { targetId, root } = dropRef.current
      const idx = indexRef.current
      const par = parentRef.current
      if (root) {
        setIndex((prev) => applyMoveLocal(prev, draggingId, null))
        void moveItem(draggingId, null)
        return
      }
      if (!targetId) return
      const target = [...idx.folders, ...idx.canvases].find((it) => it.id === targetId)
      if (!target) return
      if (target.kind === 'folder') {
        if (!canMoveInto(idx, draggingId, target.id)) return
        setIndex((prev) => applyMoveLocal(prev, draggingId, target.id))
        void moveItem(draggingId, target.id)
      } else {
        const cur = listChildren(idx, par).map((x) => x.id)
        const from = cur.indexOf(draggingId)
        const to = cur.indexOf(targetId)
        if (from === -1 || to === -1) return
        const next = [...cur]
        next.splice(from, 1)
        next.splice(to, 0, draggingId)
        setIndex((prev) => reindexOrder(prev, par, next))
        void reorderItems(par, next)
      }
    }

    const onMove = (e: PointerEvent) => {
      const p = pressRef.current
      if (!p || e.pointerId !== p.pointerId) return
      pointerPosRef.current = { x: e.clientX, y: e.clientY }
      if (!p.dragging) {
        const dist = Math.hypot(e.clientX - p.startX, e.clientY - p.startY)
        if (p.pointerType === 'touch') {
          if (dist > TOUCH_MOVE_CANCEL) finish() // it's a scroll, let go
        } else if (dist > MOUSE_DRAG_START) {
          beginDrag()
        }
        return
      }
      positionGhost()
      hitTest(e.clientX, e.clientY)
    }

    const onUp = (e: PointerEvent) => {
      const p = pressRef.current
      if (!p || e.pointerId !== p.pointerId) return
      if (p.dragging) {
        commitDrop(p.id)
        justDraggedRef.current = true
      }
      finish()
    }

    const onCardPointerDown = (item: Item) => (e: React.PointerEvent) => {
      if (e.button !== 0) return
      if (searchRef.current.trim()) return // reordering search results is meaningless
      if (renamingRef.current === item.id) return
      const t = e.target as HTMLElement
      if (t.closest('.kebab') || t.closest('.menu') || t.closest('input')) return
      if (pressRef.current) finish() // a stray earlier press — clean up first
      justDraggedRef.current = false
      pointerPosRef.current = { x: e.clientX, y: e.clientY }
      pressRef.current = {
        id: item.id,
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        startX: e.clientX,
        startY: e.clientY,
        dragging: false,
        timer: e.pointerType === 'touch' ? window.setTimeout(beginDrag, LONG_PRESS_MS) : 0,
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    }

    return { onCardPointerDown }
  }, [])

  const draggingItem = draggingId ? items.find((i) => i.id === draggingId) ?? null : null

  // Place the ghost at the finger the moment it appears (before paint, so there's
  // no top-left flash); pointer moves then reposition it imperatively.
  useLayoutEffect(() => {
    if (!draggingId) return
    const el = ghostRef.current
    if (!el) return
    const { x, y } = pointerPosRef.current
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -62%) rotate(-2deg) scale(1.03)`
  }, [draggingId])

  return (
    <div className="canvas-menu">
      <style>{STYLES}</style>

      <header className="bar">
        <div className="brand">
          <button
            type="button"
            className="menu-toggle"
            aria-label="Open menu"
            onClick={() => setSidebarOpen(true)}
          >
            <MenuIcon />
          </button>
          <span className="word">Eura</span>
        </div>

        <div className="search">
          <SearchIcon />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search canvases and folders…"
            aria-label="Search"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--pencil)', fontSize: 14 }}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        <div className="actions">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              void handleImportFiles(e.target.files)
              e.target.value = '' // allow re-importing the same file
            }}
          />
          <button className="btn ghost" onClick={() => fileInputRef.current?.click()}>
            <UploadIcon /> Import
          </button>
          <button className="btn ghost" onClick={() => void handleNewFolder()}>
            <FolderPlusIcon /> New folder
          </button>
          <button className="btn" onClick={() => void handleNewCanvas()}>
            <PlusIcon /> New canvas
          </button>
        </div>
      </header>

      <main className="container">
        {!search && (
          <nav className="breadcrumbs" aria-label="Breadcrumbs">
            <button onClick={() => setParent(null)}>All canvases</button>
            {path.map((f, i) => (
              <span key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="sep">/</span>
                {i === path.length - 1 ? (
                  <span className="current">{f.name}</span>
                ) : (
                  <button onClick={() => setParent(f.id)}>{f.name}</button>
                )}
              </span>
            ))}
          </nav>
        )}

        {!indexLoaded ? null : items.length === 0 ? (
          <EmptyState searching={!!search.trim()} onNewCanvas={() => void handleNewCanvas()} />
        ) : (
          <div className="grid">
            {items.map((item) => (
              <Card
                key={item.id}
                item={item}
                index={index}
                isDragging={draggingId === item.id}
                isDropTarget={dropTargetId === item.id && draggingId !== item.id}
                isRemoving={removingIds.has(item.id)}
                isRenaming={renamingId === item.id}
                isMenuOpen={openMenuId === item.id}
                showLocation={!!search}
                onOpen={() => {
                  // Swallow the click synthesized right after a drag release.
                  if (justDraggedRef.current) { justDraggedRef.current = false; return }
                  handleOpen(item)
                }}
                onRequestRename={() => setRenamingId(item.id)}
                onCommitRename={(name) => { void renameItem(item.id, name); setRenamingId(null) }}
                onCancelRename={() => setRenamingId(null)}
                onToggleMenu={() => setOpenMenuId((cur) => cur === item.id ? null : item.id)}
                onDelete={() => handleDelete(item)}
                onDuplicate={() => {
                  if (item.kind !== 'canvas') return
                  void duplicateCanvas(item.id)
                  setOpenMenuId(null)
                }}
                onSetColor={(color) => {
                  if (item.kind !== 'folder') return
                  void setFolderColor(item.id, color)
                  setOpenMenuId(null)
                }}
                onPointerDown={drag.onCardPointerDown(item)}
              />
            ))}
          </div>
        )}

        {!search && parent != null && (
          <div className={`root-drop ${rootDropActive ? 'active' : ''}`}>
            ↑ drag here to move to All canvases
          </div>
        )}
      </main>

      {importing && (
        <div className="import-overlay" role="status" aria-live="polite">
          <div className="import-card">
            <div className="title">
              {importing.phase === 'rendering' ? 'Reading your file…' : 'Importing…'}
            </div>
            <div className="bar">
              <span style={{ width: `${Math.round((importing.done / Math.max(1, importing.total)) * 100)}%` }} />
            </div>
            <div className="sub">
              {importing.phase === 'rendering' ? 'Rendering' : 'Uploading'} {importing.done}/{importing.total}
            </div>
          </div>
        </div>
      )}

      {draggingItem && (
        <div className="drag-ghost" ref={ghostRef} aria-hidden="true">
          <span className="g-icon">
            {draggingItem.kind === 'folder' ? <MiniFolderIcon /> : <MiniPageIcon />}
          </span>
          <span className="g-name">{draggingItem.name}</span>
        </div>
      )}

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenScreen={(id) => { setSidebarOpen(false); setAccountScreen(id) }}
        onSignOut={() => { setSidebarOpen(false); void signOut() }}
      />

      <AccountScreen screen={accountScreen} onClose={() => setAccountScreen(null)} />
    </div>
  )
}

function Sidebar({
  open,
  onClose,
  onOpenScreen,
  onSignOut,
}: {
  open: boolean
  onClose: () => void
  onOpenScreen: (id: AccountScreenId) => void
  onSignOut: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const items: { label: string; icon: ComponentType; onClick?: () => void; danger?: boolean }[] = [
    { label: 'Profile', icon: ProfileIcon, onClick: () => onOpenScreen('profile') },
    { label: 'Settings', icon: SettingsIcon, onClick: () => onOpenScreen('settings') },
    { label: 'Plan', icon: PaymentsIcon, onClick: () => onOpenScreen('payments') },
    { label: 'Help & Support', icon: HelpIcon, onClick: () => onOpenScreen('help') },
    { label: 'Sign Out', icon: SignOutIcon, onClick: onSignOut },
  ]

  return (
    <>
      <div
        className={`sidebar-backdrop ${open ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={`sidebar ${open ? 'open' : ''}`}
        aria-hidden={!open}
        role="dialog"
        aria-label="Account menu"
      >
        <div className="sidebar-header">
          <span className="sidebar-title">Menu</span>
          <button type="button" className="sidebar-close" onClick={onClose} aria-label="Close menu">
            <CloseIcon />
          </button>
        </div>
        <nav className="sidebar-nav">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`sidebar-item ${item.danger ? 'danger' : ''}`}
              onClick={item.onClick}
            >
              <span className="sidebar-item-icon"><item.icon /></span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>
    </>
  )
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

type CardProps = {
  item: Item
  index: CanvasIndex
  isDragging: boolean
  isDropTarget: boolean
  isRemoving: boolean
  isRenaming: boolean
  isMenuOpen: boolean
  showLocation: boolean
  onOpen: () => void
  onRequestRename: () => void
  onCommitRename: (name: string) => void
  onCancelRename: () => void
  onToggleMenu: () => void
  onDelete: () => void
  onDuplicate: () => void
  onSetColor: (color: string | null) => void
  onPointerDown: (e: React.PointerEvent) => void
}

function Card({
  item,
  index,
  isDragging,
  isDropTarget,
  isRemoving,
  isRenaming,
  isMenuOpen,
  showLocation,
  onOpen,
  onRequestRename,
  onCommitRename,
  onCancelRename,
  onToggleMenu,
  onDelete,
  onDuplicate,
  onSetColor,
  onPointerDown,
}: CardProps) {
  const isFolder = item.kind === 'folder'
  const folderColor = isFolder ? folderColorValue((item as Folder).color) : undefined
  const cardStyle = folderColor
    ? ({ '--folder-color': folderColor } as React.CSSProperties)
    : undefined
  return (
    <div
      className={`card ${isFolder ? 'folder-card' : ''} ${isMenuOpen ? 'menu-open' : ''} ${isDragging ? 'dragging' : ''} ${isDropTarget ? 'drop-target' : ''} ${isRemoving ? 'removing' : ''}`}
      style={cardStyle}
      data-item-id={item.id}
      onClick={() => { if (!isRenaming) onOpen() }}
      onDoubleClick={(e) => { e.stopPropagation(); onRequestRename() }}
      onPointerDown={onPointerDown}
    >
      <div className={`thumb ${isFolder ? 'folder' : ''}`}>
        {isFolder ? <FolderSheets index={index} folder={item as Folder} /> : <CanvasThumb canvas={item as CanvasMeta} />}
      </div>
      <div className="card-body">
        <div className="card-text">
          <div className="card-name">
            {isRenaming ? (
              <RenameInput initial={item.name} onCommit={onCommitRename} onCancel={onCancelRename} />
            ) : (
              <span title={item.name}>{item.name}</span>
            )}
          </div>
          <div className="card-meta">
            {showLocation
              ? locationLabel(index, item)
              : isFolder
                ? folderChildLabel(index, item as Folder)
                : modifiedLabel(item.modifiedAt)}
          </div>
        </div>

        <div className="card-actions">
          <button
            className={`kebab ${isMenuOpen ? 'open' : ''}`}
            onClick={(e) => { e.stopPropagation(); onToggleMenu() }}
            aria-label="More actions"
          >
            <DotsIcon />
          </button>

          {isMenuOpen && (
            <div className="menu" onClick={(e) => e.stopPropagation()}>
              <button onClick={onRequestRename}>Rename</button>
              {item.kind === 'canvas' && <button onClick={onDuplicate}>Duplicate</button>}
              {isFolder && (
                <>
                  <div className="sep" />
                  <div className="menu-colors-label">Color</div>
                  <div className="menu-colors" role="group" aria-label="Folder color">
                    {FOLDER_COLORS.map((c) => {
                      const active = ((item as Folder).color ?? 'manila') === c.key
                      return (
                        <button
                          key={c.key}
                          type="button"
                          className={`swatch ${active ? 'active' : ''}`}
                          style={{ background: c.value }}
                          title={c.label}
                          aria-label={c.label}
                          aria-pressed={active}
                          onClick={() => onSetColor(c.key === 'manila' ? null : c.key)}
                        />
                      )
                    })}
                  </div>
                </>
              )}
              <div className="sep" />
              <button className="danger" onClick={onDelete}>Delete</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string
  onCommit: (name: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement | null>(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); onCommit(value) }
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }}
      onBlur={() => onCommit(value)}
    />
  )
}

function CanvasThumb({ canvas }: { canvas: CanvasMeta }) {
  // Track which thumbnail_path the resolved URL belongs to so navigating to
  // a canvas without a thumbnail doesn't show a stale image from a previous one.
  const [resolved, setResolved] = useState<{ path: string; url: string | null }>(
    { path: '', url: null },
  )
  const path = canvas.thumbnailPath ?? ''
  useEffect(() => {
    if (!path) return
    let cancelled = false
    void getThumbnailUrl(canvas).then((url) => {
      if (!cancelled) setResolved({ path, url })
    })
    return () => { cancelled = true }
  }, [canvas, path])

  const url = resolved.path === path ? resolved.url : null
  if (url) return <img src={url} alt="" />
  return <span className="empty">empty page</span>
}

function FolderSheets({ index, folder }: { index: CanvasIndex; folder: Folder }) {
  const count = listChildren(index, folder.id).length
  if (count === 0) return <span className="empty">empty folder</span>
  // A few wide page-edges tucked behind the folder's front, peeking near the top.
  const layout: Record<number, string[]> = {
    1: ['p3'],
    2: ['p2', 'p3'],
    3: ['p1', 'p2', 'p3'],
  }
  return (
    <div className="folder-inside" aria-hidden="true">
      {layout[Math.min(count, 3)].map((c) => (
        <span key={c} className={`page ${c}`} />
      ))}
      <div className="folder-front" />
    </div>
  )
}

function EmptyState({ searching, onNewCanvas }: { searching: boolean; onNewCanvas: () => void }) {
  if (searching) {
    return (
      <div className="empty-state">
        <h3>Nothing matched.</h3>
        <p>Try a different search.</p>
      </div>
    )
  }
  return (
    <div className="empty-state">
      <h3>An <span className="it">empty</span> sheet.</h3>
      <p>Start a canvas — name it whatever you like later.</p>
      <button className="btn" onClick={onNewCanvas} style={{ margin: '0 auto' }}>
        <PlusIcon /> New canvas
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers + icons
// ---------------------------------------------------------------------------

function modifiedLabel(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  return new Date(ts).toLocaleDateString()
}

function folderChildLabel(index: CanvasIndex, folder: Folder): string {
  const kids = listChildren(index, folder.id)
  if (kids.length === 0) return 'empty folder'
  const c = kids.filter((k) => k.kind === 'canvas').length
  const f = kids.filter((k) => k.kind === 'folder').length
  const parts = []
  if (c) parts.push(`${c} canvas${c === 1 ? '' : 'es'}`)
  if (f) parts.push(`${f} folder${f === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

function locationLabel(index: CanvasIndex, item: Item): string {
  const path = folderPath(index, item.parent)
  if (path.length === 0) return 'in All canvases'
  return 'in ' + path.map((p) => p.name).join(' / ')
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M 8 3 L 8 13 M 3 8 L 13 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
function FolderPlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <path d="M 2 6 L 2 16 Q 2 17 3 17 L 17 17 Q 18 17 18 16 L 18 8 Q 18 7 17 7 L 9 7 L 7 5 L 3 5 Q 2 5 2 6 Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M 13 11 L 13 15 M 11 13 L 15 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
function MiniFolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <path d="M 2 6 L 2 16 Q 2 17 3 17 L 17 17 Q 18 17 18 16 L 18 8 Q 18 7 17 7 L 9 7 L 7 5 L 3 5 Q 2 5 2 6 Z" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}
function MiniPageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <path d="M 5 2.5 L 12 2.5 L 15.5 6 L 15.5 17.5 L 5 17.5 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M 12 2.5 L 12 6 L 15.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}
function UploadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
      <path d="M 10 13 L 10 3 M 6 7 L 10 3 L 14 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 4 13 L 4 16 Q 4 17 5 17 L 15 17 Q 16 17 16 16 L 16 13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}
function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ color: 'var(--pencil)' }}>
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M 13.5 13.5 L 17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
function DotsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="3" cy="8" r="1.4" />
      <circle cx="8" cy="8" r="1.4" />
      <circle cx="13" cy="8" r="1.4" />
    </svg>
  )
}
function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M 3 5 L 17 5 M 3 10 L 17 10 M 3 15 L 17 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <path d="M 5 5 L 15 15 M 15 5 L 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
function ProfileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="7" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M 3.5 17 Q 3.5 12 10 12 Q 16.5 12 16.5 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M 10 2.5 L 10 5 M 10 15 L 10 17.5 M 2.5 10 L 5 10 M 15 10 L 17.5 10 M 4.7 4.7 L 6.5 6.5 M 13.5 13.5 L 15.3 15.3 M 4.7 15.3 L 6.5 13.5 M 13.5 6.5 L 15.3 4.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
function PaymentsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <rect x="2.5" y="5" width="15" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M 2.5 8.5 L 17.5 8.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M 5 12.5 L 8 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
function HelpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M 7.8 7.8 Q 8 5.5 10 5.5 Q 12 5.5 12 7.5 Q 12 9 10 10 L 10 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <circle cx="10" cy="14" r="0.9" fill="currentColor" />
    </svg>
  )
}
function SignOutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M 11 3 L 4 3 Q 3 3 3 4 L 3 16 Q 3 17 4 17 L 11 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M 8 10 L 17 10 M 14 7 L 17 10 L 14 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
