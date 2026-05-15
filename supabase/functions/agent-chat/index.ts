// Deno entrypoint. Run locally via `supabase functions serve agent-chat`.
//
// Required env: OPENROUTER_API_KEY (Edge Function secret remotely, supabase/.env locally).

import { Hono, type Context } from 'jsr:@hono/hono@^4.7';
import { cors } from 'jsr:@hono/hono@^4.7/cors';
import {
  buildUpstreamRequest,
  STREAM_RESPONSE_HEADERS,
  JSON_RESPONSE_HEADERS,
  type ChatRequest,
} from './core.ts';
import { log, makeRequestId } from '../_shared/log.ts';

const app = new Hono().basePath('/agent-chat');

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

// The AI SDK's createOpenAICompatible appends '/chat/completions' to baseURL.
// Browser baseURL = `${supabase}/functions/v1/agent-chat`, so inbound path =
// '/agent-chat/chat/completions'. We also accept POST '/' for direct callers
// (curl, verify:deployed). Same handler either way.
async function handleChat(c: Context): Promise<Response> {
  const reqId = makeRequestId(c.req.raw);
  const ctx = { function: 'agent-chat', request_id: reqId };
  const t0 = performance.now();

  const auth = c.req.header('Authorization');
  if (!auth) {
    log('warn', ctx, 'auth.missing');
    return c.text('Missing Authorization header', 401, { 'x-request-id': reqId });
  }

  let body: ChatRequest;
  try {
    body = (await c.req.json()) as ChatRequest;
  } catch {
    log('warn', ctx, 'body.invalid_json');
    return c.text('Invalid JSON body', 400, { 'x-request-id': reqId });
  }
  const messageCount = Array.isArray(body.messages) ? body.messages.length : 0;
  log('info', ctx, 'request.received', { model: body.model, messages: messageCount });

  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!openrouterKey) {
    log('error', ctx, 'env.openrouter_key_missing');
    return c.text('OPENROUTER_API_KEY missing in Edge Function secrets', 500, {
      'x-request-id': reqId,
    });
  }

  let upstream: Response;
  let streaming = false;
  const tUpstreamStart = performance.now();
  try {
    const built = buildUpstreamRequest(body, {
      openrouterKey,
      referer: 'https://network-ai.app',
      title: 'network-ai',
    });
    streaming = built.streaming;
    log('debug', ctx, 'upstream.fetch.start', { url: built.url, streaming });
    upstream = await fetch(built.url, { ...built.init, signal: c.req.raw.signal });
    log('info', ctx, 'upstream.fetch.headers', {
      status: upstream.status,
      duration_ms: Math.round(performance.now() - tUpstreamStart),
    });
  } catch (err) {
    log('error', ctx, 'upstream.fetch.threw', {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.text(
      `agent-chat: upstream request build failed — ${err instanceof Error ? err.message : String(err)}`,
      400,
      { 'x-request-id': reqId },
    );
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    log('error', ctx, 'upstream.error', { status: upstream.status, detail: detail.slice(0, 500) });
    return c.text(`OpenRouter ${upstream.status}: ${detail}`, upstream.status as never, {
      'x-request-id': reqId,
    });
  }

  const responseHeaders = streaming
    ? { ...STREAM_RESPONSE_HEADERS, 'x-request-id': reqId }
    : { ...JSON_RESPONSE_HEADERS, 'x-request-id': reqId };

  log('info', ctx, streaming ? 'response.streaming' : 'response.json', {
    total_ms_to_first_byte: Math.round(performance.now() - t0),
  });
  return new Response(upstream.body, { headers: responseHeaders });
}

app.post('/chat/completions', handleChat);
app.post('/', handleChat);

Deno.serve(app.fetch);
