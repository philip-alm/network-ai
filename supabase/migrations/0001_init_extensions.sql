-- 0001_init_extensions.sql
-- Postgres extensions required by the rest of the schema. Idempotent so reset/re-apply is safe.

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "vector";     -- pgvector (halfvec, hnsw, cosine ops)
create extension if not exists "pg_net";     -- HTTP requests from Postgres (used by pg_cron schedule)
create extension if not exists "pg_cron";    -- scheduled jobs (embedding worker poll)
create extension if not exists "pgmq";       -- transactional queue for embedding jobs
