// embed-query — proxies a single text → embedding through OpenRouter.
//
// Browser calls this from within the search_contacts / search_assets tool
// so the OpenRouter API key never leaves the server.
//
// Auth: any authenticated Supabase user can call this. We don't rate-limit
// here — Supabase Edge gateway already does basic rate limiting. Production
// hardening (Phase 8) tightens this with per-user quotas.

import { Hono } from 'jsr:@hono/hono@^4.7';

const app = new Hono();

app.post('/', async (c) => {
  const auth = c.req.header('Authorization');
  if (!auth) return c.text('Missing Authorization header', 401);

  let body: { text: string };
  try {
    body = (await c.req.json()) as { text: string };
  } catch {
    return c.text('Invalid JSON body', 400);
  }
  if (!body.text || typeof body.text !== 'string') {
    return c.text('Field `text` (non-empty string) is required', 400);
  }

  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!openrouterKey) return c.text('OPENROUTER_API_KEY missing', 500);

  const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openrouterKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://network-ai.app',
      'X-Title': 'network-ai',
    },
    body: JSON.stringify({
      model: 'openai/text-embedding-3-small',
      input: [body.text],
    }),
    signal: c.req.raw.signal,
  });

  if (!res.ok) {
    return c.text(`OpenRouter ${res.status}: ${await res.text()}`, res.status as never);
  }

  const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return c.json({ embedding: data.data[0].embedding });
});

app.get('/health', (c) => c.json({ ok: true }));

Deno.serve(app.fetch);
