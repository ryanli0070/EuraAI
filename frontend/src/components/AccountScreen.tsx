/**
 * Full-screen account surfaces launched from the sidebar (Profile, Settings,
 * Payments, Help & Support). They slide in over the canvas grid the same way
 * the whiteboard does, and share the paper-and-ink design system.
 *
 * These are presentation placeholders: real data is shown where it's free
 * (email, member-since), and anything that needs a backend is rendered with a
 * "Soon" affordance rather than a button that silently does nothing.
 */
import { useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ExternalLink,
  FileText,
  Heart,
  LifeBuoy,
  Mail,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { deleteAccount, useSession } from '../lib/auth'
import {
  getScrollVertical,
  getShowGrid,
  setScrollVertical,
  setShowGrid,
} from '../lib/settings'

export type AccountScreenId = 'profile' | 'settings' | 'payments' | 'help'

const TITLES: Record<AccountScreenId, string> = {
  profile: 'Profile',
  settings: 'Settings',
  payments: 'Payments',
  help: 'Help & Support',
}

export function AccountScreen({
  screen,
  onClose,
}: {
  screen: AccountScreenId | null
  onClose: () => void
}) {
  const { user } = useSession()

  useEffect(() => {
    if (!screen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [screen, onClose])

  // No open/close animation — the full-screen panel simply appears and goes.
  if (!screen) return null

  return (
    <div className="account-screen" role="dialog" aria-modal="true" aria-label={TITLES[screen]}>
      <style>{STYLES}</style>
      <header className="acct-bar">
        <button type="button" className="acct-back" onClick={onClose} aria-label="Back">
          <ChevronLeft size={20} />
        </button>
        <span className="acct-title">{TITLES[screen]}</span>
      </header>
      <div className="acct-body">
        <div className="acct-inner">
          {screen === 'profile' && <ProfileScreen user={user} />}
          {screen === 'settings' && <SettingsScreen />}
          {screen === 'payments' && <PaymentsScreen />}
          {screen === 'help' && <HelpScreen />}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

function ProfileScreen({ user }: { user: User | null }) {
  const email = user?.email ?? '—'
  const monogram = (user?.email?.[0] ?? '?').toUpperCase()
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
    : '—'

  return (
    <>
      <div className="profile-head">
        <div className="avatar">{monogram}</div>
        <div className="profile-id">
          <div className="profile-email" title={email}>{email}</div>
          <div className="profile-meta">Member since {memberSince}</div>
        </div>
      </div>

      <section className="acct-section">
        <div className="label">Your details</div>
        <div className="acct-card">
          <div className="field">
            <label htmlFor="pf-email">Email</label>
            <input id="pf-email" value={email} readOnly />
          </div>
        </div>
      </section>

      <section className="acct-section">
        <div className="label">Security</div>
        <div className="acct-card">
          <button type="button" className="acct-row as-button" disabled>
            <span className="row-main">
              <span className="row-label">Change password</span>
              <span className="row-sub">Update the password you sign in with</span>
            </span>
            <span className="soon">Soon</span>
          </button>
          <button type="button" className="acct-row as-button" disabled>
            <span className="row-main">
              <span className="row-label">Change email</span>
              <span className="row-sub">{email}</span>
            </span>
            <span className="soon">Soon</span>
          </button>
        </div>
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function SettingsScreen() {
  const [grid, setGrid] = useState(getShowGrid)
  const [verticalScroll, setVerticalScroll] = useState(getScrollVertical)

  const updateGrid = (value: boolean) => {
    setGrid(value)
    setShowGrid(value)
  }

  const updateVerticalScroll = (value: boolean) => {
    setVerticalScroll(value)
    setScrollVertical(value)
  }

  const handleDeleteAccount = async () => {
    if (!confirm('Permanently delete your account and every canvas, folder, and chat? This cannot be undone.')) return
    const err = await deleteAccount()
    if (err) alert(err)
    // On success, the auth state change routes back to the sign-in screen.
  }

  return (
    <>
      <section className="acct-section">
        <div className="label">Behavior</div>
        <div className="acct-card">
          <ToggleRow
            label="Show grid lines"
            sub="Faint grid behind your work on the page"
            value={grid}
            onChange={updateGrid}
          />
          <ToggleRow
            label="Vertical scrolling"
            sub="Swipe up to move between pages and add new ones, instead of sideways"
            value={verticalScroll}
            onChange={updateVerticalScroll}
          />
        </div>
      </section>

      <section className="acct-section">
        <div className="label">Troubleshooting</div>
        <div className="acct-card">
          <a className="acct-row as-button" href="mailto:help@euralearn.com">
            <span className="row-icon"><LifeBuoy size={18} /></span>
            <span className="row-main">
              <span className="row-label">Something not working?</span>
              <span className="row-sub">help@euralearn.com</span>
            </span>
            <ExternalLink size={16} className="row-chev" />
          </a>
        </div>
      </section>

      <section className="acct-section">
        <div className="label">Danger zone</div>
        <div className="acct-card">
          <button type="button" className="acct-row as-button danger-row" onClick={() => void handleDeleteAccount()}>
            <span className="row-icon"><Trash2 size={18} /></span>
            <span className="row-main">
              <span className="row-label">Delete account</span>
              <span className="row-sub">Permanently removes your account and every canvas, folder, and chat — can't be undone</span>
            </span>
          </button>
        </div>
      </section>

      <p className="acct-foot">Preferences are saved on this device — account-wide sync is coming soon.</p>
    </>
  )
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

function PaymentsScreen() {
  return (
    <>
      <section className="acct-section">
        <div className="label">Current plan</div>
        <div className="acct-card plan-card pro">
          <div className="plan-head">
            <div>
              <div className="plan-name">
                Free <Sparkles size={15} />
              </div>
              <div className="row-sub">Early access — nothing to pay, no card on file.</div>
            </div>
            <span className="plan-badge">Active</span>
          </div>
          <ul className="feature-list">
            <li><Check size={15} /> Unlimited canvases &amp; folders</li>
            <li><Check size={15} /> Step-by-step hints &amp; help</li>
            <li><Check size={15} /> Synced across your devices</li>
          </ul>
        </div>
      </section>

      <section className="acct-section">
        <div className="label">A note from us</div>
        <div className="acct-card thanks-card">
          <div className="thanks-icon"><Heart size={20} /></div>
          <p className="thanks-title">Thank you for being an early tester.</p>
          <p className="thanks-body">
            Eura is completely free while we're getting started. As one of our first
            users, you help shape what we build next — and we're genuinely grateful
            you're here. If a paid plan ever arrives, we'll let you know long before
            anything changes.
          </p>
        </div>
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------
// Help & Support
// ---------------------------------------------------------------------------

function HelpScreen() {
  return (
    <>
      <section className="acct-section">
        <div className="label">Get in touch</div>
        <div className="acct-card">
          <a className="acct-row as-button" href="mailto:eura@euralearn.com">
            <span className="row-icon"><Mail size={18} /></span>
            <span className="row-main">
              <span className="row-label">Email support</span>
              <span className="row-sub">eura@euralearn.com</span>
            </span>
            <ExternalLink size={16} className="row-chev" />
          </a>
        </div>
      </section>

      <section className="acct-section">
        <div className="label">Frequently asked</div>
        <div className="acct-card">
          <FaqItem q="How does Eura check my work?">
            Write your steps on the canvas and Eura reads your handwriting, then checks each line
            and points you to the first place something goes wrong.
          </FaqItem>
          <FaqItem q="Are my canvases private?">
            Yes. Your canvases are tied to your account and only visible to you.
          </FaqItem>
          <FaqItem q="How do I delete my account?">
            Open Settings and, under Danger zone, choose Delete account. That permanently removes
            your account and every canvas, folder, and chat — it can't be undone.
          </FaqItem>
        </div>
      </section>

      <section className="acct-section">
        <div className="label">About</div>
        <div className="acct-card">
          <a
            className="acct-row as-button"
            href="https://euralearn.com/terms"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="row-icon"><FileText size={18} /></span>
            <span className="row-main"><span className="row-label">Terms of Service</span></span>
            <ExternalLink size={16} className="row-chev" />
          </a>
          <a
            className="acct-row as-button"
            href="https://euralearn.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="row-icon"><ShieldCheck size={18} /></span>
            <span className="row-main"><span className="row-label">Privacy Policy</span></span>
            <ExternalLink size={16} className="row-chev" />
          </a>
          <div className="acct-row">
            <span className="row-main"><span className="row-label">Version</span></span>
            <span className="row-sub">Eura 1.0.0</span>
          </div>
        </div>
      </section>
    </>
  )
}

function FaqItem({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="faq">
      <summary>
        <span>{q}</span>
        <ChevronDown size={18} className="chev" />
      </summary>
      <div className="faq-a">{children}</div>
    </details>
  )
}

// ---------------------------------------------------------------------------
// Reusable controls
// ---------------------------------------------------------------------------

function ToggleRow({
  label,
  sub,
  value,
  onChange,
}: {
  label: string
  sub?: string
  value: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="acct-row">
      <span className="row-main">
        <span className="row-label">{label}</span>
        {sub && <span className="row-sub">{sub}</span>}
      </span>
      <Toggle value={value} onChange={onChange} label={label} />
    </div>
  )
}

function Toggle({
  value,
  onChange,
  label,
}: {
  value: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
      className={`toggle ${value ? 'on' : ''}`}
      onClick={() => onChange(!value)}
    >
      <span className="knob" />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const STYLES = `
.account-screen{
  --paper:#f6f1e6;--paper-2:#efe8d6;--ink:#18243f;--ink-soft:#3a4a69;
  --pencil:#6b7284;--rule:#d9cfb6;--rule-soft:#e7dfc9;--red:#b4453d;
  --accent:#2d5ad9;
  --sans:'Fraunces','Iowan Old Style',Georgia,serif;
  --mono:'JetBrains Mono',ui-monospace,monospace;
  --ui:'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
  position:fixed;inset:0;z-index:80;
  background:var(--paper);color:var(--ink);font-family:var(--ui);
  display:flex;flex-direction:column;
}
.account-screen::before{
  content:"";position:absolute;inset:0;pointer-events:none;z-index:0;
  background-image:
    radial-gradient(rgba(24,36,63,0.035) 1px, transparent 1.2px),
    radial-gradient(rgba(24,36,63,0.02) 1px, transparent 1.2px);
  background-size:3px 3px,7px 7px;background-position:0 0,1px 2px;mix-blend-mode:multiply;
}
.account-screen > *{position:relative;z-index:1}

.account-screen .acct-bar{
  display:flex;align-items:center;gap:14px;padding:22px 20px;
  border-bottom:1.5px solid var(--ink);background:var(--paper);flex-shrink:0;
}
.account-screen .acct-back{
  display:inline-flex;align-items:center;justify-content:center;
  width:38px;height:38px;border-radius:10px;cursor:pointer;
  background:transparent;border:1.5px solid var(--rule);color:var(--ink);
  transition:background .15s ease, border-color .15s ease;
}
.account-screen .acct-back:hover{background:var(--paper-2);border-color:var(--ink)}
.account-screen .acct-title{
  font-family:var(--sans);font-weight:500;font-size:20px;letter-spacing:-0.01em;
}

.account-screen .acct-body{flex:1;min-height:0;overflow-y:auto}
.account-screen .acct-inner{
  max-width:640px;margin:0 auto;padding:24px 20px 80px;
  display:flex;flex-direction:column;gap:26px;
}

.account-screen .acct-section{display:flex;flex-direction:column;gap:10px}
.account-screen .acct-section > .label{
  font-family:var(--mono);font-size:11px;letter-spacing:0.12em;text-transform:uppercase;
  color:var(--pencil);padding-left:2px;
}
.account-screen .acct-card{
  background:#fdfaf2;border:1.5px solid var(--ink);border-radius:12px;
  box-shadow:3px 4px 0 rgba(24,36,63,0.06);overflow:hidden;
}

.account-screen .acct-row{
  display:flex;align-items:center;gap:14px;width:100%;
  padding:15px 16px;text-align:left;background:transparent;
  border-bottom:1px dashed var(--rule);
}
.account-screen .acct-card > .acct-row:last-child,
.account-screen .acct-card > .field:last-child,
.account-screen .acct-card > .faq:last-child{border-bottom:none}
.account-screen .as-button{border:none;cursor:pointer;font:inherit;color:inherit}
.account-screen .as-button:not(:disabled):hover{background:var(--paper-2)}
.account-screen .as-button:disabled{cursor:default}
.account-screen .danger-row .row-icon,
.account-screen .danger-row .row-label{color:var(--red)}
.account-screen .danger-row:not(:disabled):hover{background:rgba(180,69,61,0.08)}
.account-screen .row-icon{display:inline-flex;color:var(--ink-soft);flex-shrink:0}
.account-screen .row-main{display:flex;flex-direction:column;gap:3px;flex:1;min-width:0}
.account-screen .row-label{font-size:14.5px;font-weight:600;color:var(--ink)}
.account-screen .row-sub{font-size:12.5px;color:var(--pencil)}
.account-screen .row-chev{color:var(--pencil);flex-shrink:0}

.account-screen .soon{
  font-family:var(--mono);font-size:9.5px;letter-spacing:0.1em;text-transform:uppercase;
  color:var(--accent);background:rgba(45,90,217,0.1);border:1px solid rgba(45,90,217,0.25);
  padding:3px 7px;border-radius:999px;flex-shrink:0;white-space:nowrap;
}

.account-screen .profile-head{display:flex;align-items:center;gap:16px;padding:0 2px}
.account-screen .avatar{
  width:64px;height:64px;border-radius:50%;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;
  background:var(--ink);color:var(--paper);
  font-family:var(--sans);font-weight:500;font-size:28px;
  box-shadow:3px 4px 0 rgba(24,36,63,0.12);
}
.account-screen .profile-id{min-width:0}
.account-screen .profile-email{
  font-size:17px;font-weight:600;color:var(--ink);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.account-screen .profile-meta{font-size:13px;color:var(--pencil);margin-top:2px}

.account-screen .field{
  display:flex;flex-direction:column;gap:7px;padding:15px 16px;
  border-bottom:1px dashed var(--rule);
}
.account-screen .field label{
  font-family:var(--mono);font-size:10.5px;letter-spacing:0.08em;text-transform:uppercase;color:var(--pencil);
}
.account-screen .field input{
  border:1.5px solid var(--ink);border-radius:8px;background:#fff;
  padding:10px 12px;font:inherit;font-size:14px;color:var(--ink);outline:none;
}
.account-screen .field input:focus{box-shadow:0 0 0 3px rgba(45,90,217,0.18)}
.account-screen .field input[readonly]{background:var(--paper-2);color:var(--ink-soft);border-color:var(--rule)}

.account-screen .btn-row{padding:14px 16px;display:flex}
.account-screen .acct-btn{
  display:inline-flex;align-items:center;gap:8px;cursor:pointer;
  font-family:var(--ui);font-weight:600;font-size:13.5px;
  padding:10px 16px;border-radius:999px;border:1.5px solid var(--ink);
  background:transparent;color:var(--ink);
  transition:transform .15s ease, opacity .2s ease;
}
.account-screen .acct-btn.primary{background:var(--ink);color:var(--paper);width:100%;justify-content:center}
.account-screen .acct-btn:disabled{opacity:0.55;cursor:default}
.account-screen .acct-btn:not(:disabled):hover{transform:translateY(-1px)}

.account-screen .toggle{
  width:46px;height:27px;border-radius:999px;flex-shrink:0;cursor:pointer;
  background:var(--rule);border:1.5px solid var(--rule);position:relative;
  transition:background .18s ease, border-color .18s ease;
}
.account-screen .toggle .knob{
  position:absolute;top:1.5px;left:1.5px;width:21px;height:21px;border-radius:50%;
  background:#fdfaf2;box-shadow:1px 1px 2px rgba(24,36,63,0.25);
  transition:transform .18s ease;
}
.account-screen .toggle.on{background:var(--accent);border-color:var(--accent)}
.account-screen .toggle.on .knob{transform:translateX(19px)}

.account-screen .plan-card{padding:18px;display:flex;flex-direction:column;gap:14px}
.account-screen .plan-card.pro{background:linear-gradient(135deg,#fdfaf2,#f3eede)}
.account-screen .plan-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.account-screen .plan-name{
  font-family:var(--sans);font-weight:500;font-size:20px;letter-spacing:-0.01em;
  display:inline-flex;align-items:center;gap:6px;
}
.account-screen .plan-name svg{color:var(--accent)}
.account-screen .plan-badge{
  font-family:var(--mono);font-size:10px;letter-spacing:0.1em;text-transform:uppercase;
  color:#2f6b3a;background:rgba(47,107,58,0.12);border:1px solid rgba(47,107,58,0.3);
  padding:4px 9px;border-radius:999px;flex-shrink:0;
}
.account-screen .feature-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px}
.account-screen .feature-list li{display:flex;align-items:center;gap:9px;font-size:13.5px;color:var(--ink-soft)}
.account-screen .feature-list li svg{color:var(--accent);flex-shrink:0}
.account-screen .empty-note{padding:22px 16px;text-align:center;font-size:13.5px;color:var(--pencil)}

.account-screen .thanks-card{padding:22px 20px;display:flex;flex-direction:column;gap:11px;align-items:flex-start}
.account-screen .thanks-icon{
  display:inline-flex;align-items:center;justify-content:center;
  width:42px;height:42px;border-radius:11px;color:var(--red);
  background:rgba(180,69,61,0.1);border:1.5px solid rgba(180,69,61,0.28);
}
.account-screen .thanks-title{
  font-family:var(--sans);font-weight:500;font-size:18px;letter-spacing:-0.01em;
  color:var(--ink);margin:0;
}
.account-screen .thanks-body{font-size:13.5px;line-height:1.6;color:var(--ink-soft);margin:0}

.account-screen .faq{border-bottom:1px dashed var(--rule)}
.account-screen .faq summary{
  list-style:none;cursor:pointer;padding:15px 16px;
  display:flex;align-items:center;justify-content:space-between;gap:12px;
  font-size:14.5px;font-weight:600;color:var(--ink);
}
.account-screen .faq summary::-webkit-details-marker{display:none}
.account-screen .faq summary .chev{color:var(--pencil);transition:transform .2s ease;flex-shrink:0}
.account-screen .faq[open] summary .chev{transform:rotate(180deg)}
.account-screen .faq-a{padding:0 16px 16px;font-size:13.5px;line-height:1.55;color:var(--ink-soft)}

.account-screen .acct-foot{font-size:12.5px;color:var(--pencil);text-align:center;margin:0;padding:0 8px}
`
