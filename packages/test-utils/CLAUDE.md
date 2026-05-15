# @network-ai/test-utils

Shared test harnesses: `testUserHarness` (spins up an isolated Supabase user for a test), `seedFactory` (factories for contacts / assets / threads), `agentReplayHarness` (replay a recorded LLM turn against current code).

This is dev-only — never imported by production code (workspace dependency, but never required at runtime by `apps/*` or `packages/app/`).

## Public API

(Phase 0: empty placeholder. Implemented during the phases that need it.)

Future exports:

- `testUserHarness(): Promise<{ user, supabase, cleanup }>` (Phase 1)
- `seedFactory.contact(overrides?)`, `.asset(overrides?)`, `.thread(overrides?)` (Phase 1)
- `agentReplayHarness(slug): Promise<ReplayResult>` (Phase 5)

## Dependencies

- `@supabase/supabase-js` — admin client for creating test users
- `@network-ai/types` — DB types

## What's banned in this package

- Importing from `apps/*` — direction is one-way
- Production code paths — this is tests only
- Network calls outside the local Supabase instance

## Tests (MANDATORY)

Yes — the test utilities themselves are tested. A broken harness silently breaks every downstream test.

### How Claude verifies this module

1. `pnpm -F @network-ai/test-utils test` — green
2. `pnpm -F @network-ai/test-utils check` — green

## Non-goals

- No production-mocking outside test scenarios — production code never imports from here

## Recent design decisions

- 2026-05-15: package created as placeholder; implementations follow phase by phase.
