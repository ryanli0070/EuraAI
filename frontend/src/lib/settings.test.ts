import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAiConsent,
  getShowGrid,
  setAiConsent,
  setShowGrid,
  subscribeSettings,
} from './settings'

describe('settings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('AI consent is tri-state: null until asked, then remembers the answer', () => {
    // null means the consent dialog has never been shown — the gate every AI
    // feature checks before sending anything to OpenAI.
    expect(getAiConsent()).toBeNull()
    setAiConsent(true)
    expect(getAiConsent()).toBe(true)
    setAiConsent(false)
    expect(getAiConsent()).toBe(false)
  })

  it('grid lines default on and persist when toggled off', () => {
    expect(getShowGrid()).toBe(true)
    setShowGrid(false)
    expect(getShowGrid()).toBe(false)
  })

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeSettings(listener)
    setShowGrid(false)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    setShowGrid(true)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
