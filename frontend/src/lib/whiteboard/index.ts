/**
 * Public surface of the whiteboard engine — a dependency-light replacement
 * for tldraw. Import from here; the other modules are internal.
 */
export { Canvas } from './Canvas'
export { WhiteboardEngine } from './engine'
export { deleteDoc } from './persistence'
export type { EngineState, Stroke, ToolId, WhiteboardDoc } from './types'
