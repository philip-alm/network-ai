# Reknowable

A second brain for everyone in your network and everything they can offer.

When an idea comes up in a meeting, Reknowable lets you instantly recall:
_who I know that could help_, _what asset fits this_, _how warm that
relationship is_, _how to reach them_. Built for operators and founders
whose network has grown past what fits in working memory. Single-user
today; designed for shared organizational memory tomorrow.

## Stack

- **Monorepo**: pnpm + Turborepo
- **Web**: Next.js 15 App Router on Vercel
- **Native**: Expo SDK 54 (iOS + Android, dev-build) — scaffolded
- **Shared**: `@reknowable/app` package consumed by both shells
- **Backend**: Supabase (Postgres + RLS + pgvector + pgmq + pg_cron + Edge Functions)
- **LLM + embeddings**: OpenRouter (single API key)
- **Agent loop**: Vercel AI SDK 5, client-orchestrated

## Documentation

- **[PRODUCT.md](./PRODUCT.md)** — strategic anchor: users, purpose, brand personality, anti-references, design principles.
- **[DESIGN.md](./DESIGN.md)** — visual system: Operator's Study palette, typography, motion + icon vocabulary, components, signature moments.
- **[BRAND.md](./BRAND.md)** — voice spec: how the agent talks, copy patterns, the agent's system-prompt persona.
- **[CLAUDE.md](./CLAUDE.md)** — engineering ruleset: testing discipline, banned patterns, debug artifacts, ship triggers.

Every module has its own `CLAUDE.md` extending the root.

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

## Folder shape

```
apps/
  web/                 Next.js shell (the deployed surface)
  native/              Expo shell (scaffolded)
packages/
  app/                 shared screens, agent loop, brand wordmark (the heart)
  ui/                  leaf UI components
  types/               generated DB types
  test-utils/          test harnesses
supabase/
  migrations/          DB schema
  functions/           Edge Functions (Hono on Deno)
  tests/               DB-level test suite
scripts/               autonomous-debug + verify entrypoints
```
