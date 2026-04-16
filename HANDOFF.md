# EuraAI — Session Handoff

**Date:** 2026-04-16
**Branch:** `main`
**Status:** Full MVP plan implemented (Phases 1–7). Nothing committed yet, no real-hardware verification yet, no live deploy yet.

---

## What Got Done

### Phase 1 — Frontend whiteboard shell
Vite + React + TS + Tailwind + tldraw + KaTeX. Full-screen canvas, "Check Work" button, blob capture via `editor.toImage`, PWA manifest.

### Phase 2 — Backend skeleton
FastAPI + uvicorn. `POST /api/check`, `GET /api/health`. CORS via `CORS_ORIGINS` env (defaults to localhost:5173). Lifespan warms the OCR model.

### Phase 3 — OCR (Pix2Text)
`backend/app/services/ocr.py` wraps `Pix2Text.from_config(enable_table=False)` with a `warm()` hook called from lifespan. Input is downscaled to 1600px max width before recognition.
**Mathpix swap:** if accuracy on real handwriting is too low, replace this module with a Mathpix HTTP call (`POST https://api.mathpix.com/v3/text`, env keys `MATHPIX_APP_ID` / `MATHPIX_APP_KEY`). Keep the `recognize(bytes) -> str` signature stable so nothing else changes. Decide after the Phase 3 eval harness (see "Open work" below).

### Phase 4 — Socratic tutor
`backend/app/services/tutor.py` calls GPT-4o (`gpt-4o-2024-08-06`) via `openai.beta.chat.completions.parse` with a Pydantic `TutorOutput` schema. Hard-coded Socratic system prompt + 4 few-shot examples (correct work, sign error, distribution error, wrong inverse op). Post-hoc regex guardrail rejects answer leakage (`x = N`, "the answer is", "should be N", etc.); on trip, retries once with a stricter system message; if it still leaks, falls back to a safe generic.

### Phase 5 — Hint UI
`frontend/src/components/Whiteboard.tsx` now renders status-aware callouts:
- `ok` (white) — Socratic hint, KaTeX-rendered if it contains `$...$`
- `all_correct` (emerald) — "Looks right ✓"
- `no_math` (amber) — "Nothing to check"
- `error` (red) — generic failure message
Dismissible with ×. Non-blocking layout (absolute positioning, doesn't intercept canvas events).

### Phase 6 — Hardening
- **Symbolic verification:** `services/verify.py` parses each step via `latex2sympy2_extended`, compares consecutive steps with `simplify`. Returns the index of the first algebraically-invalid transition, or `None` when undecidable. The check route prefers SymPy over the LLM whenever SymPy can decide; on disagreement it calls `tutor.rewrite_hint_for_index()` to regenerate a hint targeting the SymPy-determined step.
- **Logging:** `services/log_store.py` writes `{ts, image_hash, latex, hint, status, step_index}` to `backend/eura_checks.sqlite3` (gitignored). Best-effort — never breaks the request path.
- **Rate limiting:** `app/limiter.py` (slowapi). `/api/check` is `@limiter.limit("20/minute")` per IP.
- **Error states:** OCR-empty → `no_math`; uncaught exceptions → logged + generic `error` response.

### Phase 7 — Deploy configs
- `backend/Dockerfile` (python:3.11-slim + libgl1/libglib2/libgomp1 for Pix2Text).
- `backend/fly.toml` (2GB RAM, persistent `/data` volume for the pix2text model cache, `min_machines_running=1` to avoid the 10s cold-start).
- `backend/.dockerignore`.
- `frontend/vercel.json` (Vite framework preset + SPA rewrite).

---

## Files Touched This Session

```
backend/
├── Dockerfile                  (new)
├── .dockerignore               (new)
├── fly.toml                    (new)
├── .gitignore                  (added eura_checks.sqlite3)
├── requirements.txt            (added pix2text, openai, sympy, latex2sympy2_extended, slowapi)
└── app/
    ├── main.py                 (lifespan warms OCR; CORS via env; slowapi wired)
    ├── limiter.py              (new)
    ├── schemas.py              (status: ok|all_correct|no_math|error)
    ├── routes/check.py         (verify-override flow + sqlite logging + rate limit)
    └── services/
        ├── ocr.py              (real Pix2Text call)
        ├── tutor.py            (GPT-4o structured output + guardrail + verify-override hook)
        ├── verify.py           (new — SymPy step equivalence)
        └── log_store.py        (new — sqlite request log)

frontend/
├── vercel.json                 (new)
└── src/
    ├── main.tsx                (import katex CSS)
    └── components/Whiteboard.tsx  (KaTeX rendering, all four states, dismissible callout)

.env.example                    (CORS_ORIGINS, removed Anthropic placeholder)
HANDOFF.md                      (this file)
```

---

## Run It Locally

```bash
# Backend
cd backend
python -m venv .venv && source .venv/Scripts/activate   # Windows bash; on POSIX use bin/activate
pip install -r requirements.txt
# .env must contain OPENAI_API_KEY
uvicorn app.main:app --reload --port 8000
# First start downloads Pix2Text weights (~1GB, one-time).

# Frontend (separate shell)
cd frontend
npm install
npm run dev -- --host
# Open http://localhost:5173 (or LAN IP for iPad).
```

---

## Deploy

### Backend → Fly.io
```bash
cd backend
fly launch --no-deploy             # claim app name; reuses existing fly.toml
fly volumes create pix2text_data --region iad --size 3
fly secrets set OPENAI_API_KEY=sk-...
fly secrets set CORS_ORIGINS=https://<your-frontend-domain>
fly deploy
```

### Frontend → Vercel
```bash
cd frontend
vercel                              # first-time wizard
vercel env add VITE_API_BASE_URL    # set to https://<your-fly-app>.fly.dev
vercel --prod
```

Backend HTTPS is required for the iPad PWA install flow.

---

## Open Work / Verified vs Not Verified

**Not verified yet** (everything below assumes the code is *correct* — no end-to-end smoke test was run this session):
- `pip install -r requirements.txt` actually resolves on the user's Python (pix2text + torch is heavy and version-sensitive).
- The OpenAI structured-output call returns the expected schema (no schema mismatch errors).
- `latex2sympy2_extended` parses the LaTeX shapes Pix2Text emits (Pix2Text emits `$...$` and `$$...$$` markers — verify.py strips whitespace but does not strip those; may need adjustment).
- `frontend/`'s KaTeX import resolves at build time.
- iPad PWA install + Apple Pencil drawing.

**Eval harness deferred:** PLAN.md called for 10 handwritten sample PNGs in `backend/tests/fixtures/` to gate the Pix2Text-vs-Mathpix decision. Not built — needs real handwritten samples that we don't have yet.

---

## Useful Commands

```bash
# Backend
cd backend && uvicorn app.main:app --reload --port 8000
cd backend && python -c "from app.services.ocr import warm; warm()"   # pre-download weights

# Frontend
cd frontend && npm run dev -- --host
cd frontend && npm run build

# Tail the request log
sqlite3 backend/eura_checks.sqlite3 "SELECT ts, status, step_index, substr(latex,1,40), substr(hint,1,60) FROM checks ORDER BY id DESC LIMIT 20;"

# Kill stale vite processes if port 5173 sticks
pkill -f vite
```

---

## Files to Read First Next Session

- `context.md` — product philosophy (Socratic constraint is non-negotiable).
- `backend/app/routes/check.py` — orchestration lives here; the OCR/tutor/verify dance is the heart of the request.
- `backend/app/services/tutor.py` — system prompt + few-shots + guardrail. This is the file that determines product quality.
- This file.
