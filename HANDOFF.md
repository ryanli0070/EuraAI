# EuraAI — Source-of-Truth Handoff

**Branch:** `supabase-migration`
**Last updated:** 2026-06-02
**Status:** Supabase migration **code-complete and committed**, running locally on macOS end-to-end. Account deletion **activated** (service-role key set + validated). Live schema **snapshotted to disk** (`supabase/schema.sql`). **Backend deployed over HTTPS on AWS App Runner** (`https://t8tutmtkjt.us-east-1.awsapprunner.com`, verified) and the frontend prod build targets it — **the app is now ready to be wrapped in Capacitor** (see "Resume here" below + §15).

---

## ⏭️ Resume here (next session)

**✅ Milestone reached: the backend is deployed over HTTPS, so the app is now ready to be wrapped in Capacitor.** The FastAPI backend runs on **AWS App Runner** at **`https://t8tutmtkjt.us-east-1.awsapprunner.com`** — verified this session: `/api/health` → 200 `{"ok":true}`, POST `/api/check` & `/api/help` no-token → 401, and the `capacitor://localhost` CORS preflight returns the right `Access-Control-Allow-Origin`. `frontend/.env.production` points at it and the prod build bakes it in (no `localhost` leftover).

**Next stage — Capacitor integration (§15-C) + the remaining App Store blockers (§15-B):**
1. **Wrap in Capacitor** — `npm i @capacitor/core @capacitor/cli @capacitor/ios`, `npx cap init`, add the iOS platform, `npx cap copy`. The web build already targets the deployed backend; CORS already allows `capacitor://localhost`.
2. **Auth email deep links** (§15-C-7) — confirmation/reset links must return into the WKWebView (Capacitor URL scheme + Supabase Redirect-URL allowlist).
3. **Token storage** (§15-C-8) — move the `supabase-js` session off `localStorage` to Capacitor secure storage before submission.
4. **Apple Pencil** (§15-C-9) — verify `pointerType==='pen'` + pressure on a real iPad in the WKWebView.
5. **App Privacy disclosures** (§15-B-5) — App Store blocker, independent of Capacitor. *(Custom SMTP ✅ done via Resend; in-app account deletion ✅ verified.)*

**App Runner ops (full deploy details in §15-A-2 + §18):** service `euraai-api`, region `us-east-1`, ARN `…/euraai-api/ba2e768cacd44d7a800ceab59a4f5c70`. **Redeploy** = rebuild/push the image (§18) then `aws apprunner start-deployment --service-arn <arn>`. **Stop billing while idle:** `aws apprunner pause-service --service-arn <arn>` (resume with `resume-service`). Smallest instance (0.25 vCPU / 0.5 GB) — bump if memory-pressured (§15-D-11).

**Tooling installed (macOS, Homebrew):** `node` v26, `python@3.12` (backend venv at `backend/venv`), `supabase`, `flyctl`, `awscli` (IAM user `eura-deploy`, us-east-1), `colima`+`docker`+`docker-buildx`, `lightsailctl`.

> This file supersedes and replaces the old `HANDOFF.md`, `SUPABASE_MIGRATION.md`, and `EuraAI_Systems_Report.md` (all deleted — their still-relevant content is folded in here). The whiteboard-engine handoff at `frontend/src/lib/whiteboard/HANDOFF.md` is a separate subsystem and is left in place.

---

## 1. What EuraAI is

A math-tutoring app (working name "Orion") for iPad: students draw work on a custom freehand canvas, GPT-4o vision OCRs it, SymPy verifies the steps, and the AI gives Socratic hints + answers follow-ups. Intended delivery is a **Capacitor-wrapped iOS app** on the App Store, iPad-first.

**Stack**
- **Frontend:** React 19 + Vite + TypeScript; in-house `WhiteboardEngine` (canvas); KaTeX; Framer Motion. Deployed to Vercel (web); to be wrapped in Capacitor for iOS.
- **Backend:** FastAPI (Python) on AWS App Runner (`euraai-api`, 0.25 vCPU / 0.5 GB, us-east-1).
- **AI:** OpenAI GPT-4o vision (OCR + step analysis + hint in one call) + SymPy verification.
- **Data/Auth:** Supabase (Postgres + Auth + Storage + RLS). Project ref `lfctnhvnpxrocafiwkdb`.

## 2. Why this branch exists

Before this branch, **all** user state lived on-device (`localStorage` + IndexedDB), so accounts/multi-device/reinstall were impossible and nothing was server-owned. This branch moves everything to Supabase and puts **auth in front of both the app and the backend** — the prerequisite for every future user-facing feature.

| Data | Before | Now |
|---|---|---|
| Canvas/folder index, chat history, chat box/draft | `localStorage` | Postgres `canvases`, `folders`, `chat_messages` |
| Drawing strokes | IndexedDB | Supabase Storage `drawings/{user_id}/{canvas_id}.json` |
| Thumbnails | data URLs in `localStorage` | Supabase Storage `thumbnails/{user_id}/{canvas_id}.png` |
| Users / auth | none (anonymous) | Supabase Auth + JWT-gated FastAPI |

---

## 3. Branch state & commits

The migration is **committed and pushed** (the old handoff's "uncommitted, here's a commit plan" is obsolete). On top of `826e0be Initial migration commit`:

```
57e72e8  chore(db): snapshot Supabase schema (public + storage) to disk   <- 2026-06-02
d234ed3  New Handoff + adding skills/agents for supabase
4617d41  chore(fly): keep one machine warm; document Supabase secrets
69c7634  feat(account): in-app account deletion (App Store 5.1.1(v))
c2bc2e9  fix(auth): verify Supabase ES256 tokens via JWKS
826e0be  Initial migration commit          <- schema/RLS/storage + frontend + backend JWT
```

`frontend/.env.production` now holds the **real App Runner backend URL** (`VITE_API_BASE_URL`) and is **committed** (its `VITE_*` values are public by design). The schema is on disk at `supabase/schema.sql` (§13).

---

## 4. Current status at a glance

| Area | State |
|---|---|
| DB schema + RLS + Storage (live) | ✅ applied, verified |
| Table GRANTs to `authenticated` | ✅ fixed this session (`grant_table_privileges`) |
| Backend JWT validation (ES256/JWKS) | ✅ fixed this session, verified with real token |
| Per-user rate limiting | ✅ in place |
| Frontend auth gate + async data layer | ✅ builds clean, exercised via API |
| Drawings/thumbnails Storage round-trip | ✅ verified (upload/download/delete + RLS) |
| In-app account deletion | ✅ built + activated + **happy path verified end-to-end** |
| Local dev on macOS (serves + builds) | ✅ this session (`/api/health` 200, auth gate 401, prod build clean) |
| Live schema snapshot on disk | ✅ `supabase/schema.sql` (commit `57e72e8`) |
| Deploy backend over HTTPS | ✅ **AWS App Runner** (`euraai-api`); `/api/health` 200, auth 401, capacitor CORS ok (§15-A) |
| Custom SMTP (auth emails deliver) | ✅ **Resend** SMTP wired into Supabase Auth (verified domain) |
| Auth deep links, privacy, token storage, Pencil test | ❌ not done (see §15) |

---

## 5. Architecture

```
Browser (React+Vite)
  ├─ supabase-js ───────────► Supabase (Auth + Postgres + Storage)
  │   (auth + DB + Storage)      RLS enforces user_id == auth.uid()
  └─ apiFetch (Bearer JWT) ──► FastAPI on AWS App Runner
                                  verifies JWT (ES256 via JWKS), per-user rate limit
                                  /api/check /api/help /api/chat /api/account /api/health
```

**Two trust boundaries:**
1. **Browser → Supabase** — secured by RLS. The publishable key ships in the bundle because every read/write is authorized by `auth.uid()` against the row's `user_id`.
2. **Browser → FastAPI** — secured by the access token. The backend verifies the JWT and 401s otherwise. (Backend does **not** touch the DB except for account deletion via the service-role key.)

---

## 6. Database schema (`public` schema)

UUIDs via `gen_random_uuid()`. Exact DDL lives in the Supabase migrations (§11); column-level summary:

**`folders`** — `id, user_id→auth.users(cascade), parent_id→folders(cascade,self), name, sort_order double precision, created_at, modified_at`. Nestable via `parent_id`.

**`canvases`** — `id, user_id→auth.users(cascade), parent_id→folders(cascade), name, sort_order, thumbnail_path text, drawing_path text, chat_box jsonb, chat_latex_draft text default '', created_at, modified_at`. `*_path` columns point into Storage; chat box/draft are denormalized 1:1 onto the canvas so one UPDATE saves both.

**`chat_messages`** — `id, canvas_id→canvases(cascade), role check(user|assistant), text, status check(idle|checking|ok|all_correct|no_math|error), sort_index int, created_at`. No own `user_id`; ownership is via the parent canvas. `persistChat` deletes+reinserts the whole message log per flush (debounced 500ms) — simple and fine for short lists.

**`user_preferences`** — `user_id pk→auth.users(cascade), settings jsonb default '{}', updated_at`. Reserved for future settings.

**Triggers:** `set_modified_at()` (BEFORE UPDATE on folders+canvases) and `user_preferences_set_updated_at()`. Both `SET search_path = ''` (cleared the two advisor warnings).

**Indexes:** `folders_user_parent_idx(user_id,parent_id,sort_order)`, `canvases_user_parent_idx`, `canvases_user_modified_idx(user_id,modified_at DESC)`, `chat_messages_canvas_idx(canvas_id,sort_index)`.

---

## 7. Row-Level Security + the GRANTs fix

Every table has RLS enabled with explicit per-op policies (`SELECT/INSERT/UPDATE/DELETE`), all `to authenticated` (anon gets nothing). Predicate for folders/canvases/user_preferences:

```sql
user_id = (select auth.uid())
```

`chat_messages` is gated via its owning canvas:

```sql
exists (select 1 from public.canvases c
        where c.id = chat_messages.canvas_id and c.user_id = (select auth.uid()))
```

### ⚠️ The GRANTs bug (found + fixed this session)
`init_app_schema` created the tables + RLS policies but **never granted DML to the roles**, so every authenticated PostgREST call returned `403 permission denied for table` — RLS filters rows, but GRANTs are the gate *before* RLS. This slipped past the original "verification" because MCP/admin-role queries bypass both RLS and grants, and the manual smoke test had been deferred. Fixed by migration `grant_table_privileges`:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.folders, public.canvases, public.chat_messages, public.user_preferences
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.folders, public.canvases, public.chat_messages, public.user_preferences
  TO service_role;
-- anon intentionally gets nothing (the app is authenticated-only).
```

---

## 8. Storage buckets

Two **private** buckets (`public: false`): `drawings` (one `WhiteboardDoc` JSON per canvas, key `{user_id}/{canvas_id}.json`) and `thumbnails` (PNG, key `{user_id}/{canvas_id}.png`). Reads via `createSignedUrl()` (1h TTL, cached in `canvasStore` until ~1min before expiry).

Each bucket has 4 policies on `storage.objects` keyed on the path's first segment:
```sql
bucket_id = 'drawings' AND (select auth.uid())::text = (storage.foldername(name))[1]
```
`storage.objects` already had full DML grants from Supabase's base setup (so Storage was **not** affected by the GRANTs bug). **Note:** `storage.objects` has **no FK to `auth.users`**, so deleting a user does *not* cascade their blobs — the account-deletion endpoint removes them explicitly (§9).

---

## 9. Backend (`backend/app/`)

- **`config.py`** — loads `.env`, fail-fast on missing required vars. Required: `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`. Optional: `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_MODEL`, `MAX_IMAGE_WIDTH`, `MAX_UPLOAD_BYTES`, `CORS_ORIGINS`. Derives `SUPABASE_JWKS_URL` from `SUPABASE_URL`.
- **`auth.py`** — `get_current_user` dependency. Reads the token's `alg`: **ES256/RS256/PS256 → verify against the project JWKS** (`PyJWKClient`, cached); HS256 → `SUPABASE_JWT_SECRET` fallback. Audience `authenticated`. Sets `request.state.user_id`; 401 on any failure (no token text echoed). **This project signs with ES256**, so JWKS is the live path; the HS256 secret is now just a fallback.
- **`limiter.py`** — slowapi `key_func` = `user:{id}` when authed (from `request.state.user_id`), else IP.
- **`routes/check.py`, `help.py`, `chat.py`** — each gated with `Depends(get_current_user)`; call GPT-4o + SymPy. `/api/check` returns 200 even on failure (graceful `status:"error"`).
- **`routes/account.py`** (new) — `DELETE /api/account`, `5/min`, gated. Returns **503** if `SUPABASE_SERVICE_ROLE_KEY` is unset (so the app still boots without it). Otherwise calls `supabase_admin.delete_user`.
- **`supabase_admin.py`** (new) — service-role REST helpers (httpx): lists+removes the user's `{user_id}/` objects in both buckets, then `DELETE /auth/v1/admin/users/{id}` (cascades all Postgres rows via FK). Best-effort storage cleanup never blocks the user-row delete.
- **`main.py`** — registers routers; CORS `allow_origins=CORS_ORIGINS` + regex `(https?|capacitor)://(localhost|127\.0\.0\.1)(:\d+)?` so **`capacitor://localhost` and `https://localhost` (iOS WebView) are always allowed** regardless of the env override. `/api/health` is unauthenticated (App Runner health checks).

## 10. Frontend (`frontend/src/`)

- **`lib/supabase.ts`** — shared `createClient(url, publishableKey)`; throws at import if env missing.
- **`lib/auth.ts`** — `useSession()` hook; `signIn/signUp/signOut/resetPassword`; **`deleteAccount()`** (new — calls `DELETE /api/account`, then signs out; returns error string or null).
- **`lib/api.ts`** — `apiFetch(path, init)`; prepends `VITE_API_BASE_URL`, attaches `Authorization: Bearer <access_token>`.
- **`components/AuthScreen.tsx`** — email/password sign-in / sign-up / reset (3 modes).
- **`components/CanvasMenu.tsx`** — loads index once per refresh, feeds derived views; signed-URL thumbnails; sidebar with Sign Out + **danger-styled "Delete Account"** (new, behind a `confirm()`).
- **`components/Whiteboard.tsx`** — async chat load (gated by `chatReady`), `apiFetch` calls, blob thumbnails.
- **`lib/canvasStore.ts`** — async, Supabase-backed. Pure helpers (`listChildren/folderPath/searchAll/getCanvas/getFolder`) take a `CanvasIndex` arg (avoids N+1). `saveChat` debounced 500ms. `setThumbnail(id, Blob|null)`. `duplicateCanvas` server-side copies the drawing. `touchCanvas` removed (trigger handles `modified_at`).
- **`lib/whiteboard/persistence.ts`** — `loadDoc/saveDoc/deleteDoc` against the `drawings` bucket (same public API as the old IndexedDB module; engine call sites untouched).
- **`App.tsx`** — `useSession()` gate: `loading→null`, `no session→<AuthScreen>`, else `<AppShell>` (the existing slide-panel menu/whiteboard).

---

## 11. Environment variables (definitive)

### Backend — root `.env` (gitignored; also set as Fly secrets)
```dotenv
OPENAI_API_KEY=sk-...                 # required
SUPABASE_URL=https://lfctnhvnpxrocafiwkdb.supabase.co   # required (JWKS endpoint)
SUPABASE_JWT_SECRET=...               # required (HS256 fallback; Settings → API → JWT secret)
SUPABASE_SERVICE_ROLE_KEY=...         # OPTIONAL — required only for account deletion. Settings → API → service_role. SECRET — never ship to the client.
# optional: OPENAI_MODEL, MAX_IMAGE_WIDTH, MAX_UPLOAD_BYTES, CORS_ORIGINS
```
`find_dotenv(usecwd=True)` finds the root `.env` when uvicorn runs from `backend/`.

### Frontend — `frontend/.env.local` (gitignored; template in `.env.local.example`)
```dotenv
VITE_API_BASE_URL=http://localhost:8000
VITE_SUPABASE_URL=https://lfctnhvnpxrocafiwkdb.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```
Populated on this macOS machine. A **`frontend/.env.production`** also exists (used by `npm run build`) with prod Supabase + publishable key + `VITE_API_BASE_URL` = the **deployed App Runner URL** `https://t8tutmtkjt.us-east-1.awsapprunner.com`. (`.env.production` is committed — not gitignored; its VITE_* values are public by design.)

---

## 12. Running locally

```bash
# Backend (macOS — venv is Python 3.12 at backend/venv; system python3 is 3.9, too old)
backend/venv/bin/python -m pip install -r backend/requirements.txt    # incl. pyjwt[crypto], cryptography, httpx
# ensure root .env has OPENAI_API_KEY, SUPABASE_URL, SUPABASE_JWT_SECRET
backend/venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000   # (run from repo root)

# Frontend
cd frontend
npm install
npm run dev
```

**Email confirmation is ON** for this project: a fresh browser signup won't get a session until the emailed link is clicked. For local dev either disable confirmations in the Supabase dashboard, or confirm via SQL: `UPDATE auth.users SET email_confirmed_at = now() WHERE email = '…';`. The built-in Supabase email sender is heavily rate-limited (`over_email_send_rate_limit`); **custom SMTP is now configured via Resend** (verified sending domain), so confirm/reset emails deliver reliably for real users (raise Supabase → Authentication → Rate Limits when you scale volume).

---

## 13. Migrations (live in Supabase; not on disk)

| Version | Name |
|---|---|
| 20260527213923 | `init_app_schema` (tables, RLS, triggers) |
| 20260527213938 | `init_storage_buckets` (drawings/thumbnails + policies) |
| 20260527213950 | `pin_function_search_path` (search_path='' on trigger fns) |
| 20260531030026 | `grant_table_privileges` (the GRANTs fix — §7) |

> **DONE (2026-06-02):** live schema snapshotted to **`supabase/schema.sql`** (commit `57e72e8`) via native `pg_dump` — public schema (4 tables, RLS, triggers, indexes, functions, GRANTs) + `storage` buckets/policies. This is a source-of-truth **snapshot**, *not* history-synced migrations: `supabase db pull/push` as a workflow would still need the migration history reconciled (and Docker, which we sidestepped). The 4 versions still live in `supabase_migrations.schema_migrations`.

---

## 14. Verification status (what's actually proven)

Smoke-tested 2026-05-30 against the live project with a **real ES256 access token** (sign up → confirm via SQL → password grant):

- `/api/health` (no auth) → **200**; `/api/check` no token → **401**; `/api/check` **valid token → 200** (ES256/JWKS works).
- All four tables: authenticated INSERT/SELECT → **201/200**; anon → **blocked**.
- Drawings Storage: upload → download (content matches) → anon blocked → delete → all **pass**.
- Account delete: user row removal **cascades** all DB rows (verified by re-counting). Storage cleanup is explicit (no FK cascade).
- `DELETE /api/account` auth gate: no token / garbage token → **401**.
- `get_advisors` (security) → **0 findings**; frontend `npm run build` → **clean**.

**Verified 2026-06-02 (macOS):** backend serves (`/api/health` 200, `/api/check` no-token 401); `npm run build` clean (dev + prod); Supabase **publishable** and **service-role** keys both validated against the live project (200); prod build bakes in `VITE_API_BASE_URL`.

**Verified 2026-06-02 (deployed — App Runner):** service `euraai-api` reached `RUNNING`; `https://t8tutmtkjt.us-east-1.awsapprunner.com/api/health` → **200** `{"ok":true}` over valid TLS; POST `/api/check` & `/api/help` no-token → **401**; `capacitor://localhost` CORS preflight → **200** with matching `Access-Control-Allow-Origin`; `npm run build` bakes the App Runner URL into `dist/assets/*.js` (no `localhost:8000` leftover). *(The container reaching healthy also proves the SSM secrets injected correctly — `config.py` fail-fasts on any missing required var.)*

**Verified 2026-06-02 (user-run):** the full account-deletion happy path through `DELETE /api/account` with a signed-in user — completed **end-to-end**. **Custom SMTP** (Resend) configured and confirm/reset email **delivery confirmed**.

---

## 15. Remaining work — App Store runway (prioritized)

**A. Ship / activate**
1. ✅ **Account deletion activated + verified** — `SUPABASE_SERVICE_ROLE_KEY` set in `.env` (and SSM for prod), validated against the Supabase admin API. *Full happy-path delete via `DELETE /api/account` with a signed-in user **confirmed end-to-end** (2026-06-02).*
2. ✅ **Backend deployed (DONE 2026-06-02):** FastAPI on **AWS App Runner** (`euraai-api`, us-east-1) at `https://t8tutmtkjt.us-east-1.awsapprunner.com`. Image cross-built `linux/amd64` (App Runner is x86_64-only) from `backend/Dockerfile` → pushed to **ECR** `euraai-api`. The 3 secrets (`OPENAI_API_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`) live in **SSM Parameter Store** (SecureString) and are injected via App Runner `RuntimeEnvironmentSecrets` (not plaintext config); `SUPABASE_URL` is a plain runtime env var. Two IAM roles: `AppRunnerECRAccessRole` (image pull) + `EuraAIAppRunnerInstanceRole` (SSM read, KMS-scoped to `ssm.*`). HTTP health check on `/api/health`. `frontend/.env.production` → `VITE_API_BASE_URL` set and `npm run build` verified (URL baked into the bundle, no `localhost` leftover). (Web/Vercel deploy still optional — Capacitor bundles the frontend; `CORS_ORIGINS` only needs a web origin if you ship web.)

**B. Hard App Store blockers**
3. ✅ **In-app account deletion** (Guideline 5.1.1(v)) — built + activated + **happy path verified end-to-end**.
4. ✅ **Custom SMTP configured** — **Resend** SMTP wired into Supabase Auth (verified sending domain); confirm/reset emails now deliver reliably (replaces the rate-limited built-in sender). Host `smtp.resend.com`:465, user `resend`, pass = Resend API key.
5. **App Privacy disclosures** + privacy-policy URL in App Store Connect (collects email + usage).
6. ✅ **No Apple Sign-In needed** — email/password-only correctly avoids the SIWA mandate.

**C. Capacitor integration (the next stage)**
7. **Auth email deep links:** confirmation/reset links must return into the WKWebView — add a Capacitor URL scheme + Supabase Redirect-URL allowlist entries.
8. **Token storage:** `supabase-js` uses `localStorage`; move to Capacitor secure storage before submission.
9. **Apple Pencil:** verify `pointerType==='pen'` + pressure surface in WKWebView on real iPad.

**D. Before public scale (not submission blockers)**
10. OpenAI **budget cap** + job queue (bursts still hit OpenAI synchronously; per-user limiting is in place).
11. Pick an adequate instance size at deploy (the old Fly plan was 512 MB; bump if memory pressure appears).
12. ✅ **Schema on disk** — `supabase/schema.sql` (§13).

---

## 16. Known limitations / out of scope (intentional)

- **No on-device data migration** — old `localStorage`/IndexedDB content is ignored (pre-launch wipe is fine).
- **No offline cache** — drawings load from Storage each open; IndexedDB can return as a read-through cache in `persistence.ts` without changing the public API.
- **No Realtime sync** — two browsers won't see each other's edits; `subscribe()` fires only on local mutations.
- **No orphaned-Storage cleanup job** — if a DB delete succeeds but Storage delete fails, the blob is orphaned (RLS still protects it).
- **Pre-existing lint errors on `main`** (`Canvas.tsx` ref-during-render, `CanvasMenu.tsx` setParent-in-effect) remain — leave for a dedicated lint PR.

---

## 17. Decisions + rationale (kept for context)

- **Drawings in Storage, not JSONB** — one JSON file per canvas; scales to any size, offloads DB bandwidth.
- **Email/password only** — any third-party OAuth on iOS triggers Apple's Sign-in-with-Apple mandate; deferring avoids that work. (Add later via `supabase.auth.signInWithIdToken({provider:'apple'})` — no schema change.)
- **Publishable key (`sb_publishable_`)**, not the legacy anon JWT — Supabase's recommendation for new projects.
- **Per-op RLS policies** (no `FOR ALL`) — verbose but lets ops be granted/denied independently.
- **Account deletion on the FastAPI backend** (not a Supabase Edge Function) — keeps it consistent with the existing `apiFetch` + auth path; `supabase-js` can't self-delete a user.

---

## 18. References

- **Supabase project:** dashboard `https://supabase.com/dashboard/project/lfctnhvnpxrocafiwkdb`; API `https://lfctnhvnpxrocafiwkdb.supabase.co`.
- **Whiteboard engine** (separate subsystem): `frontend/src/lib/whiteboard/HANDOFF.md`.
- **Backend deploy (live):** AWS App Runner service `euraai-api` (us-east-1), ARN `arn:aws:apprunner:us-east-1:691981917444:service/euraai-api/ba2e768cacd44d7a800ceab59a4f5c70`, URL `https://t8tutmtkjt.us-east-1.awsapprunner.com`. Image: ECR `691981917444.dkr.ecr.us-east-1.amazonaws.com/euraai-api:latest` (cross-built `linux/amd64`). Secrets in SSM `/euraai/prod/*` (SecureString).
  - **Rebuild + redeploy:** (1) ECR login: `aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 691981917444.dkr.ecr.us-east-1.amazonaws.com`; (2) `docker buildx build --builder euraabuild --platform linux/amd64 --provenance=false -t 691981917444.dkr.ecr.us-east-1.amazonaws.com/euraai-api:latest --push backend/` (needs `colima start` + the `euraabuild` docker-container builder); (3) `aws apprunner start-deployment --service-arn <arn>`. **Pause to stop billing:** `aws apprunner pause-service --service-arn <arn>`.
  - Legacy `backend/fly.toml` is **unused** (kept for reference only).
