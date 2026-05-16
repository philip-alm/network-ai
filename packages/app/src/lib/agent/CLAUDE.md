# packages/app/lib/agent

The agent loop. Client-orchestrated: this module owns the conversation,
issues one LLM hop at a time to the agent-chat Edge Function, executes tool
calls directly against Supabase RPCs (RLS-scoped by the caller's JWT).

## Public API

- `runAgentTurn(opts: RunAgentOptions): Promise<AgentTurnResult>`
- `makeTools(supabase): Record<string, Tool>` — the 4 typed tools
- `systemPrompt: string` — the agent's system message
- `DebugRecorder`, `NodeDebugRecorder`, `NoopDebugRecorder` — captures byte-exact LLM I/O + tool calls + DB-state snapshots per turn
- `MODEL_ID`, `TOOL_NAMES` — constants

## Dependencies

- `ai` (Vercel AI SDK 5) — streamText, stepCountIs, tool helper
- `@ai-sdk/openai-compatible` — OpenAI-compatible provider over our Edge Function (or OpenRouter directly in scripts)
- `zod` — tool parameter schemas
- `@reknowable/app/lib/supabase` — tool execution target
- `@reknowable/types` — Database shape

## The 4 tools

| Tool              | Purpose                                                                             |
| ----------------- | ----------------------------------------------------------------------------------- |
| `query_sql`       | Arbitrary SELECT/WITH (RLS-scoped). Use for any ad-hoc read.                        |
| `mutate_sql`      | INSERT/UPDATE/DELETE with RETURNING. Always confirms before destructive deletes.    |
| `search_contacts` | Hybrid (FTS + semantic) over `contacts`. Filters: min_warmth, required_tags, limit. |
| `search_assets`   | Hybrid over `assets`. Same filter shape.                                            |

## Debug artifacts

Every `runAgentTurn` call writes a folder under `~/Documents/reknowable-debug/<timestamp>-<slug>/`
containing the BYTE-EXACT request bodies sent to the LLM, the raw SSE stream
back, every tool call's args + result, and DB-state snapshots before/after.
This is how Claude diagnoses without booting the UI (per root CLAUDE.md §1
Directive 3).

Recorders are pluggable:

- `NodeDebugRecorder` — writes to disk; used by verify scripts and tests
- `HttpDebugRecorder` — used by the browser in dev (`NODE_ENV !== 'production'`).
  POSTs events to `/api/debug/recorder` which writes to
  `~/Documents/reknowable-debug/browser-turns/<slug>/` in the same shape
  as `NodeDebugRecorder`. Refuses in prod. Wire format documented in
  `httpDebugRecorder.ts`; route handler at
  `apps/web/app/api/debug/recorder/route.ts`.
- `NoopDebugRecorder` — used in prod browser bundles and headless contexts
  where no recorder is wired.

### Triage workflow

Whenever the user reports the agent broke, the first command is
`pnpm last-turn` (or `pnpm last-turn --failed` for the most recent
failure). It reads `browser-turns/index.jsonl` + the matching trace and
prints a 5-second summary including `finish_reason`, segment tail, and a
synthesized last-event line ("SILENT STOP — turn ended after tool:query_sql
with no text response"). Drill into the full trace at the path it prints.

Override the trace root via `REKNOWABLE_DEBUG_ROOT` (used by tests and by
operators who want a centralized share).

## What's banned in this module

- Calling `fetch()` directly to LLM providers — go through the openrouter client
- Logging the LLM API key
- Tool implementations that bypass `query_sql` / `mutate_sql` to reach the DB (would skip RLS at the SECURITY DEFINER boundary)
- `console.log` for anything other than warn/error — use the recorder

## Tests (MANDATORY)

- Unit tests for tool schemas (Zod) + tool-result shaping
- Integration test in `supabase/tests/agent_loop.test.ts` (a separate
  vitest file that drives a real test user against a stubbed LLM,
  asserts tool calls reach the DB correctly)
- **End-to-end** via `scripts/verify-agent-loop.ts` — REAL OpenRouter,
  REAL Supabase, REAL three-turn conversation (create contact / add
  asset / search). This is the user-mandated acceptance test.

## Recent design decisions

- 2026-05-15: created. The provider is injected so the same agent code
  runs through the production Edge Function in the browser, or directly
  against OpenRouter in Node scripts/tests.
- 2026-05-16: `systemPrompt` restructured from ASCII-banner sections to
  XML-tagged blocks (`<identity>`, `<persistence>`, `<answer_and_move>`,
  `<loop>`, `<self_correction>`, `<tools>`, etc.) per 2026 prompting
  guidance from Anthropic, OpenAI, and Google — models adhere better to
  tagged sections than to prose banners and they compress better in
  prompt caching. Added explicit `<persistence>` and `<self_correction>`
  blocks. Tool descriptions tightened (find: when to use intent vs
  queries; set_panel: purpose / when / result-contract / self-correction
  structure; mutate_sql: SQL rules delegated to the system prompt's
  `<sql_gotchas>` block instead of duplicated in the schema description).
- 2026-05-16: closed the browser debug gap that bit us when the agent
  silently stopped on the Gothenburg turn. Added `HttpDebugRecorder`
  (POSTs to `/api/debug/recorder` which writes byte-exact traces to
  `~/Documents/reknowable-debug/browser-turns/<slug>/`),
  `pnpm last-turn` for 5-second triage, the `upstream.completed` +
  `upstream.cancelled` Edge Function events, and `runAgent.recordTimeline('llm/finished', …)`
  now carries `finish_reason` + a `segments_summary` so silent stops are
  visible in the trace. Recorder interface now has an optional `flush()`
  that `runAgentTurn` awaits before returning so the on-disk trace is
  guaranteed consistent when the function resolves.
