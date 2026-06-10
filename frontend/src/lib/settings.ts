/**
 * Local, device-scoped UI settings.
 *
 * A tiny localStorage-backed store for preferences that don't yet sync to the
 * backend (account-wide sync is coming). Components read the current value,
 * write updates, and subscribe to changes — so flipping a toggle in Settings
 * updates the live whiteboard without a reload.
 */

const GRID_KEY = 'euraai.settings.showGrid'
const SCROLL_VERTICAL_KEY = 'euraai.settings.scrollVertical'

type Listener = () => void
const listeners = new Set<Listener>()

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
}

/** Whether faint grid lines are shown behind the work. Defaults on. */
export function getShowGrid(): boolean {
  return readBool(GRID_KEY, true)
}

export function setShowGrid(value: boolean): void {
  try {
    localStorage.setItem(GRID_KEY, value ? '1' : '0')
  } catch {
    // Ignore quota / availability errors — the setting just won't persist.
  }
  for (const l of listeners) l()
}

/**
 * Whether paging scrolls vertically (swipe up/down between pages, pull up past
 * the last page to add one) instead of the default horizontal. Defaults off.
 */
export function getScrollVertical(): boolean {
  return readBool(SCROLL_VERTICAL_KEY, false)
}

export function setScrollVertical(value: boolean): void {
  try {
    localStorage.setItem(SCROLL_VERTICAL_KEY, value ? '1' : '0')
  } catch {
    // Ignore quota / availability errors — the setting just won't persist.
  }
  for (const l of listeners) l()
}

/** Subscribe to any settings change; returns an unsubscribe fn. */
export function subscribeSettings(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
