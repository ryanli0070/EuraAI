# Testing

100% test coverage is the key to great vibe coding. Tests let you move fast,
trust your instincts, and ship with confidence — without them, vibe coding is
just yolo coding. With tests, it's a superpower.

## Framework

- **Vitest 4** with **@testing-library/react** and **jsdom**
- Config: `vitest.config.ts` (jsdom environment, jest-dom matchers via
  `src/test/setup.ts`)

## Running

```bash
cd frontend
npm test          # run once (CI mode)
npm run test:watch  # watch mode while developing
```

CI runs the suite on every push/PR via `.github/workflows/test.yml`.

## Layers

- **Unit tests** — pure logic and lib modules (`src/lib/*.test.ts`). Mock
  Supabase (`vi.mock('./supabase')`) and the backend (`vi.mock('./api')`) —
  tests never hit the network.
- **Integration/component tests** — React components with
  @testing-library/react (`src/components/*.test.tsx`). Render, interact via
  `fireEvent`/`user-event`, assert on what the user sees.
- **E2E/smoke** — done via `/qa` (gstack browse) against a running build;
  no Playwright/Cypress checked in yet.

## Conventions

- Test files are colocated: `foo.test.ts` next to `foo.ts`.
- Import `describe/it/expect/vi` explicitly from `vitest` (no globals).
- Assert real behavior, never `toBeDefined()`.
- Regression tests for QA-found bugs carry an attribution comment pointing at
  the QA report.
- Never import secrets or real credentials in tests.
