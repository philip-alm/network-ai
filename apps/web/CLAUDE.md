# @reknowable/web

Next.js 15 App Router shell. Deploys to Vercel. Thin: routing, auth callbacks, middleware. All screens come from `@reknowable/app`.

## Public API

Routes are the API:

- `/sign-in`, `/sign-up` (Phase 2)
- `/auth/callback` (Phase 2)
- `/` (auth-gated, Phase 2+)

## Dependencies

- `next@15` — App Router + RSC + edge runtime
- `@reknowable/app` — every screen
- `@supabase/ssr` — cookie-based session for SSR
- `@supabase/supabase-js` — client

## What's banned in this app

- Business logic in `app/` — components live in `@reknowable/app`
- Direct DB calls from server components — go through `@reknowable/app/lib/supabase`
- `getServerSideProps` / Pages Router — App Router only

## Tests (MANDATORY)

- Vitest for any local utilities (rare; most logic is in `@reknowable/app`)
- Playwright E2E in `tests/` is the main coverage

### How Claude verifies this app

1. `pnpm -F @reknowable/web typecheck` — green
2. `pnpm -F @reknowable/web build` — succeeds
3. `pnpm verify:scaffold` (Phase 0) — boots + renders shared package output
4. `pnpm verify:ui` (Phase 6+) — full Playwright suite

## Non-goals

- No business logic
- No screens defined locally (live in `@reknowable/app/features/`)

## Recent design decisions

- 2026-05-15: scaffold created with one route `/` that imports from `@reknowable/app` to prove the monorepo wiring.
