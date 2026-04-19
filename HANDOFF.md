# EuraAI — Session Handoff

**Date:** 2026-04-18
**Branch:** `Without-P2T` (diverged from `main`; not merged)
**Status:** Landing page + hash routing added on top of the existing OCR-less MVP. Changes are **uncommitted**.

---

## Current Session (2026-04-18)

Added a marketing landing page as the new entry point; the whiteboard is now reached by clicking through.

### What changed
- **`frontend/src/components/Landing.tsx`** *(new)* — hero with CTA, 3-card feature grid, secondary CTA card, simple header/footer. Tailwind-styled, violet accent.
- **`frontend/src/App.tsx`** — hash-based router. `#/` → `Landing`, `#/whiteboard` → `Whiteboard`. Listens to `hashchange` so browser back/forward works.
- **`frontend/src/components/Whiteboard.tsx`** — added a `← Home` link (top-left) and a `useEffect` that toggles `document.body.classList` `whiteboard-mode` while mounted.
- **`frontend/src/index.css`** — moved the `overflow: hidden` / `touch-action: none` / `user-select: none` locks behind `body.whiteboard-mode` so the landing page scrolls and allows text selection.

### Verified
- `npm run build` passes (TS + Vite build clean; only the pre-existing tldraw chunk-size advisory).

### Not verified
- Dev server not launched this session — landing visuals / CTA flow / back-to-home link not eyeballed in a real browser.
- Tldraw gesture behavior after the body-class toggle on real touch hardware (iPad).

---

## Prior Session Recap (2026-04-16)

Full MVP plan (Phases 1–7) implemented: FastAPI backend with `/api/check`, Socratic tutor (GPT-4o structured output + guardrail), SymPy step-verification override, sqlite request log, slowapi rate limit, Fly.io + Vercel deploy configs. A later commit on this branch (`574e915 Removing OCR, sending png straight to gpt-4o`) removed Pix2Text and now sends the PNG directly to GPT-4o — so the "OCR" and "verify" portions of the 2026-04-16 notes may be stale on this branch. Confirm by reading `backend/app/routes/check.py` before relying on them.

---

## Uncommitted State

```
modified:   frontend/src/App.tsx
modified:   frontend/src/components/Whiteboard.tsx
modified:   frontend/src/index.css
untracked:  frontend/src/components/Landing.tsx
```

No backend changes this session.

---

## Run Locally

```bash
# Backend
cd backend
source .venv/Scripts/activate           # Windows bash
uvicorn app.main:app --reload --port 8000

# Frontend (separate shell)
cd frontend
npm run dev -- --host
# http://localhost:5173/  → landing
# http://localhost:5173/#/whiteboard → canvas
```

---

## Suggested Next Steps

1. **Eyeball the landing page** in `npm run dev` — copy, spacing, contrast, dark-mode behavior on the violet gradient.
2. **Commit + push** `Without-P2T` if the landing work is approved (four files listed above).
3. **Decide on merge**: `Without-P2T` has diverged from `main`. Is this branch the new trunk, or do we rebase/merge back?
4. **Real router?** If more pages are coming (about, pricing, history of past checks), swap the hash-state router in `App.tsx` for `react-router-dom`. One page doesn't justify the dep yet.
5. **iPad smoke test**: install the PWA, confirm the landing → whiteboard transition and the Pencil drawing both still work after the `whiteboard-mode` class refactor.
6. **Eval harness** (still deferred from prior session): sample handwritten PNGs under `backend/tests/fixtures/` to gate any OCR/model swaps.

---

## Files to Read First Next Session

- `context.md` — product philosophy (Socratic constraint is non-negotiable).
- `backend/app/routes/check.py` — current request orchestration (post-OCR-removal shape).
- `backend/app/services/tutor.py` — system prompt + few-shots + guardrail; determines product quality.
- `frontend/src/App.tsx` + `frontend/src/components/Landing.tsx` — current routing entry point.
- This file.
