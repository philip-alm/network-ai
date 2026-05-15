// embed-query — proxies a single text → embedding through OpenRouter.

import { Hono } from 'jsr:@hono/hono@^4.7';
import { cors } from 'jsr:@hono/hono@^4.7/cors';
import { log, makeRequestId } from '../_shared/log.ts';

const app = new Hono().basePath('/embed-query');

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type', 'apikey', 'x-client-info', 'x-request-id'],
    exposeHeaders: ['x-request-id'],
    maxAge: 600,
  }),
);

app.get('/health', (c) => c.json({ ok: true }));

app.post('/', async (c) => {
  const reqId = makeRequestId(c.req.raw);
  const ctx = { function: 'embed-query', request_id: reqId };
  const t0 = performance.now();

  const auth = c.req.header('Authorization');
  if (!auth) {
    log('warn', ctx, 'auth.missing');
    return c.text('Missing Authorization header', 401, { 'x-request-id': reqId });
  }

  let body: { text: string };
  try {
    body = (await c.req.json()) as { text: string };
  } catch {
    log('warn', ctx, 'body.invalid_json');
    return c.text('Invalid JSON body', 400, { 'x-request-id': reqId });
  }
  if (!body.text || typeof body.text !== 'string') {
    log('warn', ctx, 'body.missing_text');
    return c.text('Field `text` (non-empty string) is required', 400, { 'x-request-id': reqId });
  }
  log('info', ctx, 'request.received', { text_length: body.text.length });

  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!openrouterKey) {
    log('error', ctx, 'env.openrouter_key_missing');
    return c.text('OPENROUTER_API_KEY missing', 500, { 'x-request-id': reqId });
  }

  const tUpstream = performance.now();
  const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openrouterKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://network-ai.app',
      'X-Title': 'network-ai',
    },
    body: JSON.stringify({ model: 'openai/text-embedding-3-small', input: [body.text] }),
    signal: c.req.raw.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    log('error', ctx, 'upstream.error', { status: res.status, detail: text.slice(0, 500) });
    return c.text(`OpenRouter ${res.status}: ${text}`, res.status as never, {
      'x-request-id': reqId,
    });
  }

  const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
  log('info', ctx, 'response.ok', {
    total_ms: Math.round(performance.now() - t0),
    upstream_ms: Math.round(performance.now() - tUpstream),
    dim: data.data[0]?.embedding?.length,
  });

  return c.json({ embedding: data.data[0].embedding }, 200, { 'x-request-id': reqId });
});

Deno.serve(app.fetch);
