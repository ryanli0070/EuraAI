/**
 * Undo/redo as a stack of whole-document snapshots.
 *
 * Strokes are small (a few KB even for a busy board), so full snapshots are
 * simpler and less bug-prone than a command/diff log — and they make redo
 * after branching trivial. The stack is capped so a long session can't grow
 * memory without bound.
 */
import type { WhiteboardDoc } from './types'

const MAX_ENTRIES = 60

const clone = (doc: WhiteboardDoc): WhiteboardDoc => structuredClone(doc)

export class History {
  private stack: WhiteboardDoc[]
  /** Index of the snapshot currently shown. */
  private index: number

  constructor(initial: WhiteboardDoc) {
    this.stack = [clone(initial)]
    this.index = 0
  }

  /** Record a new state, discarding any redo branch ahead of the cursor. */
  push(doc: WhiteboardDoc): void {
    this.stack = this.stack.slice(0, this.index + 1)
    this.stack.push(clone(doc))
    if (this.stack.length > MAX_ENTRIES) {
      this.stack.shift()
    }
    this.index = this.stack.length - 1
  }

  canUndo(): boolean {
    return this.index > 0
  }

  canRedo(): boolean {
    return this.index < this.stack.length - 1
  }

  /** Step back one state and return a fresh copy of it, or null if at the start. */
  undo(): WhiteboardDoc | null {
    if (!this.canUndo()) return null
    this.index--
    return clone(this.stack[this.index])
  }

  redo(): WhiteboardDoc | null {
    if (!this.canRedo()) return null
    this.index++
    return clone(this.stack[this.index])
  }
}
