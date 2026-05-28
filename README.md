# EuraAI — Local Setup

This repo has two services that you run side by side:

- **`backend/`** — FastAPI app (Python), served by uvicorn on port `8000`.
- **`frontend/`** — Vite + React + TypeScript app, served on port `5173`.

The frontend calls the backend at `http://localhost:8000` by default, so both need to be running.

---

## 1. Prerequisites

Install these once:

- **Python 3.11+** — `python --version`
- **Node.js 20+** and **npm 10+** — `node --version` / `npm --version`
- **Git** — `git --version`
- An **OpenAI API key** (the backend will refuse to start without one).
- A **Supabase project**. The frontend uses it for auth + data; the backend uses it to validate access tokens. Both will refuse to start without it configured.

---

## 2. Clone the repo

```bash
git clone <repo-url> EuraAI
cd EuraAI
```

---

## 3. Backend setup

All backend commands run from the `backend/` directory.

### 3a. Create and activate a virtual environment

The existing scripts expect the venv to live at `backend/venv/`.

**PowerShell (Windows):**

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
```

If PowerShell blocks the activation script, run this once in an admin shell:
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

**Bash (macOS / Linux / Git Bash on Windows):**

```bash
cd backend
python -m venv venv
source venv/Scripts/activate   # Windows Git Bash
# source venv/bin/activate     # macOS / Linux
```

You should see `(venv)` in your prompt.

### 3b. Install Python dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 3c. Configure environment variables

Create `backend/.env` (or a `.env` at the repo root — both are loaded) with:

```dotenv
OPENAI_API_KEY=sk-...your-key-here...
SUPABASE_JWT_SECRET=...from Supabase dashboard, see below...

# Optional overrides (defaults shown):
# OPENAI_MODEL=gpt-4o-2024-08-06
# MAX_IMAGE_WIDTH=1600
# MAX_UPLOAD_BYTES=10485760
# CORS_ORIGINS=http://localhost:5173,capacitor://localhost,https://localhost
```

`SUPABASE_JWT_SECRET` comes from your Supabase dashboard: **Project Settings → API → JWT Secret**. The backend uses it to verify the access token on every protected request (HS256). Without it, `app/config.py` fails fast at startup.

### 3d. Run the backend

With the venv activated, from `backend/`:

```bash
uvicorn app.main:app --reload --port 8000
```

Quick health check (in another shell):

```bash
curl http://localhost:8000/api/health
# => {"ok":true}
```

Leave this terminal running.

---

## 4. Frontend setup

Open a **new terminal**. All frontend commands run from the `frontend/` directory.

### 4a. Install Node dependencies

```bash
cd frontend
npm install
```

### 4b. Configure Supabase env vars

```bash
cp .env.local.example .env.local
```

Then fill in `frontend/.env.local`:

```dotenv
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
# VITE_API_BASE_URL=http://localhost:8000  # only if your backend lives elsewhere
```

Get the URL and **publishable** API key (`sb_publishable_…`, not the legacy anon JWT) from the Supabase dashboard: **Project Settings → API**. The dev server refuses to start without these.

### 4c. Run the dev server

```bash
npm run dev
```

Vite prints a local URL — usually `http://localhost:5173`. Open it in your browser.

If port `5173` is taken, Vite falls back to `5174`, `5175`, etc. The backend's CORS config already allows these.

---

## 5. Daily workflow (after first-time setup)

Two terminals, both from the repo root:

**Terminal 1 — backend:**

```powershell
cd backend
.\venv\Scripts\Activate.ps1          # PowerShell
# source venv/Scripts/activate       # Bash
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — frontend:**

```bash
cd frontend
npm run dev
```

Then open `http://localhost:5173`.

---

## 6. Troubleshooting

- **`RuntimeError: Required env var OPENAI_API_KEY is not set`** — create `backend/.env` (see step 3c) and restart uvicorn.
- **`RuntimeError: Required env var SUPABASE_JWT_SECRET is not set`** — add `SUPABASE_JWT_SECRET` to `backend/.env` from the Supabase dashboard (Settings → API → JWT Secret).
- **API requests return 401 `Missing Bearer token`** — the user isn't signed in, or the Supabase session expired. Sign in via the auth screen; the frontend attaches the access token automatically.
- **`ModuleNotFoundError` on backend start** — the venv isn't activated, or `pip install -r requirements.txt` didn't finish. Re-activate and re-install.
- **`Activate.ps1 cannot be loaded` in PowerShell** — run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.
- **Frontend loads but API calls fail (CORS or `ERR_CONNECTION_REFUSED`)** — confirm the backend is running on `:8000` and that `VITE_API_BASE_URL` (if set) points at it.
- **`port 8000 already in use`** — either kill the other process or run uvicorn on a different port and update `VITE_API_BASE_URL` accordingly.

---

## 7. Project layout

```
EuraAI/
├── backend/
│   ├── app/              # FastAPI app (routes, services, llm, storage)
│   ├── requirements.txt
│   ├── Dockerfile
│   └── venv/             # local virtualenv (gitignored)
└── frontend/
    ├── src/              # React + TypeScript source
    ├── public/
    ├── package.json
    └── vite.config.ts
```
