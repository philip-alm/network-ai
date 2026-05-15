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
- `@network-ai/app/lib/supabase` — tool execution target
- `@network-ai/types` — Database shape

## The 4 tools

| Tool              | Purpose                                                                             |
| ----------------- | ----------------------------------------------------------------------------------- |
| `query_sql`       | Arbitrary SELECT/WITH (RLS-scoped). Use for any ad-hoc read.                        |
| `mutate_sql`      | INSERT/UPDATE/DELETE with RETURNING. Always confirms before destructive deletes.    |
| `search_contacts` | Hybrid (FTS + semantic) over `contacts`. Filters: min_warmth, required_tags, limit. |
| `search_assets`   | Hybrid over `assets`. Same filter shape.                                            |

## Debug artifacts

Every `runAgentTurn` call writes a folder under `~/Documents/network-ai-debug/<timestamp>-<slug>/`
containing the BYTE-EXACT request bodies sent to the LLM, the raw SSE stream
back, every tool call's args + result, and DB-state snapshots before/after.
This is how Claude diagnoses without booting the UI (per root CLAUDE.md §1
Directive 3).

Recorders are pluggable:

- `NodeDebugRecorder` — writes to disk; used by verify scripts and tests
- `NoopDebugRecorder` — used in the browser (Phase 6 wires an IndexedDB recorder)

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
