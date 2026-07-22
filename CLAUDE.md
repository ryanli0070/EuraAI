# EuraAI

Math-tutoring iPad app ("Eura Learn", **live on the App Store since July 22, 2026** —
v1.0, bundle `com.euralearn.eura`): React 19 + Vite frontend with an in-house
whiteboard engine, wrapped in Capacitor for iOS; FastAPI backend on AWS App
Runner; Supabase for auth/Postgres/Storage (email/password + anonymous guest
sessions, all email confirmations via 8-digit OTP codes). See `HANDOFF.md` for
architecture and current state.

Production is user-facing now: don't pause the App Runner service, don't push
`supabase config`, and remember App Review constraints on future updates —
guest access to free features must stay (Guideline 5.1.1(v)), and any paid
features must use Apple In-App Purchase.

- Frontend dev: `cd frontend && npm run dev` (backend URL from `.env.local`)
- Prod build: `cd frontend && npm run build` (uses `.env.production`, baked
  into the Capacitor iOS shell with `npx cap sync ios`)
- Typecheck/lint: `cd frontend && npx tsc --noEmit && npx eslint src/`

## Testing

- Run: `cd frontend && npm test` (Vitest, jsdom; watch mode: `npm run test:watch`)
- Tests are colocated in `frontend/src/**/*.test.ts(x)`; see `frontend/TESTING.md`
- 100% test coverage is the goal — tests make vibe coding safe
- When writing new functions, write a corresponding test
- When fixing a bug, write a regression test
- When adding error handling, write a test that triggers the error
- When adding a conditional (if/else, switch), write tests for BOTH paths
- Never commit code that makes existing tests fail

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
