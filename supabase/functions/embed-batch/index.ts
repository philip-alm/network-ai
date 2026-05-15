// Deno entrypoint. Run locally via `supabase functions serve embed-batch`.
//
// Required env (set in Supabase dashboard "Edge Function Secrets" for remote,
// or in `supabase/.env` for local serving):
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//   - OPENROUTER_API_KEY

import { Hono } from 'jsr:@hono/hono@^4.7';
import { createClient } from 'jsr:@supabase/supabase-js@^2.50';
import { processOneBatch, type EmbedFn, EMBEDDING_MODEL } from './core.ts';

const app = new Hono();

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const openrouterEmbed: EmbedFn = async (texts) => {
  const key = Deno.env.get('OPENROUTER_API_KEY');
  if (!key) throw new Error('OPENROUTER_API_KEY missing in Edge Function secrets');

  const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://network-ai.app',
      'X-Title': 'network-ai',
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter embeddings failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return data.data.map((d) => d.embedding);
};

app.post('/', async (c) => {
  try {
    const result = await processOneBatch(supabase, openrouterEmbed);
    return c.json(result);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.get('/health', (c) => c.json({ ok: true, model: EMBEDDING_MODEL }));

Deno.serve(app.fetch);
