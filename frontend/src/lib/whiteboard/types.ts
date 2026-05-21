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

export type WhiteboardDoc = {
  version: 1
  strokes: Stroke[]
}

export const emptyDoc = (): WhiteboardDoc => ({ version: 1, strokes: [] })

export type ToolId = 'select' | 'draw' | 'eraser' | 'hand'

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
}
