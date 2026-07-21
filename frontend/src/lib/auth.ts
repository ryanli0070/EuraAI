/**
 * Auth helpers around `supabase.auth`. Centralizes the session subscription
 * so components can call `useSession()` instead of wiring up listeners
 * themselves, and normalizes the SDK's error shape into plain strings for UI.
 */
import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { apiFetch } from './api'

export type AuthState = {
  session: Session | null
  user: User | null
  loading: boolean
}

export function useSession(): AuthState {
  const [state, setState] = useState<AuthState>({ session: null, user: null, loading: true })

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setState({ session: data.session, user: data.session?.user ?? null, loading: false })
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      setState({ session, user: session?.user ?? null, loading: false })
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return state
}

export async function signIn(email: string, password: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error?.message ?? null
}

export async function signUp(email: string, password: string): Promise<string | null> {
  const { error } = await supabase.auth.signUp({ email, password })
  return error?.message ?? null
}

/**
 * Confirm a new account with the 6-digit code Supabase emailed, instead of a
 * confirmation link. On success the SDK stores the session and `useSession()`
 * flips to logged-in, so the caller just unmounts. Returns an error message on
 * failure, or null on success.
 */
export async function verifyEmailOtp(email: string, token: string): Promise<string | null> {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' })
  return error?.message ?? null
}

/** Re-send the signup confirmation code to the given email. */
export async function resendSignupOtp(email: string): Promise<string | null> {
  const { error } = await supabase.auth.resend({ type: 'signup', email })
  return error?.message ?? null
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

/**
 * Start a guest session (Supabase anonymous sign-in), so the app's core
 * features work without registering (App Store guideline 5.1.1(v)). The guest
 * gets a real authenticated session — same RLS and backend JWT path as a full
 * account — with `is_anonymous` set on the user. Returns an error message on
 * failure, or null on success.
 */
export async function signInAsGuest(): Promise<string | null> {
  const { error } = await supabase.auth.signInAnonymously()
  return error?.message ?? null
}

/** Whether the current user is a guest (anonymous) session. */
export function isGuest(user: User | null): boolean {
  return user?.is_anonymous === true
}

/**
 * Step 1 of upgrading a guest to a full account: attach an email + password to
 * the current anonymous user. The password takes effect immediately; the email
 * must be confirmed with the 8-digit code Supabase sends to it. The guest's
 * canvases, folders, and chats all stay — it's the same user id throughout.
 */
export async function beginGuestUpgrade(email: string, password: string): Promise<string | null> {
  const { error } = await supabase.auth.updateUser({ email, password })
  return error?.message ?? null
}

/**
 * Step 2: confirm the emailed code. On success the session refreshes with
 * `is_anonymous` cleared, so `useSession()` re-renders as a full account.
 */
export async function verifyGuestUpgradeOtp(email: string, token: string): Promise<string | null> {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email_change' })
  return error?.message ?? null
}

/** Re-send the guest-upgrade confirmation code to the given email. */
export async function resendGuestUpgradeOtp(email: string): Promise<string | null> {
  const { error } = await supabase.auth.resend({ type: 'email_change', email })
  return error?.message ?? null
}

export async function resetPassword(email: string): Promise<string | null> {
  const { error } = await supabase.auth.resetPasswordForEmail(email)
  return error?.message ?? null
}

/**
 * Permanently delete the current user's account and all their data, then sign
 * out locally. The backend (service-role) removes the auth user — cascading
 * every DB row — plus their Storage files. Required by App Store guideline
 * 5.1.1(v). Returns an error message on failure, or null on success.
 */
export async function deleteAccount(): Promise<string | null> {
  let res: Response
  try {
    res = await apiFetch('/api/account', { method: 'DELETE' })
  } catch {
    return 'Could not reach the server. Check your connection and try again.'
  }
  if (!res.ok) {
    let detail = 'Could not delete your account. Please try again.'
    try {
      const body = await res.json()
      if (body?.detail) detail = body.detail
    } catch {
      /* non-JSON error body */
    }
    return detail
  }
  await supabase.auth.signOut()
  return null
}
