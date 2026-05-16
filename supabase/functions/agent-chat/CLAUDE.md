# supabase/functions/agent-chat

Edge Function (Deno) that proxies LLM completion requests through a
**fallback chain of providers** and streams the SSE response back to the
client. Provider API keys never leave the server.

The client orchestrates the agent loop (Vercel AI SDK 5) and calls this
function once per LLM hop. Tool execution happens client-side against
Supabase RPCs (RLS-scoped).

## Provider chain

Faithful port of the Incredible project's `LlmClient::with_fallback`
pattern from `crates/llm-client/src/stream.rs`. Order is fixed:

1. **Cerebras GLM 4.7** — `zai-glm-4.7`, `reasoning_effort: "low"`, `reasoning_format: "hidden"`
2. **Groq gpt-oss-120b** — `openai/gpt-oss-120b`, `reasoning_effort: "low"`, `include_reasoning: false`
3. **Fireworks Kimi K2.5** — `accounts/fireworks/models/kimi-k2p5`, `reasoning_effort: "low"`
4. **OpenRouter Gemini 3 Flash** — `google/gemini-3-flash-preview`

All tiers use `temperature: 0.6` and Bearer auth. The first tier whose
API key is configured becomes the primary; tiers without a key are
silently skipped at chain build time. See `./llm/provider.ts` for the
authoritative configs.

### Fallback semantics

- A failure on a tier triggers a fallback to the next tier **only if**
  the failure is pre-stream (no SSE bytes received yet) AND retriable.
- Retriable = network error / HTTP 429 / HTTP 5xx (`./llm/errors.ts::isRetriable`).
- 4xx-other-than-429 is **not** retried — bad auth or schema is our bug;
  retrying would waste the fallback's quota.
- Aborts (user disconnect) are **never** retried.
- Mid-stream errors are **never** retried — once SSE bytes have started
  flowing, swapping providers would corrupt tool-call assembly.

The response headers expose `x-llm-provider` (which tier won) and, when
fallbacks fired, `x-llm-fallback-trail` (compact `provider=error` pairs).

## Public API

- `POST /` (with Supabase user bearer): body is a JSON object matching
  the OpenAI `/v1/chat/completions` shape (`messages`, `tools`, `stream`,
  `tool_choice`, `max_tokens`, …). Caller's `model` and `temperature`
  fields are **ignored** — each provider has its own. Streams the SSE
  response back with `Content-Type: text/event-stream`.
- `POST /chat/completions` — same handler (the AI SDK appends this).
- `GET /health` — liveness probe.

## Files

- `index.ts` — Hono entrypoint. Parses, builds the chain, streams response back.
- `llm/provider.ts` — `ProviderConfig` per provider (endpoint, model, reasoning knobs).
- `llm/errors.ts` — `LlmError` tagged union + `isRetriable` classifier.
- `llm/body.ts` — `buildRequestBody` (caller body + extraBody merge).
- `llm/client.ts` — `LlmClient` class: `singleAttempt` + `withFallback` + `streamChat`.
- `llm/chain.ts` — `buildProductionChain(env)` assembles the 4-deep ladder.

## Cancellation

The client's disconnect fires `c.req.raw.signal`, which we forward to
`fetch` as the upstream signal. On abort, the in-flight upstream request
is dropped and the chain bails without attempting the fallback (aborts
are user-initiated; the user doesn't want a different provider).

## Auth

The function reads `Authorization: Bearer <user-jwt>` but does not
validate it — Supabase's gateway has already done that before our
function runs. We forward NOTHING about the user to upstream providers
(no metadata, no IDs). Each provider receives a static `user` value
(per `extraBody`) that gives that provider's prefix cache a stable
shard hint — same user value → same backend → warmer cache.

## What's banned in this function

- Logging the user's JWT or API keys
- Forwarding user identity to upstream providers
- Mid-stream provider switching (would corrupt tool-call assembly)
- Validating tool_calls or otherwise inspecting message content
- Cache: every call goes upstream; we never serve from a cache

## Required env

Set as Edge Function secrets in production (`supabase secrets set`),
or in `supabase/.env` locally:

- `CEREBRAS_API_KEY` — Cerebras
- `GROQ_API_KEY` — Groq
- `FIREWORKS_API_KEY` — Fireworks
- `OPENROUTER_API_KEY` — OpenRouter

At least one must be set; the chain skips tiers without a key.

## Tests (MANDATORY)

- `supabase/tests/agent_chat.test.ts` — unit tests for:
  - `buildRequestBody` body shape + extraBody merge + tools handling
  - `isRetriable` error classification (network / request / http_status)
  - `buildProductionChain` order + skip-missing-key + no-keys-throws
- End-to-end streaming + fallback walk is exercised by Phase 5's
  `verify:agent-loop` (drives a real conversation through this function).

## Recent design decisions

- 2026-05-15: created. Raw `new Response(upstream.body)` pass-through — no
  TransformStream — to avoid the Deno cancel-crash issue (deno#27715) and
  keep latency at one I/O hop.
- 2026-05-16: replaced single-OpenRouter wiring with the 4-tier
  Cerebras → Groq → Fireworks → OpenRouter chain. Port of Incredible's
  `LlmClient::with_fallback` pattern (`crates/llm-client/src/stream.rs`).
  Caller's `model` field is now ignored — each provider has its own.
