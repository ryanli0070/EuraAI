EuraAI MVP — Tech Plan

Repo is empty (just docs + LICENSE). Plan below assumes greenfield. Goal: end-to-end Socratic loop working on iPad in ~2 weeks of focused work.

Phase 0 — Repo Scaffold (½ day)

EuraAI/
├── frontend/ # Vite + React + TS + Tailwind
├── backend/ # FastAPI + uv/poetry
├── .env.example # OPENAI*API_KEY, ANTHROPIC_API_KEY, P2T*\*
└── docker-compose.yml # optional, for local parity

- frontend: npm create vite@latest -- --template react-ts, add Tailwind, tldraw, KaTeX.
- backend: FastAPI + uvicorn, pydantic v2, httpx, python-dotenv, pix2text, pillow.
- Pre-commit: ruff + prettier. CORS open to localhost:5173 in dev.

Phase 1 — Whiteboard Shell (1 day)

- Full-screen tldraw canvas, no chrome, touch-action: none on root.
- PWA manifest + apple-mobile-web-app-capable meta tags so it installs cleanly on iPad.
- Floating "Check Work" button (bottom-right, thumb reach).
- Capture flow: editor.getSvg() → rasterize to PNG blob via canvas, or use tldraw's exportToBlob({ format: 'png' }).
- Test gate: draw on iPad, tap button, see blob size in console.

Phase 2 — Backend Skeleton (1 day)

Endpoints:

- POST /api/check — multipart image in, JSON { latex, hint, step_index, status } out.
- GET /api/health — for uptime checks.

Module layout:
backend/app/
├── main.py # FastAPI app, CORS, router mount
├── routes/check.py # orchestrates OCR → LLM
├── services/ocr.py # Pix2Text wrapper
├── services/tutor.py # LLM call + prompt
└── schemas.py # pydantic models
Keep services pure-functional and injectable so we can swap providers / mock in tests.

Phase 3 — OCR Integration (1–2 days)

- Use Pix2Text Python lib directly (avoid running it as a separate HTTP service for MVP — one less moving part).
- First call cold-loads the model (~10s); warm in app startup hook so first user request isn't slow.
- Pre-process: ensure white background, decent contrast; downscale to max 1600px wide.
- Return raw LaTeX plus a list of detected lines/regions if P2T exposes them — we'll need step granularity for Phase 4.
- Risk: handwriting accuracy on iPad strokes is unproven. Build a tiny eval harness (10 sample images) before trusting it.

Phase 4 — Socratic Reasoning (2–3 days)

This is the hard part. The LLM must:

1. Parse multi-step LaTeX into discrete steps.
2. Verify each step against the previous one.
3. Stop at the first incorrect step and produce a leading question — not the answer.

Approach:

- Single structured-output call (JSON mode) to GPT-4o:
  { "steps": [{"latex": "...", "valid": bool, "error_type": "..."}],
  "first_error_index": int | null,
  "hint": "Question that nudges student",
  "confidence": 0.0-1.0 }
- System prompt encodes the Socratic constraint hard: "Never state the correct value. Never write the next step. Phrase as a question about the student's own work."
- Few-shot with 3–4 examples covering: arithmetic slip, sign error, distribution mistake, valid work.
- Guardrail: post-process the hint with a regex/LLM check to reject responses containing = followed by a number that matches the expected answer. If guardrail trips, retry with stricter prompt.

Defer SymPy verification to Phase 6 — get the LLM-only loop honest first so we know how much symbolic backup we actually need.

Phase 5 — Hint UI (1 day)

- Non-intrusive callout: floating card near the flagged step, anchored to canvas coords if P2T gives bounding boxes; otherwise bottom-center.
- Render hint with KaTeX for any inline math.
- States: idle / checking (spinner) / hint-shown / all-correct (subtle green check).
- Dismissible. Don't block drawing.

Phase 6 — Hardening (2 days)

- Symbolic check with SymPy: parse each step's LaTeX (latex2sympy2), verify equality with previous step. If SymPy disagrees with LLM, trust SymPy and regenerate hint.
- Error states: OCR fails, LLM timeout, no math detected.
- Basic request logging (image hash → latex → hint) to a local SQLite for debugging quality regressions.
- Rate-limit /api/check per IP.

Phase 7 — Deploy (1 day)

- Frontend: Vercel or Cloudflare Pages.
- Backend: Fly.io or Railway (need persistent process for warm P2T model; serverless will cold-start badly).
- Single .env for keys. HTTPS required for PWA install on iPad.

Open Questions

1. Auth? MVP can be fully anonymous. Add later.
2. Persistence? Save sessions to revisit, or stateless? Stateless is faster to ship.
3. Pix2Text vs. Mathpix? Mathpix is more accurate but paid. Start with P2T; benchmark in Phase 3 and switch if accuracy <80% on test set.
4. Multi-problem canvas? If a student writes two problems side-by-side, do we segment? Defer — assume one problem per "Check Work" press.

Critical Path & Risks

- Highest risk: OCR accuracy on real handwriting. Validate in Phase 3 before building Phase 4–5 on top.
- Second risk: keeping the LLM Socratic. Budget time for prompt iteration; the guardrail in Phase 4 is non-optional.
- iPad PWA quirks: touch event handling and Pencil pressure can be finicky — test on real hardware early in Phase 1, not at the end.
