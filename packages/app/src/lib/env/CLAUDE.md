# packages/app/lib/env

Zod-validated env access. The **only** place in the codebase that reads
`process.env` (web) or `Constants.expoConfig.extra` (native).

## Public API

- `env.supabaseUrl: string`
- `env.supabasePublishableKey: string`
- `env.openrouterApiKey: string | null` (only set when running on the server / scripts)

## What's banned in this module

- Reading any env var name not listed in the public API
- Throwing on missing optional vars — return `null` so callers handle gracefully
- Re-exporting `process.env` or `Constants.expoConfig`

## Tests (MANDATORY)

Unit tests with `vi.stubEnv` (web) covering: missing required vars throws, present vars parse, optional vars return null when missing.

## Recent design decisions

- 2026-05-15: created. Single source of truth for env values across web + native.
