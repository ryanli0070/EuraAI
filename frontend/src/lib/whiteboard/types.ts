/**
 * Whiteboard data model.
 *
 * A document is just a flat list of freehand strokes — trivially
 * JSON-serializable, which is what makes persistence, history snapshots,
 * and PNG export straightforward. This is the entire on-disk schema;
 * bump `version` if it ever changes and migrate in persistence.ts.
 */

/** A single sampled pointer position. `p` is pen pressure, 0..1 (0.5 for mouse). */
export type Point = { x: number; y: number; p: number }

export type Stroke = {
  id: string
  /** Raw input points in page coordinates; perfect-freehand smooths these at render time. */
  points: Point[]
  /** CSS color string (hex). Stored directly so export/render need no lookup table. */
  color: string
  /** Base brush width fed to perfect-freehand's `size`. */
  size: number
  /** True when drawn with a real stylus — disables pressure simulation on render. */
  pen?: boolean
}

/**
 * A bitmap pinned behind a page — an imported PDF page or photo the user
 * annotates over. `path` is the Supabase Storage object key (the image bytes
 * live there, not in the doc); `w`/`h` are the image's natural pixel size, used
 * to fit it within the page while preserving aspect ratio. `page` is the
 * zero-based page index it sits on.
 */
export type PageBackground = {
  page: number
  path: string
  w: number
  h: number
}

export type WhiteboardDoc = {
  version: 1
  strokes: Stroke[]
  /**
   * Number of pages in the horizontal strip. Absent on older documents, which
   * are treated as a single page.
   */
  pageCount?: number
  /**
   * Imported page backgrounds (PDF pages / photos). Additive + optional, so
   * older docs simply have none and the schema version is unchanged.
   */
  backgrounds?: PageBackground[]
}

export const emptyDoc = (): WhiteboardDoc => ({ version: 1, strokes: [], pageCount: 1 })

export type ToolId = 'select' | 'draw' | 'eraser'

/** Page-space camera. screen = page * z + {x,y}. */
export type Camera = { x: number; y: number; z: number }

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number }

/** Options the engine exposes to React for rendering toolbar/quick-action state. */
export type EngineState = {
  tool: ToolId
  color: string
  canUndo: boolean
  canRedo: boolean
  isEmpty: boolean
  hasSelection: boolean
  /** 0 normally; 0..1 while pulling past the last page to create a new one. */
  pull: number
  /** Index of the page currently in view. */
  page: number
  /** Total number of pages in the document. */
  pageCount: number
  /** True when paging runs vertically (swipe up/down) instead of horizontally. */
  vertical: boolean
}
