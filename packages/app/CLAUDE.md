# @network-ai/app

Shared screens, business logic, and the agent loop. Renders identically on web and native via NativeWind + Solito.

This is the heart of the app. Web and native shells (`apps/web/`, `apps/native/`) are thin wrappers over this package.

## Public API

Anything not exported from `src/index.ts` is private and may not be imported from outside this package.

Re-exports:

- `features/chat` — `ChatThread`, `ChatComposer`, `MessageBubble`, `useAgentLoop`
- `features/contacts` — `ContactsAccordion`, `ContactRow`, `ContactDetail`
- `features/assets` — `AssetsList`, `AssetRow`
- `features/auth` — `SignInScreen`, `SignUpScreen`
- `features/home` — `HomeScreen`
- `lib/supabase` — `createSupabaseClient`, `useSupabase`
- `lib/agent` — `tools`, `systemPrompt`, `runAgentTurn`, `DebugRecorder`
- `lib/env` — `env` (zod-validated)

## Dependencies

- `@supabase/supabase-js` — the data layer; only HTTP-to-Supabase happens through this client
- `react`, `react-native` — UI primitives shared by both shells
- `zod` — schema validation at every boundary
- `@network-ai/ui` — leaf components (Button, Input, Accordion, …)
- `@network-ai/types` — generated DB types + agent tool I/O types

## What's banned in this package

- Importing from `apps/web/` or `apps/native/` — direction is shell → package, never reverse
- Direct `fetch` calls — go through `lib/supabase` or `lib/agent`
- Platform-specific code outside files explicitly named `*.web.ts(x)` / `*.native.ts(x)`
- `console.log` — use `DebugRecorder` from `lib/agent`
- Reading `process.env` outside `lib/env`

## Tests (MANDATORY)

Every file under `src/features/` and `src/lib/` has a `*.test.ts(x)` next to it.

- Component tests: render + interaction for every component
- Hook tests: every custom hook (with a `renderHook` harness)
- Function tests: every public function — happy + failure cases
- Snapshot tests: prompt builders + LLM system messages

### How Claude verifies this module

1. `pnpm -F @network-ai/app test` — green
2. `pnpm -F @network-ai/app check` — green
3. If touching agent: `pnpm verify:agent-loop` — green
4. If touching UI: `pnpm verify:ui` — green (Playwright in `apps/web/tests/`)

## Non-goals

- This package does not own routing — that lives in `apps/web/app/` and `apps/native/app/`
- This package does not own auth callbacks — that lives in the shells
- This package does not own deployment config

## Recent design decisions

- 2026-05-15: package created. Single-source-of-truth for app screens shared across web + native.
