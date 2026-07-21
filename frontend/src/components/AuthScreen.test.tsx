// Regression: ISSUE-001 — a password typed in one auth mode (e.g. the new
// password on the reset screen) stayed in the shared state and pre-filled the
// sign-in password field after "Back to sign in".
// Found by /qa on 2026-07-21
// Report: .gstack/qa-reports/qa-report-localhost-2026-07-21.md
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('../lib/native', () => ({ hapticTap: () => Promise.resolve(), isNative: false }))
vi.mock('@capacitor/keyboard', () => ({ Keyboard: { addListener: vi.fn() } }))
vi.mock('../lib/auth', () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signInAsGuest: vi.fn(),
  resetPassword: vi.fn().mockResolvedValue(null),
  verifyEmailOtp: vi.fn(),
  verifyRecoveryOtp: vi.fn(),
  updatePassword: vi.fn(),
  resendSignupOtp: vi.fn(),
}))

import { AuthScreen } from './AuthScreen'

describe('AuthScreen mode switching', () => {
  it('does not carry a typed password from the reset flow back into sign-in', async () => {
    render(<AuthScreen />)

    // Sign-in → reset: enter an email, request the code.
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'someone@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset code' }))

    // Reset-verify: type a candidate new password, then bail back to sign-in.
    const newPassword = await screen.findByLabelText('New password')
    fireEvent.change(newPassword, { target: { value: 'my-new-secret' } })
    fireEvent.change(screen.getByLabelText('Reset code'), { target: { value: '12345678' } })
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }))

    // The sign-in password and any code state must be clean.
    expect(screen.getByLabelText('Password')).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send reset code' }))
    expect(await screen.findByLabelText('Reset code')).toHaveValue('')
  })

  it('clears a half-typed sign-in password when switching to create account', () => {
    render(<AuthScreen />)
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'oops-partial' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }))
    expect(screen.getByLabelText('Password')).toHaveValue('')
  })
})
