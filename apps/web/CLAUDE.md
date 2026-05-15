# @network-ai/web

Next.js 15 App Router shell. Deploys to Vercel. Thin: routing, auth callbacks, middleware. All screens come from `@network-ai/app`.

## Public API

Routes are the API:

- `/sign-in`, `/sign-up` (Phase 2)
- `/auth/callback` (Phase 2)
- `/` (auth-gated, Phase 2+)

## Dependencies

- `next@15` — App Router + RSC + edge runtime
- `@network-ai/app` — every screen
- `@supabase/ssr` — cookie-based session for SSR
- `@supabase/supabase-js` — client

## What's banned in this app

- Business logic in `app/` — components live in `@network-ai/app`
- Direct DB calls from server components — go through `@network-ai/app/lib/supabase`
- `getServerSideProps` / Pages Router — App Router only

## Tests (MANDATORY)

- Vitest for any local utilities (rare; most logic is in `@network-ai/app`)
- Playwright E2E in `tests/` is the main coverage

### How Claude verifies this app

1. `pnpm -F @network-ai/web typecheck` — green
2. `pnpm -F @network-ai/web build` — succeeds
3. `pnpm verify:scaffold` (Phase 0) — boots + renders shared package output
4. `pnpm verify:ui` (Phase 6+) — full Playwright suite

## Non-goals

- No business logic
- No screens defined locally (live in `@network-ai/app/features/`)

## Recent design decisions

- 2026-05-15: scaffold created with one route `/` that imports from `@network-ai/app` to prove the monorepo wiring.
