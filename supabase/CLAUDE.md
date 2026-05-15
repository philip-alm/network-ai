# supabase/

Postgres schema + Edge Functions + DB test suite. The source of truth for the data model.

## Sub-modules

- `migrations/` — sequential SQL migrations (see its `CLAUDE.md`)
- `functions/agent-chat/` — OpenRouter SSE proxy (Phase 4)
- `functions/embed-batch/` — pgmq worker for embeddings (Phase 3)
- `functions/delete-account/` — GDPR + Apple revoke (Phase 8)
- `tests/` — DB-level tests (RLS, RPC contracts, migration up/down)

## What's banned

- Hand-editing `supabase/migrations/*.sql` after they've been applied to remote. Always create a new migration.
- Bypassing RLS via service-role from client code. Service role only inside Edge Functions.

## Tests (MANDATORY)

Every migration adds tests in `tests/`. Every Edge Function has an `index.test.ts` next to it (msw-mocked upstream).

### How Claude verifies this directory

1. `supabase start` (local Postgres + auth + storage)
2. `pnpm db:test` — applies migrations + runs `tests/` against local
3. `pnpm verify:db` — also runs against the remote project (asserts RLS is on every table)

## Local development

```bash
supabase start                   # boots local Supabase via Docker
supabase db push                 # applies pending migrations to local
supabase functions serve         # runs Edge Functions locally
```

## Recent design decisions

- 2026-05-15: directory created. Migrations + tests land in Phase 1.
