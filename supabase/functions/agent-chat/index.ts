// Deno entrypoint. Run locally via `supabase functions serve agent-chat`.
//
// Required env (Edge Function secrets for remote, or `supabase/.env` locally):
//   - OPENROUTER_API_KEY

import { Hono } from 'jsr:@hono/hono@^4.7';
import { cors } from 'jsr:@hono/hono@^4.7/cors';
import { buildUpstreamRequest, STREAM_RESPONSE_HEADERS, type ChatRequest } from './core.ts';

// basePath: the function is invoked at /functions/v1/agent-chat — Hono sees
// the path verbatim. Mounting at /agent-chat keeps the route handlers clean.
const app = new Hono().basePath('/agent-chat');

// CORS: browser clients from any origin can POST here — we still authenticate
// via the user JWT. OPTIONS preflight is handled automatically.
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type', 'apikey', 'x-client-info'],
    maxAge: 600,
  }),
);

app.get('/health', (c) => c.json({ ok: true }));

app.post('/', async (c) => {
  const auth = c.req.header('Authorization');
  if (!auth) {
    return c.text('Missing Authorization header', 401);
  }

  let body: ChatRequest;
  try {
    body = (await c.req.json()) as ChatRequest;
  } catch {
    return c.text('Invalid JSON body', 400);
  }

  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!openrouterKey) {
    return c.text('OPENROUTER_API_KEY missing in Edge Function secrets', 500);
  }

  let upstream: Response;
  try {
    const { url, init } = buildUpstreamRequest(body, {
      openrouterKey,
      referer: 'https://network-ai.app',
      title: 'network-ai',
    });
    upstream = await fetch(url, { ...init, signal: c.req.raw.signal });
  } catch (err) {
    return c.text(
      `agent-chat: upstream request build failed — ${err instanceof Error ? err.message : String(err)}`,
      400,
    );
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    return c.text(`OpenRouter ${upstream.status}: ${detail}`, upstream.status as never);
  }

  // Raw pass-through — preserves cancellation semantics and avoids the
  // Deno transform-stream cancel crash (deno#27715).
  return new Response(upstream.body, { headers: STREAM_RESPONSE_HEADERS });
});

Deno.serve(app.fetch);
