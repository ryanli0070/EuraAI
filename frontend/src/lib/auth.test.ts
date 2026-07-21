import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

const signOut = vi.fn()
vi.mock('./supabase', () => ({
  supabase: { auth: { signOut: (...args: unknown[]) => signOut(...args) } },
}))

const apiFetch = vi.fn()
vi.mock('./api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}))

import { deleteAccount, isGuest } from './auth'

describe('isGuest', () => {
  it('is true only for anonymous (guest) sessions', () => {
    expect(isGuest({ is_anonymous: true } as User)).toBe(true)
    expect(isGuest({ is_anonymous: false } as User)).toBe(false)
    expect(isGuest({} as User)).toBe(false)
    expect(isGuest(null)).toBe(false)
  })
})

describe('deleteAccount', () => {
  beforeEach(() => {
    signOut.mockReset()
    apiFetch.mockReset()
  })

  it('returns a connection error without signing out when the request fails', async () => {
    apiFetch.mockRejectedValue(new TypeError('Failed to fetch'))
    const err = await deleteAccount()
    expect(err).toMatch(/connection/i)
    expect(signOut).not.toHaveBeenCalled()
  })

  it('surfaces the backend detail message on a non-OK response', async () => {
    apiFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ detail: 'Account deletion is temporarily unavailable.' }),
    })
    const err = await deleteAccount()
    expect(err).toBe('Account deletion is temporarily unavailable.')
    expect(signOut).not.toHaveBeenCalled()
  })

  it('signs out locally and returns null on success', async () => {
    apiFetch.mockResolvedValue({ ok: true })
    const err = await deleteAccount()
    expect(err).toBeNull()
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
