# supabase/migrations/

Sequential SQL migrations. Each file is named `NNNN_<slug>.sql` (zero-padded so they sort).

## How to add a migration

1. Create `NNNN_<slug>.sql` where NNNN = next sequence
2. Write idempotent SQL: `create table if not exists`, `create extension if not exists`, etc., where appropriate
3. Add tests to `supabase/tests/` covering the new objects (RLS works, RPCs return correct shapes)
4. Run locally: `supabase db reset` (drops + reapplies all migrations), then `pnpm db:test`
5. Apply to remote: `supabase db push`
6. Regenerate types: `pnpm -F @network-ai/types generate`

## What's banned

- Modifying an existing migration file after it's been applied to remote. Always a new file.
- `drop table` / `drop column` without a deliberate downtime decision — call it out in the PR.
- `truncate` in a migration.
- Storing service-role-only data in tables that have RLS off. Either RLS is on, or the table doesn't hold user data.

## Migration order (planned, Phase 1)

- `0001_init_extensions.sql` — pgcrypto, vector, pg_net, pg_cron, pgmq
- `0002_contacts_assets.sql` — contacts, assets tables + indexes (HNSW, GIN, FTS)
- `0003_chat.sql` — chat_threads, chat_messages
- `0004_rls.sql` — RLS policies + role grants for `authenticated`
- `0005_sql_helpers.sql` — query_sql, mutate_sql, hybrid_search_contacts, hybrid_search_assets
- `0006_embeddings_pipeline.sql` — pgmq queue, triggers, pg_cron schedule

## Recent design decisions

- 2026-05-15: directory created. Migrations land in Phase 1.
