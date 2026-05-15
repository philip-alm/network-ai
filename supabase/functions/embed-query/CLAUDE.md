# supabase/functions/embed-query

Edge Function that turns one text string into a 1536-dim embedding vector via
OpenRouter. Used by the browser's search_contacts / search_assets tools so the
OpenRouter key never reaches the client.

## Public API

- `POST /` (auth required): `{ text: string } → { embedding: number[] }`
- `GET /health`: liveness.

## Dependencies

- Hono on Deno
- `OPENROUTER_API_KEY` env (set via `supabase secrets set`)

## Tests

The shape is identical to embed-batch's embed function. Coverage is via
`verify:agent-loop` which exercises it through the search\_\* tools.
