# supabase/functions/agent-chat

Edge Function (Deno) that proxies LLM completion requests to OpenRouter and
streams the SSE response back to the client. The OpenRouter API key never
leaves the server.

The client orchestrates the agent loop (Vercel AI SDK 5) and calls this
function once per LLM hop. Tool execution happens client-side against
Supabase RPCs (RLS-scoped).

## Public API

- `POST /` (with Supabase user bearer): body is a JSON object matching
  OpenRouter's `/api/v1/chat/completions` shape. Streams the SSE response
  back with `Content-Type: text/event-stream`.
- `GET /health`: liveness probe.

## Files

- `index.ts` — Deno entrypoint, Hono, SSE pass-through with AbortSignal propagation.
- `core.ts` — pure helpers: building the upstream request, validating user auth header. Node-importable for tests.

## Cancellation

When the client disconnects, `c.req.raw.signal` fires. Passing it as the
`signal` of the upstream `fetch` cancels the OpenRouter request in flight,
so we stop being billed for tokens the user never sees.

## Auth

The function reads the `Authorization: Bearer <user-jwt>` header but does
not validate it — Supabase's gateway has already done that before our
function runs. We forward NOTHING about the user to OpenRouter (no
metadata, no IDs); the request is anonymous from OpenRouter's POV.

## What's banned in this function

- Logging the user's JWT
- Forwarding user identity to OpenRouter
- Validating tool_calls or otherwise inspecting message content
- Cache: every call goes upstream; we never serve from a cache

## Tests (MANDATORY)

- `supabase/tests/agent_chat.test.ts` — unit-tests `buildUpstreamRequest()`
  in core.ts to lock in the request shape.
- End-to-end streaming is exercised by Phase 5's `verify:agent-loop`
  (which drives a real conversation through this function).

## Recent design decisions

- 2026-05-15: created. Raw `new Response(upstream.body)` pass-through — no
  TransformStream — to avoid the Deno cancel-crash issue (deno#27715) and
  keep latency at one I/O hop.
