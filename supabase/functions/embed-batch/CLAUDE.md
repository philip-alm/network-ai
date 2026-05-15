# supabase/functions/embed-batch

Edge Function (Deno) that drains the pgmq `embedding_jobs` queue and writes
embeddings back to the originating contacts/assets rows. Invoked by pg_cron
every 10s on deployment; can also be hit manually for tests.

## Public API

- `POST /` (with service_role bearer) — processes up to 50 jobs, returns `{ processed }`.

## Files

- `index.ts` — Deno entrypoint (Hono server, env wiring, OpenRouter `fetch`).
- `core.ts` — pure logic, Node-importable. Takes `(supabase, embedFn)`, processes one batch. **The test harness imports this directly with a stubbed embedFn.**

## Dependencies

- `jsr:@hono/hono@^4.7` — HTTP server
- `jsr:@supabase/supabase-js@^2.50` — service-role client
- OpenRouter `/api/v1/embeddings` endpoint (model: `openai/text-embedding-3-small`, 1536 dims)

## What's banned in this function

- Reading user data outside the queue → row path (no arbitrary `select *`)
- Calling the agent-chat function from here
- Writing to any table other than `contacts.embedding*` / `assets.embedding*`
- Logging plaintext row contents

## Tests (MANDATORY)

Integration test (`supabase/tests/embed_batch.test.ts`) seeds a contact, manually invokes `processOneBatch(supabase, stubEmbed)`, asserts the row's embedding column is now populated and the queue is drained.

### How Claude verifies this function

1. `pnpm db:test` — includes embed_batch.test.ts
2. `pnpm verify:embeddings` — real OpenRouter call + real local Supabase, end-to-end

## Recent design decisions

- 2026-05-15: split `core.ts` from `index.ts` so tests can run under Node without spinning up Deno. `index.ts` is a 30-line Deno wrapper.
- Service-role-only via 0007 migration's `revoke from public; grant to service_role`.
