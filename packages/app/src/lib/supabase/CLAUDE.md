# packages/app/lib/supabase

Supabase client factory. The **only** place in the codebase that constructs
`createClient` from `@supabase/supabase-js`. Every screen, hook, and tool
imports the client from here.

## Public API

- `createSupabaseClient(opts?: { sessionStorage?: SessionStorage })` — creates a fresh client. Pass `sessionStorage` on native to use SecureStore; web uses cookies via `@supabase/ssr` separately.
- `getBrowserSupabase()` — singleton accessor for the web browser client.
- `type SupabaseClient` — re-exported from `@supabase/supabase-js`.

## Dependencies

- `@supabase/supabase-js` — the client
- `@network-ai/app/lib/env` — for URL + publishable key
- `@network-ai/types` — for the typed Database generic

## What's banned in this module

- Constructing a Supabase client outside this file
- Hardcoding `supabaseUrl` / `supabaseKey` strings
- Exporting the service-role / secret key path (server-only; lives in `scripts/`)

## Tests (MANDATORY)

- Client constructs with correct URL + key (uses zod env)
- Browser singleton returns same instance across calls
- Native variant uses passed-in storage adapter

## Recent design decisions

- 2026-05-15: created with a single `createSupabaseClient` factory + a web browser singleton.
