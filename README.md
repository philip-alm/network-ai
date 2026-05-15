# network-ai

Personal network mapper with an AI agent. Map every person you know, rate their "warmth" 1–5, attach assets (their podcast studio, your 200k SEK in a convertible, etc.), and ask in natural language: _"What assets do we have for a hackathon in Göteborg?"_

## Stack

- **Monorepo**: pnpm + Turborepo
- **Web**: Next.js 15 App Router on Vercel
- **Native**: Expo SDK 54 (iOS + Android, dev-build) — fully scaffolded; store publishing is a separate step
- **Shared**: `@network-ai/app` package consumed by both shells
- **Backend**: Supabase (Postgres + RLS + pgvector + pgmq + pg_cron + Edge Functions)
- **LLM + embeddings**: OpenRouter (single API key)
- **Agent loop**: Vercel AI SDK 5, client-orchestrated

## Quick start

```bash
pnpm install
pnpm dev:web        # Next.js on :3000
pnpm dev:native     # Metro for Expo dev build
```

## Verify

```bash
pnpm verify:all     # every phase's verification in sequence
```

See `CLAUDE.md` for the full ruleset (testing discipline, banned patterns, debug artifacts, autonomous-debug tooling). Every module has its own `CLAUDE.md`.

## Folder shape

```
apps/
  web/                 Next.js shell
  native/              Expo shell
packages/
  app/                 shared screens + agent loop (the heart)
  ui/                  leaf UI components
  types/               generated DB types
  test-utils/          test harnesses
supabase/
  migrations/          DB schema
  functions/           Edge Functions (Hono on Deno)
  tests/               DB-level test suite
scripts/               autonomous-debug + verify entrypoints
```
