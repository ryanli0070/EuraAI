/**
 * Auth helpers around `supabase.auth`. Centralizes the session subscription
 * so components can call `useSession()` instead of wiring up listeners
 * themselves, and normalizes the SDK's error shape into plain strings for UI.
 */
import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'

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

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

export async function resetPassword(email: string): Promise<string | null> {
  const { error } = await supabase.auth.resetPasswordForEmail(email)
  return error?.message ?? null
}
