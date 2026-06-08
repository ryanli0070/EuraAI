# Whiteboard Engine — Handoff

Replacing the `tldraw` dependency with an in-house canvas engine, keeping the
existing feature set. This branch (`internal-whiteboard`) contains **step 1
only**: the engine, built and type-checking, but **not yet wired into the app**.
`Whiteboard.tsx` still renders `<Tldraw>` and the app behaves exactly as before.

## What's done (this branch)

`frontend/src/lib/whiteboard/` — new, self-contained, ~900 lines:

| File | Role |
|---|---|
| `types.ts` | Document/stroke data model |
| `geometry.ts` | Freehand smoothing (`perfect-freehand`), outline→Path2D, bounds, hit-testing |
| `history.ts` | Undo/redo via capped whole-document snapshots |
| `persistence.ts` | IndexedDB load/save/delete, one record per canvas |
| `export.ts` | Strokes → PNG blob (replaces `editor.toImage()`) |
| `engine.ts` | `WhiteboardEngine`: camera, tools, input, render loop |
| `Canvas.tsx` | React wrapper, `onMount`-compatible with `<Tldraw>` |
| `index.ts` | Public exports |

Dependency change: **added `perfect-freehand`** (~4KB, the freehand library
tldraw itself uses). `tldraw` is still installed — remove it in step 4.

Feature coverage already implemented in the engine:
- Freehand draw with pressure/velocity taper
- Eraser, select (click + marquee), move, delete, duplicate
- Undo/redo + keyboard shortcuts (`Ctrl+Z`/`Y`/`D`, `Delete`/`Backspace`)
- Pan/zoom: wheel, `Ctrl`+wheel, two-finger pinch, single-finger drag, middle-mouse drag
- Per-canvas IndexedDB persistence (debounced, flushes on unmount)
- PNG export matching `editor.toImage()`'s `padding`/`scale`/`background` options

## What still needs to be done

### Step 2 — Verify PNG export quality (BLOCKED — see note below)

`export.ts` produces the PNG that the backend OCRs for `/api/check` and
`/api/help`. It must crop tightly to the work, sit on a clean white background,
and render strokes crisply. This could not be verified yet because **testing
the OCR round-trip requires an OpenAI API key, which the project owner does not
currently have.**

Until a key is available, verify export *visually* instead:
1. Do step 3 (wire the engine in).
2. Draw on the board, then temporarily dump the export blob to an image —
   e.g. in `captureCanvas()`, `window.open(URL.createObjectURL(blob))`.
3. Confirm: tight crop, white background, sharp dark strokes, ~32px padding.

When an API key is available, run the full Check Work flow and confirm hint
accuracy is no worse than with tldraw. If strokes OCR poorly, the likely knobs
are in `export.ts` (`scale`, `padding`, `background`) and `geometry.ts`
(`freehandOptions` — `thinning`/`size`).

### Step 3 — Wire the engine into `Whiteboard.tsx`

Replace `<Tldraw>` with `<Canvas>` from `./lib/whiteboard`. Map the existing
code onto the engine API:

| Current (tldraw) | Replacement |
|---|---|
| `<Tldraw persistenceKey onMount components overrides />` | `<Canvas canvasId onMount={(engine) => …} />` |
| `editorRef.current` (`Editor`) | `engineRef.current` (`WhiteboardEngine`) |
| `editor.getCurrentPageShapeIds().length` | `engine.isEmpty()` |
| `editor.deleteShapes(...)` in `_clearBoardRef` | `engine.clear()` |
| `editor.toImage(ids, {...})` in `captureCanvas`/`handleHome` | `engine.toImage({ padding, scale, background })` |
| `useCanUndo`/`useCanRedo` + `ClearAllQuickActions` | `engine.subscribe()` → read `engine.getState()` |
| `react('tool watcher', …)` | `engine.subscribe()` → `getState().tool` |
| `DefaultColorStyle` / `setStyleForNextShapes` | `engine.setColor(cssHex)` |
| `overrides.actions.delete` hijack | delete via `engine.clear()` / `deleteSelected()` directly |

Notable simplifications this unlocks (delete the old workarounds):
- `_clearBoardRef` module-level ref — no longer needed; call `engine.clear()`.
- `overrides` delete-action hijack — gone.
- `pointerdown` listener on `[data-testid="tools.draw"]` — gone; the color
  panel can open straight from a toolbar button's onClick.

The engine has **no built-in toolbar**. Step 3 must add a small React toolbar
(select / draw / eraser, plus undo / redo / clear / duplicate buttons)
that calls `engine.setTool(...)` etc. The existing color panel and check/help
menu stay as-is; the `COLORS` array already has `css` hex values — pass those
straight to `engine.setColor()`.

### Step 4 — Remove tldraw

- `npm uninstall tldraw` in `frontend/`.
- Delete `import 'tldraw/tldraw.css'` and all `tldraw` imports from
  `Whiteboard.tsx`.
- In `index.css`, remove the two tldraw-specific rules (comments at lines ~23
  and ~34 reference tldraw gesture/menu handling).

### Step 5 — Cleanup / loose ends

- **`canvasStore.ts`**: update the header comment and `duplicateCanvas` comment
  (lines ~7–9, ~320–321) that describe tldraw's IndexedDB contract. Wire
  `deleteCanvas` to also call `deleteDoc(canvasId)` from
  `lib/whiteboard/persistence.ts` so deleting a canvas drops its drawing.
- **`duplicateCanvas`**: it currently can't copy the drawing (tldraw's store was
  opaque). With the new engine the drawing *can* be copied — `loadDoc(srcId)`
  then `saveDoc(copyId, doc)`. Optional improvement.

## Known limitations / decisions

- **No migration of existing tldraw drawings.** The old tldraw IndexedDB store
  uses a different schema; existing drawings will appear blank under the new
  engine. New canvases are unaffected. If preserving old drawings matters,
  write a one-time importer (tldraw snapshot → `WhiteboardDoc`). For a
  pre-launch app this is probably fine to skip.
- **Scope is the core toolset** (draw / eraser / select) — per the
  decision to drop tldraw's arrows / text / geo shapes / notes / frames / laser.
- History uses full-document snapshots, capped at 60 entries. Fine for the
  expected board size (a few KB); revisit only if boards get very large.

## Verifying the engine compiles

```
cd frontend
npx tsc -b      # currently passes clean
```
