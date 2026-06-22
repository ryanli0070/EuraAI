import { useEffect, useState, type FormEvent } from 'react'
import { Keyboard } from '@capacitor/keyboard'
import { resendSignupOtp, resetPassword, signIn, signUp, verifyEmailOtp } from '../lib/auth'
import { hapticTap, isNative } from '../lib/native'

type Mode = 'signin' | 'signup' | 'reset' | 'verify'

const STYLES = `
.auth-screen{
  --paper:#f6f1e6;
  --ink:#18243f;
  --ink-soft:#3a4a69;
  --pencil:#6b7284;
  --rule:#d9cfb6;
  --red:#b4453d;
  --accent:#2d5ad9;
  --sans:'Fraunces','Iowan Old Style',Georgia,serif;
  --ui:'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
  background:var(--paper);
  color:var(--ink);
  min-height:100vh;
  font-family:var(--ui);
  display:flex;align-items:center;justify-content:center;padding:24px;
  position:relative;
}
.auth-screen::before{
  content:"";position:fixed;inset:0;pointer-events:none;z-index:0;
  background-image:
    radial-gradient(rgba(24,36,63,0.035) 1px, transparent 1.2px),
    radial-gradient(rgba(24,36,63,0.02) 1px, transparent 1.2px);
  background-size:3px 3px,7px 7px;
  background-position:0 0,1px 2px;
  mix-blend-mode:multiply;
}
.auth-screen .card{
  position:relative;z-index:1;
  width:100%;max-width:380px;
  background:#fdfaf2;border:1.5px solid var(--ink);border-radius:12px;
  padding:32px 28px;
  box-shadow:4px 6px 0 rgba(24,36,63,0.08);
}
.auth-screen h1{
  font-family:var(--sans);font-weight:500;font-size:28px;letter-spacing:-0.01em;
  margin:0 0 6px;color:var(--ink);
}
.auth-screen .sub{
  font-size:14px;color:var(--ink-soft);margin:0 0 22px;
}
.auth-screen form{display:flex;flex-direction:column;gap:12px}
.auth-screen label{
  display:flex;flex-direction:column;gap:6px;
  font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:var(--pencil);
}
.auth-screen input{
  border:1.5px solid var(--ink);border-radius:8px;background:#fff;
  padding:10px 12px;font:inherit;color:var(--ink);outline:none;
  font-size:14px;letter-spacing:normal;text-transform:none;
}
.auth-screen input:focus{box-shadow:0 0 0 3px rgba(45,90,217,0.18)}
.auth-screen .submit{
  margin-top:6px;
  display:inline-flex;align-items:center;justify-content:center;gap:8px;
  cursor:pointer;font-family:var(--ui);font-weight:600;font-size:14px;
  padding:11px 16px;border-radius:999px;border:1.5px solid var(--ink);
  background:var(--ink);color:var(--paper);
  transition:transform .15s ease, opacity .2s ease;
}
.auth-screen .submit:hover:not(:disabled){transform:translateY(-1px)}
.auth-screen .submit:disabled{opacity:0.6;cursor:not-allowed}
.auth-screen .error{
  background:rgba(180,69,61,0.08);color:var(--red);
  border:1px solid rgba(180,69,61,0.3);border-radius:8px;
  padding:8px 12px;font-size:13px;
}
.auth-screen .notice{
  background:rgba(45,90,217,0.06);color:var(--accent);
  border:1px solid rgba(45,90,217,0.25);border-radius:8px;
  padding:8px 12px;font-size:13px;
}
.auth-screen .links{
  margin-top:18px;display:flex;justify-content:space-between;font-size:13px;
}
.auth-screen .links button{
  background:none;border:none;cursor:pointer;color:var(--accent);
  font:inherit;padding:0;text-decoration:underline;
}
.auth-screen .brand{
  text-align:center;margin-bottom:24px;
  font-family:var(--sans);font-weight:500;font-size:22px;letter-spacing:-0.01em;
}
.auth-screen .auth-agree{
  margin:16px 0 0;font-size:12px;line-height:1.5;color:var(--pencil);text-align:center;
}
.auth-screen .auth-agree a{color:var(--accent);text-decoration:underline}
`

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [kbInset, setKbInset] = useState(0)

  // iOS: the soft keyboard overlays the WebView (global Keyboard.resize is
  // 'none', to keep it off the whiteboard canvas). So here we listen for the
  // keyboard and shrink the centering area to the space above it, lifting the
  // email/password card into view instead of leaving it hidden behind it.
  // No-op on web — `isNative` is false there.
  useEffect(() => {
    if (!isNative) return
    const show = Keyboard.addListener('keyboardWillShow', (info) =>
      setKbInset(info.keyboardHeight),
    )
    const hide = Keyboard.addListener('keyboardWillHide', () => setKbInset(0))
    return () => {
      void show.then((h) => h.remove())
      void hide.then((h) => h.remove())
    }
  }, [])

  const reset = () => {
    setError(null)
    setNotice(null)
  }

  const switchMode = (next: Mode) => {
    reset()
    setMode(next)
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting) return
    void hapticTap()
    reset()
    setSubmitting(true)
    try {
      if (mode === 'signin') {
        const err = await signIn(email.trim(), password)
        if (err) setError(err)
        // success: useSession will update; component unmounts.
      } else if (mode === 'signup') {
        const err = await signUp(email.trim(), password)
        if (err) setError(err)
        else {
          setMode('verify')
          setNotice('We emailed you an 8-digit code. Enter it below to finish.')
        }
      } else if (mode === 'verify') {
        const err = await verifyEmailOtp(email.trim(), code.trim())
        if (err) setError(err)
        // success: useSession will update; component unmounts.
      } else {
        const err = await resetPassword(email.trim())
        if (err) setError(err)
        else setNotice("If that email is registered, we've sent a reset link.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  const onResend = async () => {
    if (submitting) return
    void hapticTap()
    reset()
    setSubmitting(true)
    try {
      const err = await resendSignupOtp(email.trim())
      if (err) setError(err)
      else setNotice('Sent a new code — check your email.')
    } finally {
      setSubmitting(false)
    }
  }

  const title =
    mode === 'signin' ? 'Sign in'
    : mode === 'signup' ? 'Create account'
    : mode === 'verify' ? 'Check your email'
    : 'Reset password'
  const submitLabel =
    mode === 'signin' ? (submitting ? 'Signing in…' : 'Sign in')
    : mode === 'signup' ? (submitting ? 'Creating…' : 'Create account')
    : mode === 'verify' ? (submitting ? 'Verifying…' : 'Verify')
    : (submitting ? 'Sending…' : 'Send reset email')

  return (
    <div
      className="auth-screen"
      style={
        kbInset
          ? { minHeight: 0, height: `calc(100vh - ${kbInset}px)`, overflowY: 'auto' }
          : undefined
      }
    >
      <style>{STYLES}</style>
      <div className="card">
        <div className="brand">Eura</div>
        <h1>{title}</h1>
        <p className="sub">
          {mode === 'signin' && 'Welcome back.'}
          {mode === 'signup' && 'A canvas, a calculator, and a tutor.'}
          {mode === 'verify' && `Enter the 8-digit code we sent to ${email}.`}
          {mode === 'reset' && "We'll email you a link to set a new password."}
        </p>

        {error && <div className="error" role="alert">{error}</div>}
        {notice && <div className="notice">{notice}</div>}

        <form onSubmit={onSubmit}>
          {mode !== 'verify' && (
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          {mode !== 'reset' && mode !== 'verify' && (
            <label>
              Password
              <input
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          {mode === 'verify' && (
            <label>
              Confirmation code
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={8}
                required
                placeholder="12345678"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </label>
          )}
          <button className="submit" type="submit" disabled={submitting}>
            {submitLabel}
          </button>
        </form>

        {mode === 'signup' && (
          <p className="auth-agree">
            By creating an account, you confirm you're 13 or older and agree to our{' '}
            <a href="https://euralearn.com/terms" target="_blank" rel="noopener noreferrer">Terms</a>
            {' '}and{' '}
            <a href="https://euralearn.com/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
          </p>
        )}

        <div className="links">
          {mode === 'signin' ? (
            <>
              <button type="button" onClick={() => switchMode('signup')}>Create an account</button>
              <button type="button" onClick={() => switchMode('reset')}>Forgot password?</button>
            </>
          ) : mode === 'verify' ? (
            <>
              <button type="button" onClick={onResend} disabled={submitting}>Resend code</button>
              <button type="button" onClick={() => switchMode('signin')}>Back to sign in</button>
            </>
          ) : (
            <button type="button" onClick={() => switchMode('signin')}>Back to sign in</button>
          )}
        </div>
      </div>
    </div>
  )
}
