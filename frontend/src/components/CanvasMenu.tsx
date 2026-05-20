import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
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
  listChildren,
  loadIndex,
  moveItem,
  renameItem,
  reorderItems,
  searchAll,
  subscribe,
} from '../lib/canvasStore'

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
.canvas-menu header.bar .brand .menu-toggle:hover{background:var(--paper-2);border-color:var(--rule)}

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
.canvas-menu .sidebar-close:hover{background:var(--paper-2);color:var(--ink)}
.canvas-menu .sidebar-nav{display:flex;flex-direction:column;padding:12px 10px;gap:2px}
.canvas-menu .sidebar-item{
  display:flex;align-items:center;gap:12px;
  padding:11px 14px;border-radius:10px;cursor:pointer;
  background:transparent;border:none;color:var(--ink);
  font-family:var(--ui);font-size:14px;font-weight:500;text-align:left;
  transition:background .15s ease;
}
.canvas-menu .sidebar-item:hover{background:var(--paper-2)}
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
  transition:transform .15s ease, background .2s ease;
}
.canvas-menu .btn:hover{transform:translateY(-1px)}
.canvas-menu .btn.ghost{background:transparent;color:var(--ink)}
.canvas-menu .btn.ghost:hover{background:var(--ink);color:var(--paper)}

.canvas-menu .breadcrumbs{
  display:flex;align-items:center;gap:6px;
  padding:24px 0 4px;font-size:14px;color:var(--ink-soft);
}
.canvas-menu .breadcrumbs button{
  background:none;border:none;cursor:pointer;color:inherit;font:inherit;
  padding:4px 8px;border-radius:4px;
}
.canvas-menu .breadcrumbs button:hover{background:rgba(24,36,63,0.06);color:var(--ink)}
.canvas-menu .breadcrumbs .sep{color:var(--pencil)}
.canvas-menu .breadcrumbs .current{color:var(--ink);font-weight:500;padding:4px 8px}

.canvas-menu .grid{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(220px,1fr));
  gap:18px;
  padding:18px 0 80px;
}

.canvas-menu .card{
  position:relative;background:#fdfaf2;border:1.5px solid var(--ink);border-radius:8px;
  overflow:hidden;cursor:pointer;
  display:flex;flex-direction:column;
  transition:transform .15s ease, box-shadow .15s ease;
  box-shadow:3px 4px 0 rgba(24,36,63,0.06);
}
.canvas-menu .card:hover{transform:translate(-1px,-2px);box-shadow:5px 7px 0 rgba(24,36,63,0.08)}
.canvas-menu .card.dragging{opacity:0.4}
.canvas-menu .card.drop-target{outline:2px dashed var(--accent);outline-offset:-4px}

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
.canvas-menu .thumb.folder{
  background:#f1ead4;
}
.canvas-menu .thumb.folder svg{width:64px;height:64px}

.canvas-menu .card-body{
  padding:12px 14px;
  display:flex;flex-direction:column;gap:4px;
}
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
  position:absolute;top:8px;right:8px;
  display:none;
  width:28px;height:28px;border-radius:50%;
  background:rgba(255,255,255,0.95);border:1px solid var(--rule);
  align-items:center;justify-content:center;cursor:pointer;
  color:var(--ink-soft);
}
.canvas-menu .card:hover .kebab,
.canvas-menu .kebab.open{display:flex}
.canvas-menu .kebab:hover{color:var(--ink);background:#fff}

.canvas-menu .menu{
  position:absolute;top:42px;right:8px;z-index:5;
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
.canvas-menu .menu button:hover{background:rgba(24,36,63,0.06)}
.canvas-menu .menu button.danger{color:var(--red)}
.canvas-menu .menu button.danger:hover{background:rgba(180,69,61,0.08)}
.canvas-menu .menu .sep{height:1px;background:var(--rule)}

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

export function CanvasMenu({ onOpenCanvas }: CanvasMenuProps) {
  const [version, setVersion] = useState(0)
  const [parent, setParent] = useState<FolderId | null>(null)
  const [search, setSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<ItemId | null>(null)
  const [renamingId, setRenamingId] = useState<ItemId | null>(null)
  const [draggingId, setDraggingId] = useState<ItemId | null>(null)
  const [dropTargetId, setDropTargetId] = useState<ItemId | null>(null)
  const [rootDropActive, setRootDropActive] = useState(false)

  // Re-render whenever the store changes from anywhere.
  useEffect(() => subscribe(() => setVersion((v) => v + 1)), [])

  // Reset transient UI state when navigating between folders.
  useEffect(() => {
    setOpenMenuId(null)
    setRenamingId(null)
    setDraggingId(null)
    setDropTargetId(null)
  }, [parent])

  // If the current parent folder gets deleted, fall back to root so we don't
  // render an empty view forever. Re-checked on every store update.
  useEffect(() => {
    if (parent == null) return
    const idx = loadIndex()
    if (!idx.folders.some((f) => f.id === parent)) setParent(null)
  }, [parent, version])

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
    return search.trim() ? searchAll(search) : listChildren(parent)
    // version included so this recomputes after any store mutation.
  }, [parent, search, version])

  const path = useMemo(() => folderPath(parent), [parent, version])

  const handleNewCanvas = useCallback(() => {
    const meta = createCanvas(parent)
    onOpenCanvas(meta.id)
  }, [parent, onOpenCanvas])

  const handleNewFolder = useCallback(() => {
    const f = createFolder(parent)
    setRenamingId(f.id)
  }, [parent])

  const handleOpen = useCallback((item: Item) => {
    if (item.kind === 'folder') {
      setParent(item.id)
      setSearch('')
    } else {
      onOpenCanvas(item.id)
    }
  }, [onOpenCanvas])

  // ---- drag-and-drop ----
  const onDragStart = (id: ItemId) => (e: React.DragEvent) => {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }
  const onDragEnd = () => {
    setDraggingId(null)
    setDropTargetId(null)
    setRootDropActive(false)
  }
  const onDragOverItem = (item: Item) => (e: React.DragEvent) => {
    if (!draggingId || draggingId === item.id) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTargetId(item.id)
  }
  const onDragLeaveItem = () => setDropTargetId(null)
  const onDropItem = (item: Item) => (e: React.DragEvent) => {
    e.preventDefault()
    if (!draggingId || draggingId === item.id) return
    if (item.kind === 'folder') {
      // Drop onto a folder = move into it.
      moveItem(draggingId, item.id)
    } else {
      // Drop onto a canvas = reorder within current parent (insert before).
      const currentChildren = listChildren(parent).map((x) => x.id)
      const fromIdx = currentChildren.indexOf(draggingId)
      const toIdx = currentChildren.indexOf(item.id)
      if (fromIdx === -1 || toIdx === -1) return
      const reordered = [...currentChildren]
      reordered.splice(fromIdx, 1)
      reordered.splice(toIdx, 0, draggingId)
      reorderItems(parent, reordered)
    }
    onDragEnd()
  }
  const onDragOverRoot = (e: React.DragEvent) => {
    if (!draggingId) return
    e.preventDefault()
    setRootDropActive(true)
  }
  const onDropToRoot = (e: React.DragEvent) => {
    e.preventDefault()
    if (!draggingId) return
    moveItem(draggingId, null)
    onDragEnd()
  }

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
          <button className="btn ghost" onClick={handleNewFolder}>
            <FolderPlusIcon /> New folder
          </button>
          <button className="btn" onClick={handleNewCanvas}>
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

        {items.length === 0 ? (
          <EmptyState searching={!!search.trim()} onNewCanvas={handleNewCanvas} />
        ) : (
          <div className="grid">
            {items.map((item) => (
              <Card
                key={item.id}
                item={item}
                isDragging={draggingId === item.id}
                isDropTarget={dropTargetId === item.id && draggingId !== item.id}
                isRenaming={renamingId === item.id}
                isMenuOpen={openMenuId === item.id}
                showLocation={!!search}
                onOpen={() => handleOpen(item)}
                onRequestRename={() => setRenamingId(item.id)}
                onCommitRename={(name) => { renameItem(item.id, name); setRenamingId(null) }}
                onCancelRename={() => setRenamingId(null)}
                onToggleMenu={() => setOpenMenuId((cur) => cur === item.id ? null : item.id)}
                onDelete={() => {
                  const label = item.kind === 'folder' ? `the folder "${item.name}" and everything inside it` : `"${item.name}"`
                  if (confirm(`Delete ${label}? This can't be undone.`)) {
                    deleteItem(item.id)
                    setOpenMenuId(null)
                  }
                }}
                onDuplicate={() => {
                  if (item.kind !== 'canvas') return
                  duplicateCanvas(item.id)
                  setOpenMenuId(null)
                }}
                onDragStart={onDragStart(item.id)}
                onDragEnd={onDragEnd}
                onDragOver={onDragOverItem(item)}
                onDragLeave={onDragLeaveItem}
                onDrop={onDropItem(item)}
              />
            ))}
          </div>
        )}

        {!search && parent != null && (
          <div
            className={`root-drop ${rootDropActive ? 'active' : ''}`}
            onDragOver={onDragOverRoot}
            onDragLeave={() => setRootDropActive(false)}
            onDrop={onDropToRoot}
          >
            ↑ drag here to move to All canvases
          </div>
        )}
      </main>

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </div>
  )
}

const SIDEBAR_ITEMS = [
  { label: 'Profile', icon: ProfileIcon },
  { label: 'Settings', icon: SettingsIcon },
  { label: 'Payments', icon: PaymentsIcon },
  { label: 'Help & Support', icon: HelpIcon },
  { label: 'Sign Out', icon: SignOutIcon },
]

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

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
          {SIDEBAR_ITEMS.map((item) => (
            <button key={item.label} type="button" className="sidebar-item">
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
  isDragging: boolean
  isDropTarget: boolean
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
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
}

function Card({
  item,
  isDragging,
  isDropTarget,
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
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: CardProps) {
  const isFolder = item.kind === 'folder'
  return (
    <div
      className={`card ${isDragging ? 'dragging' : ''} ${isDropTarget ? 'drop-target' : ''}`}
      draggable={!isRenaming}
      onClick={() => { if (!isRenaming) onOpen() }}
      onDoubleClick={(e) => { e.stopPropagation(); onRequestRename() }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className={`thumb ${isFolder ? 'folder' : ''}`}>
        {isFolder ? <FolderArt /> : <CanvasThumb canvas={item as CanvasMeta} />}
      </div>
      <div className="card-body">
        <div className="card-name">
          {isRenaming ? (
            <RenameInput initial={item.name} onCommit={onCommitRename} onCancel={onCancelRename} />
          ) : (
            <span title={item.name}>{item.name}</span>
          )}
        </div>
        <div className="card-meta">
          {showLocation
            ? locationLabel(item)
            : isFolder
              ? folderChildLabel(item as Folder)
              : modifiedLabel(item.modifiedAt)}
        </div>
      </div>

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
          <div className="sep" />
          <button className="danger" onClick={onDelete}>Delete</button>
        </div>
      )}
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
  if (canvas.thumbnail) {
    return <img src={canvas.thumbnail} alt="" />
  }
  return <span className="empty">empty page</span>
}

function FolderArt() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <path
        d="M 6 18 L 6 52 Q 6 56 10 56 L 54 56 Q 58 56 58 52 L 58 22 Q 58 18 54 18 L 30 18 L 24 12 L 10 12 Q 6 12 6 18 Z"
        stroke="#18243f"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="#fdfaf2"
      />
      <path d="M 14 30 L 50 30" stroke="#d9cfb6" strokeWidth="1.5" strokeDasharray="3 4" />
    </svg>
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

function folderChildLabel(folder: Folder): string {
  const kids = listChildren(folder.id)
  if (kids.length === 0) return 'empty folder'
  const c = kids.filter((k) => k.kind === 'canvas').length
  const f = kids.filter((k) => k.kind === 'folder').length
  const parts = []
  if (c) parts.push(`${c} canvas${c === 1 ? '' : 'es'}`)
  if (f) parts.push(`${f} folder${f === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

function locationLabel(item: Item): string {
  const path = folderPath(item.parent)
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
