# Handoff — Email confirmation via one-time code (OTP)

**Date:** 2026-06-20 · **Superseded 2026-07-22:** everything below shipped — the app is
**live on the App Store** (v1.0 build 4). The "remaining steps" are resolved: the iPad
install succeeded in later sessions, and the OTP approach was extended to **password
reset** (`type:'recovery'`, commit `90f5ffd`) and **guest→account email change**
(`type:'email_change'`) on 2026-07-20, so the "reset still uses a link" gotcha below is
no longer true. All three templates: `supabase/templates/{confirmation,email_change,recovery}.html`,
applied via `scripts/apply-supabase-email-template.sh`. Hosted `site_url` is now
`https://euralearn.com`. Kept for historical context.

**Branch:** `main` · **Commit:** `4f951f0 "1 time code"` (committed + pushed to `origin/main`)
**Status (as of 2026-06-20):** ✅ Code shipped & ✅ Supabase configured · ⏳ iPad install blocked on USB · 🔑 token to revoke

---

## TL;DR

Account confirmation was switched from a **confirmation link** (which pointed at
`localhost` and would have needed iOS deep-link plumbing) to a **6-digit email
OTP code**. The user signs up → receives a code by email → types it into a new
"Check your email" screen → they're logged in. Identical on web and iOS, no
custom URL schemes, no redirect-URL allowlist fragility.

---

## Why we changed approach

The original confirmation **link** had an irreducible problem on a Capacitor iOS
app: a link needs a destination, which on iOS means a custom URL scheme +
`Info.plist` entry + deep-link handler + a Supabase redirect-URL allowlist + a
Safari→app round-trip. We first built that (custom scheme `eura://auth-callback`),
then **reverted it** in favor of the OTP code, which has none of those moving
parts — the code has no destination, the user just types it back into the app.

The deep-link work (`authDeepLink.ts`, the `eura://` scheme in `Info.plist`, and
the `emailRedirectTo`/`redirectTo` lines) was fully reverted — net-zero, so it
does not appear in the diff.

---

## What shipped (commit `4f951f0`)

| File | Change |
|------|--------|
| `frontend/src/lib/auth.ts` | Added `verifyEmailOtp(email, token)` → `supabase.auth.verifyOtp({ type: 'signup' })`, and `resendSignupOtp(email)` → `supabase.auth.resend({ type: 'signup' })` |
| `frontend/src/components/AuthScreen.tsx` | New `verify` mode: after sign-up, shows a "Check your email → enter 6-digit code" screen (numeric `one-time-code` input, **Verify** button, **Resend code** link). On success `useSession()` flips to logged-in |
| `supabase/templates/confirmation.html` | Canonical branded confirmation email showing the code via `{{ .Token }}` (no link) |
| `scripts/apply-supabase-email-template.sh` | Applies that template to the **hosted** Supabase project via the Management API (surgical — only the confirmation template + subject) |

Typecheck (`tsc --noEmit`) and `eslint` both pass.

---

## Supabase side — DONE ✅

Ran `scripts/apply-supabase-email-template.sh` against project
`lfctnhvnpxrocafiwkdb` → confirmation emails now contain the 6-digit code.
Output confirmed: `✓ Confirmation email template applied`.

**Prod assumptions to keep true:**
- **"Confirm email" must stay ON** (Authentication settings). If off, sign-up
  returns a session immediately and the code step is skipped. (It's currently on
  — the user already received confirmation emails.)
- Supabase rate-limits repeat sends (~60s), so the "Resend code" button will
  error if pressed too quickly — expected, not a bug.

---

## ⏳ Remaining steps

### 1. Install onto the physical iPad (BLOCKED on USB connectivity)
The web build, `cap sync`, and the **device build + codesign all succeeded**
(`App.app` is built under
`frontend/ios/DerivedData/00008122-0018092126DA801C/Build/Products/Debug-iphoneos/App.app`).
The **install** failed repeatedly with a CoreDevice tunnel timeout
(`NWError 60 - Operation timed out`) — the iPad's USB tunnel drops mid-install.

**Fix (physical):** unlock the iPad + leave it on the home screen, reseat the
USB-C cable, tap "Trust" if prompted. Then re-run **just** install + launch
(no rebuild needed) from `frontend/ios/App`:
```bash
xcrun devicectl device install app --device 00008122-0018092126DA801C \
  ../DerivedData/00008122-0018092126DA801C/Build/Products/Debug-iphoneos/App.app
xcrun devicectl device process launch --device 00008122-0018092126DA801C com.ryanli.eura
```
Note: `npx cap run ios --target <UDID>` currently **can't see the device**
(lists only simulators), which is why we built via `xcodebuild` directly — see
the `[[ios-physical-device]]` fallback. Web (Vercel) auto-deploys from the
`origin/main` push, so the web app should already have the new flow.

### 2. 🔑 Revoke the Supabase token
A personal access token (`sbp_…`) was pasted in plaintext in the session chat to
run the script. **Revoke it** at https://supabase.com/dashboard/account/tokens.

---

## How to test the full flow (once deployed)
1. Create account with a fresh email + password.
2. App shows "Check your email" → enter the 6-digit code from the email.
3. Tap **Verify** → you land logged-in. ("Resend code" re-sends, subject to the
   ~60s rate limit.)

---

## Gotchas / notes for next session
- **Never run `supabase config push`** — `supabase/config.toml` is local-dev and
  drifted from prod (`site_url = 127.0.0.1:3000`, `enable_confirmations = false`);
  pushing would clobber production auth. Edit hosted auth config via the
  Management API instead (`PATCH /v1/projects/{ref}/config/auth` + a personal
  access token; the repo's `service_role` key does **not** work for project config).
- **Password reset still uses a link** (unchanged this session). If you want it
  consistent, move it to OTP too (`type: 'recovery'`) — needs a "set new password"
  screen.
- No Supabase MCP is configured locally (only `waterloo-learn`), and the official
  Supabase MCP can't edit email templates anyway — hence the Management API script.
