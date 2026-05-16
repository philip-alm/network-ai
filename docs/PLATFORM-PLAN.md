# reknowable — Platform Plan (post-MVP hardening)

This document is the canonical plan for taking reknowable from "the agent works
end-to-end" (current state, commits `c7d84cc` → `353679d`) to an **enterprise-
grade, reliable experience** the user can put in front of anyone.

It synthesizes four lessons:

1. The actual user-facing failures we hit shipping the MVP (cookie/SSR sync,
   CORS, Hono `basePath`, AI SDK `/chat/completions` routing, stream/JSON
   mismatch). Each one was invisible to my Node-driven verify scripts because
   they hand-rolled `fetch` instead of driving the production code path.
2. Battle-tested patterns from `/Users/philip/miniapps/Incredible/` —
   teach-and-retry, byte-exact debug capture, ownership invariants,
   `normalize_history` wire-format defense, hexagonal architecture, per-module
   CLAUDE.md discipline, structured timeline events.
3. User-stated requirements from this session: streaming UI components, "nudges
   for the AI when a tool call has wrong parameters or fails", review-and-delete
   on contacts (edit is optional, raw text is fine), enterprise-grade
   reliability, no Playwright.
4. The four Explore agents' deep dive on Incredible's `crates/` (see "Sources"
   at the end).

The plan is structured so each phase is independently shippable + verifiable.

---

## 1. Vision & UX

### 1.1 Single sentence

> _"Talk to your personal assistant; it organizes your network into a
> reviewable, deletable ledger of people + assets you can query in plain
> language."_

### 1.2 The two-pane shape (web)

```
┌───────────────────────────────────────┬───────────────────────────────────────┐
│  CHAT (left, 55%)                     │  CONTACTS + ASSETS (right, 45%)       │
│  ─────────────────                    │  ────────────────────────────         │
│                                       │  [search…]  warmth: ▼  tags: ▼        │
│  [history scroll, virtualized]        │  ────────────────────────────         │
│                                       │  ▾ Anna Svensson  ●1  · göteborg      │
│  "Add Anna…"                          │     hardware engineer, podcast        │
│        🟢 query_sql · 220ms           │     [tags: hw, gbg]                   │
│        🟢 mutate_sql · 340ms          │     Assets:                           │
│     I've added Anna with warmth 2…    │       • Adway Studio · ask first      │
│                                       │     ┌──────────────────────────┐      │
│  "Who could help with podcast?"       │     │ raw notes (markdown)     │      │
│        🟡 search_assets · running…    │     │  cursor-blink…           │      │
│                                       │     └──────────────────────────┘      │
│                                       │     [edit notes]  [delete contact]    │
│                                       │  ─────────────                        │
│                                       │  ▸ Bo Larsson    ●3  · stockholm      │
│  ┌────────────────────────────────┐   │                                       │
│  │ [textarea, 2 lines]      [↑]   │   │  ▾ OUR ASSETS                         │
│  └────────────────────────────────┘   │     • 200k SEK convertible            │
└───────────────────────────────────────┴───────────────────────────────────────┘
```

### 1.3 Interactions (the user just stated these)

- **Add via chat** — natural language, streams a response, tool-call status
  pills inline. _("I've added Anna with warmth 2…")_
- **Review on the right** — accordion list, expand for full notes + assets.
  Reading is the primary mode.
- **Delete** — every contact and asset has a delete button. Confirms in a
  small dialog. The AI can also delete (with chat-side confirmation).
- **Edit notes** — inline edit-in-place on the notes field only.
  Other fields (name, warmth, city, tags) are mutated via the AI; the field
  values render as read-only chips. _Rationale: keeps the data model
  consistent with the AI's mutate path; humans don't have to know SQL._
- **Raw-text-as-truth** — `contacts.notes` is a free-form text field; the AI
  is encouraged to write rich human-readable prose there, not structured JSON.
  Structured fields (warmth, tags, city) are extracted for fast filtering;
  prose is for nuance.

### 1.4 What "review them very nicely" means concretely

- Warmth dot uses a meaningful color (green ramp → grey).
- Tags are pills, clickable to filter the list.
- Notes render with whitespace + markdown bold/italic preserved.
- Assets show description + availability inline (no second expand).
- Last-updated timestamp on hover.
- Empty state: friendly copy, an example prompt, links to "try saying…".

### 1.5 Empty states + onboarding

- **First sign-in** → home page shows a one-screen welcome: _"This is your
  network. Tell me about someone you know."_ with three example prompts the
  user can click to populate the composer.
- **Empty chat + empty accordion** → matching empty-state copy on both
  panes; agent suggests starting with a bulk add.

### 1.6 Filtering (toolbar above the accordion)

- **Search input** → debounced 300ms, fires `search_contacts` + `search_assets`
  tools and updates the right pane (independent of the chat).
- **Warmth filter** → multi-select pill: `1` `2` `3` `4` `5`.
- **Tags filter** → multi-select from observed tags.

The filter state is reflected in URL search params so it's shareable +
back/forward-button-safe.

### 1.7 Account / settings page

`/settings`:

- Display name + email (read-only).
- Theme (light / dark / system) — Phase 11.
- **Export my data** → downloads a single JSON file with all contacts + assets +
  chat threads. RLS-scoped via a `export_my_data()` RPC.
- **Delete account** → big red button → confirmation modal → calls the
  deployed `delete-account` Edge Function → signs out → redirects to
  `/sign-in` with a "Your account has been deleted" banner.

---

## 2. Data model (revised, raw-text-friendly)

Current schema is fine. **Two refinements:**

### 2.1 Soft delete on contacts/assets

Add `deleted_at timestamptz` on `contacts` and `assets`. Tools `mutate_sql`
calls `UPDATE … SET deleted_at = now()` instead of `DELETE`. Reads filter
`WHERE deleted_at IS NULL`. Recovery is a one-row update. The `delete-account`
flow still does a hard cascade (because the user asked to be forgotten).

**Migration**: `0008_soft_delete.sql`. Updates `hybrid_search_*` + RLS-friendly
views to hide soft-deleted rows.

### 2.2 An "audit" view for the agent's tool history

`agent_actions` table (already implied by `chat_messages.role='tool'`, but
materialize a flat view): `(id, thread_id, user_id, tool, args jsonb, result
jsonb, error text NULL, duration_ms int, started_at, ended_at)`. The agent
queries it to remember "did I already add Anna?" and the UI shows recent
mutations.

---

## 3. Agent architecture (rebuilt with Incredible patterns)

The current `runAgent.ts` is ~80 lines and trusts the AI SDK to do the right
thing. Several reliability invariants are missing. Listed in order of impact.

### 3.1 Teach-and-retry on recoverable failures

**Why**: The LLM sometimes truncates a tool call mid-stream, or the provider
stalls between SSE events, or returns a 5xx mid-turn. Today these surface as
"Failed to fetch" or empty assistant text.

**What**: Mirror Incredible's `ask_for_text_with_teach_retry`
(`crates/sub-agent-core/src/llm_turn.rs:445–506`):

```ts
const TEACHING = `Your last response was cut short or malformed. Common cause:
tool arguments too large or stream stalled. Please retry. Tips:
- For SQL: include LIMIT 50 or smaller on reads.
- For long notes: keep them under 2KB per mutation.
- One tool call per step.`;

async function runAgentTurnWithRetry(opts: RunAgentOptions): Promise<AgentTurnResult> {
  for (let attempt = 0; attempt <= MAX_TEACH_RETRIES; attempt++) {
    try {
      return await runAgentTurn(opts);
    } catch (err) {
      if (!isRecoverable(err) || attempt === MAX_TEACH_RETRIES) throw err;
      opts.history = [...(opts.history ?? []), { role: 'user', content: TEACHING }];
      recorder.recordTimeline('teach_retry', { attempt: attempt + 1, error: String(err) });
    }
  }
  throw new Error('unreachable');
}
```

**Classify recoverability** (`isRecoverable`):

- `StreamStalled` (no SSE event for 150s) → recoverable.
- `StreamErrored` (provider 5xx mid-stream, content filter, rate limit) →
  recoverable.
- `TruncatedToolCall` (parse error on `arguments_json` after `[DONE]`) →
  recoverable.
- `MalformedHistory` (wire-format invariant violated upstream) → fatal.
- Auth, 401/403, missing env → fatal.

### 3.2 Two timeout budgets

`generateText` has no timeout. Add explicit budgets via `AbortController`:

- **First-chunk timeout**: 8s. If no token / tool call within 8s, abort.
- **Stall timeout**: 150s between events. The Incredible incident from
  2026-05-03 (Cerebras held a connection 60s before `[DONE]`) is what this
  catches.

Both bubble as recoverable errors (so teach-and-retry retries them).

### 3.3 Tool error envelope (the "nudges" the user asked for)

**Why**: When a tool call has wrong parameters or fails, the LLM needs
specific, actionable guidance back — not just "error". Otherwise it retries
the same broken call.

**What**: Every tool's `execute()` returns one of two shapes, **always**:

```ts
type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; hint: string; retriable: boolean };
```

The `hint` field is the _nudge_. Examples:

| Failure                | error                                        | hint                                                                        |
| ---------------------- | -------------------------------------------- | --------------------------------------------------------------------------- |
| Zod validation failure | "validation: tags must be array of strings"  | "Pass tags as `['tag1', 'tag2']`, not a comma-separated string."            |
| SQL syntax error       | "syntax error at or near 'INTO'"             | "INSERT statements need a VALUES clause and a RETURNING clause."            |
| ON CONFLICT used       | "no unique constraint matching"              | "There are no UNIQUE constraints — use plain INSERT, not ON CONFLICT."      |
| RLS denial on insert   | "new row violates row-level security policy" | "Do not pass user_id; the database defaults it to auth.uid()."              |
| Empty SQL              | "empty statement"                            | "Provide a non-empty SQL statement."                                        |
| Wrong tool for the job | (from system prompt rule)                    | "Use search_contacts for natural-language people questions, not query_sql." |

These hints are how the LLM _learns_ mid-turn. Done well, the second call
fixes the first call.

**Implementation**: A `toolWrap(name, schema, handler)` helper in
`packages/app/lib/agent/toolWrap.ts` that:

1. `safeParse` the args with Zod. On failure → `{ ok: false, error, hint }`
   with hint derived from the Zod issue path.
2. `try/catch` the handler. On Postgres error code, look up `PG_HINTS[code]`
   to attach a hint.
3. Time the call (start/end timestamps).
4. Record both to the debug recorder (`toolCall` + `toolResult` events).

### 3.4 `normalize_history` wire-format defense

OpenAI-compatible chat completions require: every `assistant` message with
`tool_calls` MUST be immediately followed by `tool` messages with matching
`tool_call_id`s. If the wire format is violated, Cerebras and a few other
providers hallucinate or 400.

The AI SDK _usually_ does this right, but if the agent loop is cancelled
mid-turn, we can end up with an orphan `assistant{tool_calls}` and no
matching tool result. Mirror Incredible's `normalize_history` (`crates/orchestrator/src/normalize.rs`):

```ts
function normalizeHistory(messages: AgentMessage[]): AgentMessage[] {
  // Pass 1: collect all tool messages by tool_call_id (last-one-wins).
  // Pass 2: re-emit non-tool messages in order; after every
  //         assistant{tool_calls}, inline matching tool result OR
  //         synthesize `{ error: "dropped by runtime" }` placeholder.
  // Pass 3: assert last message is not assistant{tool_calls}. If it is,
  //         throw MalformedHistory (which is fatal — investigate upstream).
}
```

Run this at the entry of `runAgentTurn`, before passing to `generateText`.

### 3.5 Stale-job semantics (future-proofing)

Already implemented in `embed-batch/core.ts`: jobs whose source row was deleted
get drained, not retried forever. Mirror for any future queue worker.

---

## 4. Tools (hardened)

### 4.1 The four agent tools, with envelopes

```ts
// packages/app/lib/agent/tools.ts (after refactor)

const queryHints = {
  '42P01': 'Table does not exist. Valid tables: contacts, assets, chat_threads, chat_messages.',
  '42703':
    'Column does not exist. Run `SELECT column_name FROM information_schema.columns WHERE table_name = …` first.',
  '42601':
    'Syntax error. Common: INSERT needs VALUES, UPDATE needs SET, DELETE needs WHERE (for safety).',
  '42P10': 'No UNIQUE constraint — do not use ON CONFLICT. Use plain INSERT.',
  '23505': 'Unique constraint violation — the row may already exist.',
  '23503': 'Foreign key violation — the referenced row does not exist.',
} as const;

export const tools = {
  query_sql: toolWrap('query_sql', QuerySchema, async ({ sql }) => {
    const { data, error } = await supabase.rpc('query_sql', { query: sql });
    if (error) {
      const hint = queryHints[error.code] ?? 'See the schema in your system prompt.';
      return { ok: false, error: error.message, hint, retriable: false };
    }
    return { ok: true, data };
  }),
  // … same shape for mutate_sql, search_contacts, search_assets
};
```

### 4.2 Streaming tool-call status

Each tool, when called from the UI, emits status updates the chat can show
("running query_sql…", "✓ done in 220ms", "✗ failed: …"). AI SDK's `streamText`
exposes `onStepFinish` for this; we forward those to a React state slot.

### 4.3 Contract tests (one per tool)

`packages/app/lib/agent/tools.test.ts`:

```ts
describe('tools.mutate_sql', () => {
  it('returns ok+data on a valid INSERT…RETURNING', async () => { … });
  it('returns ok:false + ON-CONFLICT hint on 42P10', async () => { … });
  it('returns ok:false + RLS-hint when user_id is passed', async () => { … });
  it('rejects SELECT with a clear hint', async () => { … });
});
```

These use `@reknowable/test-utils`'s `testUserHarness` against a local
Supabase — they fail in <2s if RLS or the SQL helper functions drift.

### 4.4 Result inlining (the LLM sees the error verbatim)

The AI SDK already inlines tool results into the next LLM turn via
`tool_result` messages. With our envelope, the LLM sees:

```json
{ "role": "tool", "content": "{\"ok\":false,\"error\":\"…\",\"hint\":\"Pass tags as ['tag1',…]\"}" }
```

The model reads the hint and self-corrects. This is the entire mechanism for
the user's "nudges" requirement.

---

## 5. Streaming UX

### 5.1 Switch `runAgent.ts` to `streamText`

`generateText` blocks until the entire turn is done. Switch to `streamText`
with `stopWhen: stepCountIs(10)` and `onChunk` / `onStepFinish` callbacks.
This streams partial text + tool-call events live to the UI.

### 5.2 React state shape

```ts
type StreamingMessage = {
  id: string;
  role: 'assistant';
  text: string; // grows token-by-token
  toolCalls: Array<{
    id: string;
    name: string;
    status: 'running' | 'done' | 'error';
    durationMs?: number;
    error?: string;
  }>;
  finished: boolean;
};
```

`useAgentLoop` updates the slot reactively; `MessageBubble` re-renders on each
chunk. Token bubble appears within ~500ms of pressing Send.

### 5.3 Mid-flight cancel

A "stop" button on the chat thread aborts the active `AbortController`. The
partial message is preserved with a "(stopped)" tag. History still records
the partial turn so the LLM sees what was interrupted (mirrors Incredible's
`(interrupted)` annotation pattern — `CLAUDE.md §10.7`).

### 5.4 Per-tool status pills

```
🟢 query_sql · 220ms          (success)
🟡 search_contacts · running…  (in-flight)
🔴 mutate_sql · failed         (errored — click for details)
```

A tooltip on the pill shows the actual args + result excerpt.

### 5.5 Realtime accordion refresh

`useContacts` (already implemented) subscribes to `postgres_changes` and
refetches on `contacts`/`assets` writes. The accordion updates within ~100ms
of a mutate tool call landing — the user _sees_ the contact appear while the
agent is still finishing its sentence.

---

## 6. Model selection

### 6.1 Default: `anthropic/claude-sonnet-4.5` via OpenRouter

Currently using `openai/gpt-4o`. Per the user's "decent AI model" note, switch
to Claude Sonnet 4.5 — better at SQL, follows multi-step instructions more
faithfully, smaller hallucination rate on schema. Cost is comparable per
output token; latency is similar.

`MODEL_ID = 'anthropic/claude-sonnet-4-5'` in `systemPrompt.ts`.

### 6.2 Fallback chain (Phase 12)

If primary 5xx's or rate-limits, fall back to `openai/gpt-4o`. Recorded in
`metadata.json` as `attempt: 'primary' | 'fallback'` per Incredible's
`LlmAttempt` enum.

### 6.3 Per-tool model override (later)

Tool-only call (no streaming text needed) can use a smaller cheaper model.
Not Phase 9 territory.

---

## 7. Debug & observability (the "I can always validate myself" goal)

The user's frustration during this session was repeatedly debugging
production issues without being able to _see_ what happened. This entire
section is about closing that gap.

### 7.1 Byte-exact LLM I/O capture

Today's `nodeDebugRecorder.ts` serializes JS objects via
`JSON.stringify(body, null, 2)`. **That's lying** — the actual HTTP body the
AI SDK sends has different ordering, no whitespace, possibly snake_case'd
fields. Fix:

- Intercept the actual `fetch` call inside the AI SDK provider via
  `createOpenAICompatible({ fetch: instrumentedFetch })` — capture the raw
  request body bytes + raw response stream chunks.
- Write `request.json` as the actual bytes (parse only for display, store the
  bytes).
- Write `response.sse` as the raw SSE byte stream, untouched.

### 7.2 Timeline events with `at_ms` + free-form tags

Replace the current ad-hoc events with Incredible's pattern:

```ts
recorder.recordTimeline('llm/request', { turn, model, message_count });
recorder.recordTimeline('llm/first_token', { turn, ttft_ms });
recorder.recordTimeline('tool/start', { id, name });
recorder.recordTimeline('tool/end', { id, name, duration_ms, ok });
recorder.recordTimeline('db/write', { table, rows_affected });
recorder.recordTimeline('teach_retry', { attempt, error });
```

JSONL, grep-friendly. `grep '"tool/' timeline.jsonl | jq -s ' length'` →
total tool calls in a turn. `grep '"error"' timeline.jsonl` → every failure.

### 7.3 Per-turn folder layout

```
~/Documents/reknowable-debug/<iso-ts>-<adjective>-<adjective>-<noun>/
├── metadata.json              # user_id, thread_id, transcript, status, settings
├── settings.json              # MODEL_ID, OPENROUTER vs direct, env snapshot
├── timings.json               # durations_ms.{first_token, agent_total, tool_total}
├── timeline.jsonl             # every event with at_ms
├── llm/turn-NN/
│   ├── request.json           # BYTE-EXACT (raw bytes, not re-serialized)
│   ├── response.sse           # BYTE-EXACT raw SSE
│   └── request.fallback.json  # only if fallback fired
└── tool_calls/<id>.json       # tool, args, result, started_at, ended_at
```

### 7.4 Async writes (off-thread)

Wrap the recorder in a `Worker` (`worker_threads` in Node) so disk I/O never
blocks the agent hot path. Drop writes on full queue with a single diagnostic.
Per Incredible `crates/debug-recorder/src/async_writer.rs`.

### 7.5 Replay system

`pnpm agent:replay <slug>` — reads the byte-exact `request.json` from a
debug folder, sends it to OpenRouter again, diffs the response against the
recorded one. Catches regressions in the system prompt / tool schemas
without needing a real user turn.

`pnpm agent:replay <slug> --against-local` — sends to the locally-served Edge
Function so you can iterate on `agent-chat` server logic against a known
input.

### 7.6 Common-investigation table (lives at `docs/debug.md`)

| Question                           | First file to read                          |
| ---------------------------------- | ------------------------------------------- |
| "Why was that turn slow?"          | `timings.json` → `durations_ms.first_token` |
| "What did the LLM actually see?"   | `llm/turn-NN/request.json` (raw bytes)      |
| "Did the tool call actually fire?" | `timeline.jsonl` → `grep '"tool/start"'`    |
| "Did mutate_sql succeed?"          | `tool_calls/<id>.json` → `result.ok`        |
| "Which model + provider was used?" | `settings.json`                             |
| "Why did the agent retry?"         | `timeline.jsonl` → `grep '"teach_retry"'`   |
| "What happened in production?"     | Run `pnpm agent:replay <slug>` to reproduce |

---

## 8. Testing strategy (no Playwright)

Per the user's explicit preference. Coverage that actually proves correctness.

### 8.1 Vitest unit tests at every module boundary

| Module                          | What's tested                                             |
| ------------------------------- | --------------------------------------------------------- |
| `lib/env`                       | every env-var resolution path, fallback, error            |
| `lib/supabase`                  | client factory, singleton, browser-only guard             |
| `lib/agent/tools`               | each tool: happy path + every error variant + hint string |
| `lib/agent/toolWrap`            | Zod failure → envelope; PG code → hint mapping            |
| `lib/agent/runAgent`            | teach-retry loop; timeout abort; normalize_history        |
| `lib/agent/debugRecorder`       | turn counter; byte-exact write; queue drop on full        |
| `features/auth/SignInScreen`    | render; submit; error display                             |
| `features/chat/MessageBubble`   | streaming chunks; tool-pill status                        |
| `features/contacts/useContacts` | realtime refetch; filter; sort                            |

### 8.2 Integration tests against real Supabase (`supabase/tests/`)

Already 47 tests; add:

- `agent_loop.test.ts` — drive `runAgentTurnWithRetry` with a stubbed LLM
  (returns a fixed `tool_calls` shape), assert real tool execution against
  real Supabase. **No browser.**
- `tools_hints.test.ts` — call each tool with deliberately wrong inputs;
  assert the `hint` string matches the expected guidance.

### 8.3 Contract tests for the agent ↔ Edge Function boundary

A new `scripts/verify-agent-contract.ts` that:

1. Mounts the Edge Function code as a local Hono app (no `supabase functions
serve` needed — just import `index.ts` and `app.fetch(req)`).
2. Drives it through the **real AI SDK** with `createOpenAICompatible`.
3. Asserts streaming + non-streaming both round-trip cleanly.

This is the test that would have caught the `/chat/completions` 404 + the
`stream:true` override bug in 5 seconds locally.

### 8.4 Snapshot tests for prompt + tool schemas

`systemPrompt.snap`, `tools.snap`. Any change requires an explicit
`pnpm test -u` and a commit message that explains the prompt change. Same as
Incredible's reducer-snapshot pattern.

### 8.5 Property-based tests for the wire-format normalizer

```ts
test.prop([histories()])('normalize never produces a trailing assistant{tool_calls}', (h) => {
  const out = normalizeHistory(h);
  const last = out[out.length - 1];
  expect(!(last?.role === 'assistant' && last.tool_calls)).toBe(true);
});
```

`fast-check` generates random valid+invalid histories. Catches edge cases a
human won't think of.

### 8.6 No browser; no Playwright

The user explicitly removed this. Components are tested with
`@testing-library/react`; integration via Node. The cookie/SSR bug we hit is
caught by `verify:deployed` (already updated to drive the real AI SDK).

### 8.7 `verify:all` becomes the contract

```
pnpm verify:all
├── verify:scaffold      ← typecheck + tests + build
├── verify:db            ← migrations + RLS + DB tests
├── verify:auth          ← integration + component tests
├── verify:embeddings    ← real OpenRouter embedding
├── verify:agent-loop    ← real 3-turn flow against real OpenRouter
├── verify:agent-contract ← AI SDK + locally-mounted Edge Function (new)
├── verify:account-deletion ← cascade test
└── verify:deployed      ← real AI SDK against deployed prod (new)
```

Green = ship.

---

## 9. Module hygiene

### 9.1 Per-module `CLAUDE.md` template (mandatory sections)

Every `[M]` directory's `CLAUDE.md` must have, in order:

1. `# <module>` heading + 1-paragraph description.
2. `## Public API` — what's re-exported from `index.ts`. Anything else is
   private.
3. `## Allowed dependencies` — bullets of every dep with a 1-line WHY.
4. `## What's banned in this module` — module-specific anti-patterns.
5. `## Tests (MANDATORY)` — what's covered + how Claude verifies the module.
6. `## Non-goals` — explicit scope boundaries.
7. `## Recent design decisions` — append-only dated log.

### 9.2 Dependency direction (enforced by ESLint)

```
apps/* ─→ packages/app ─→ packages/{ui, types}
```

Never reverse, never cross-cutting. `eslint-plugin-no-restricted-imports` in
`.eslintrc.json` rejects an `apps/web` import in `packages/app/src/`.

### 9.3 File-size cap (500 LOC, enforced in CI)

GitHub Action step: `find packages apps supabase -name '*.ts' -o -name '*.tsx' | xargs wc -l | awk '$1 > 500 {print; fail=1} END {exit fail+0}'`.

### 9.4 Banned in non-test code (workspace-wide)

- `unwrap`, `expect`, `panic`, `as any`, raw `console.log`, `.skip()`,
  `--no-verify`, direct `fetch` outside `lib/`, global mutable state.

ESLint flags `console.log` workspace-wide. Use the recorder.

---

## 10. UI plan in detail (every screen)

### 10.1 Sign-in / sign-up

Current state: works. Polish:

- Tighter visual (max-width 360px, more padding, better focus rings).
- Show the loading state on the submit button (spinner inside).
- Surface the actual Supabase error message clearly (was: tiny red text;
  now: prominent banner).

### 10.2 Home (the two-pane)

Already specced in §1.2. New components/states:

- **Loading state** (initial mount): skeleton rows in the accordion.
- **Empty state**: friendly copy + 3 starter prompts.
- **Error state** (Supabase unreachable): toast + retry button.

### 10.3 Chat thread

- Message bubble: user (right, dark) / assistant (left, light) / tool (inline,
  muted).
- Tool-call pills inside assistant bubble (color-coded).
- Streaming cursor (`▋`) at the end of the in-flight text.
- Stop button visible while streaming.
- Composer: textarea grows to 6 lines max, then scrolls. Cmd+Enter submits.

### 10.4 Contacts accordion

- Header row: name + warmth dot + city. Click to expand.
- Expanded:
  - Tag pills (filterable on click).
  - Notes: markdown-rendered prose; click to edit.
  - Assets list: name + availability + description.
  - Actions: `[Edit notes]` `[Delete]`.
- Hover: last-updated timestamp.

### 10.5 Edit-notes inline editor

- Click notes → textarea appears in place, autoresized.
- Save on blur OR Cmd+Enter, debounced 600ms.
- Failure toast on save error; restores previous value.

### 10.6 Delete confirmation

Small dialog: _"Delete Anna Svensson? Their assets stay (will move to 'our
assets'). Undo within 60s by sending 'undo' in chat."_

Soft-deletes (per §2.1). Agent can undo via `UPDATE contacts SET deleted_at =
NULL WHERE id = …`.

### 10.7 Toolbar (above accordion)

- **Search input** → debounced; updates accordion only (not chat).
- **Warmth chips** → multi-select.
- **Tag chips** → multi-select.
- All three sync to URL search params.

### 10.8 Account / settings (`/settings`)

- Email + display name (read-only).
- Theme picker (Phase 11).
- Export data: JSON download.
- Delete account: red button → confirmation dialog → calls `delete-account`.

### 10.9 Error boundary

A top-level React error boundary catches unhandled exceptions and renders a
"Something went wrong" page with a "Reload" button + a link to the debug
folder (in dev mode).

### 10.10 Accessibility

- Every interactive element has a label.
- Tab order is logical (composer focused on mount).
- Keyboard shortcuts: `/` focus composer; `Esc` close any modal; `Cmd+K`
  open command palette (Phase 11).

### 10.11 Mobile (≤768px)

- Single pane with bottom-tab toggle: `[ Chat ]  [ Contacts ]`.
- Same components, narrower layout.
- Keyboard-aware composer (Expo wraps this for native; web uses
  visual-viewport hooks).

---

## 11. Implementation phases

Each phase ends with `verify:<phase>` green and a clean commit. No phase is
"done" until its tests + verify pass.

### Phase 9 — Agent hardening (the user's main ask)

Files touched: `packages/app/src/lib/agent/` (most files), `supabase/tests/`.

- Add `toolWrap.ts` with the error envelope + PG-code hints.
- Refactor `tools.ts` to use `toolWrap`.
- Add `runAgentTurnWithRetry` with teach-and-retry.
- Add timeout budgets via `AbortController`.
- Add `normalizeHistory` + run it before every LLM call.
- Switch `MODEL_ID` to `anthropic/claude-sonnet-4-5`.
- New tests: `tools.test.ts` (every error → hint), `runAgent.test.ts`
  (teach-retry triggers correctly), `normalizeHistory.test.ts`
  (property-based via fast-check).
- New verify: `verify:agent-contract` mounts Edge Function locally, drives
  via AI SDK, asserts streaming + non-streaming.

### Phase 10 — Streaming UX

Files: `packages/app/src/features/chat/` + `packages/app/src/lib/agent/runAgent.ts`.

- Switch `runAgent.ts` to `streamText` with `onChunk` + `onStepFinish`.
- `useAgentLoop` exposes a streaming `currentMessage` slot.
- `MessageBubble` renders partial text + tool pills.
- Stop button + cancellation via AbortController.
- Tests: hook tests with a fake provider that emits a fixture stream.

### Phase 11 — UX polish

Files: `packages/app/src/features/{contacts,chat,home}/`, `apps/web/app/settings/`.

- Soft-delete migration (`0008_soft_delete.sql`) + update hybrid_search to
  filter `deleted_at IS NULL`.
- Edit-notes inline editor.
- Delete confirmation dialog + undo via chat.
- Search/filter toolbar.
- `/settings` page with export + delete account.
- Onboarding empty state + starter prompts.
- Theme picker (light/dark/system).

### Phase 12 — Debug recorder v2

Files: `packages/app/src/lib/agent/{nodeDebugRecorder, debugRecorder}.ts` +
new `instrumentedFetch.ts`.

- `instrumentedFetch` wraps the AI SDK provider, captures raw bytes.
- Recorder writes byte-exact `request.json` + `response.sse`.
- Timeline schema with `at_ms` + free-form tags.
- `settings.json` + `timings.json` written per trace.
- Async writes via worker thread.
- `pnpm agent:replay <slug>` for replay.
- `docs/debug.md` with the common-investigation table.

### Phase 13 — Test coverage to 100% (per module)

Walk every `packages/app/src/` file; ensure every export has a test. Property-
based tests for normalizer + retry loop. Snapshot tests for system prompt

- tool schemas. Contract tests for every tool.

### Phase 14 — Production ops

- Rate limiting on the agent-chat function (per-user, per-day token cap).
- Sentry (or equivalent) on the web app + Edge Functions.
- Structured logs from Edge Functions piped to Supabase log explorer.
- CI: GitHub Actions runs `verify:all` on every push; auto-deploy on green.
- Database backups (Supabase Pro features it; document the restore drill).
- Alert on: agent error rate > 1% over 5 min, embedding queue depth > 1000.

---

## 12. Definition of "done"

The platform is done — ready to put in front of anyone — when ALL of:

1. `pnpm verify:all` green (~3 min locally, ~5 min in CI).
2. A new user can sign up, chat with the agent, see their contacts in the
   accordion, edit notes, delete contacts, search semantically, delete their
   account. Without any console errors. Without any "Failed to fetch".
3. Every module under `apps/`, `packages/`, `supabase/functions/` has a
   `CLAUDE.md` matching the §9.1 template.
4. Every public symbol in `packages/app/src/lib/` has a test that fails on
   broken behavior.
5. The debug recorder writes byte-exact LLM I/O for every turn. A user reports
   a bug → I read one folder under `~/Documents/reknowable-debug/` → I know
   what happened, no questions to ask the user.
6. `pnpm agent:replay <slug>` can replay any production-recorded turn against
   any local code change.
7. The system prompt + tool schemas are snapshot-tested.
8. The deployed Vercel site passes `verify:deployed` end-to-end.

---

## Sources (Incredible patterns this plan reuses)

| Pattern                                          | Incredible source                                             |
| ------------------------------------------------ | ------------------------------------------------------------- |
| Teach-and-retry on recoverable LLM errors        | `crates/sub-agent-core/src/llm_turn.rs:445–506`               |
| Wire-format normalization (`normalize_history`)  | `crates/orchestrator/src/normalize.rs`                        |
| Tool error envelope (defensive parse + hint)     | `crates/shell/src/runtime/orch/tool_parse.rs:27–28`           |
| Truncated tool-call detection                    | `crates/sub-agent-core/src/llm_turn.rs:97–102`                |
| Ownership invariants (queue → claimed → history) | `Incredible/CLAUDE.md §10.12`                                 |
| Universal staging + commit gate                  | `crates/shell/src/runtime/speculative.rs`, `CLAUDE.md §10.11` |
| Byte-exact LLM I/O capture                       | `crates/debug-recorder/src/recorder.rs:65–86`                 |
| Timeline events (`at_ms` + tag)                  | `crates/debug-recorder/src/recorder.rs:34–46`                 |
| Async off-thread debug writes                    | `crates/debug-recorder/src/async_writer.rs:49–251`            |
| Fallback provider tracking                       | `crates/debug-recorder/src/recorder.rs:22–29`                 |
| Per-module `CLAUDE.md` template                  | every `crates/*/CLAUDE.md`                                    |
| Banned-patterns auto-reject list                 | `Incredible/CLAUDE.md §8`                                     |
| Verify scripts + one-step proof                  | `Incredible/CLAUDE.md §7`                                     |
| Hexagonal architecture (ports + adapters)        | `Incredible/CLAUDE.md §3`                                     |
| First-chunk + stall timeout budgets              | `crates/orchestrator/src/lib.rs:23–48`                        |
| `(interrupted)` annotation pattern               | `Incredible/CLAUDE.md §10.7`                                  |
