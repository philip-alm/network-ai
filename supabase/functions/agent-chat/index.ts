// Deno entrypoint. Run locally via `supabase functions serve agent-chat`.
//
// LLM provider chain (faithful port of Incredible's `LlmClient::with_fallback`):
//   Cerebras GLM 4.7 → Groq gpt-oss-120b → Fireworks Kimi K2.5 → OpenRouter Gemini 3 Flash
//
// A pre-stream failure on any tier (network / 429 / 5xx) walks down to
// the next. Mid-stream errors are NEVER retried. See `./llm/client.ts`.
//
// Required env (Edge Function secrets remotely, supabase/.env locally):
//   At least one of CEREBRAS_API_KEY, GROQ_API_KEY, FIREWORKS_API_KEY,
//   OPENROUTER_API_KEY. Tiers without a configured key are skipped at
//   chain build time.

import { Hono, type Context } from 'jsr:@hono/hono@^4.7';
import { cors } from 'jsr:@hono/hono@^4.7/cors';
import { log, makeRequestId } from '../_shared/log.ts';
import { LlmChainExhaustedError, type StreamChatResult } from './llm/client.ts';
import { buildProductionChain, describeChain } from './llm/chain.ts';
import { asHeaderValue, truncate } from './llm/headers.ts';
import type { GenericLlmBody } from './llm/body.ts';
import { makeUpstreamObserver } from './llm/streamObserver.ts';

const app = new Hono().basePath('/agent-chat');

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type', 'apikey', 'x-client-info', 'x-request-id'],
    exposeHeaders: ['x-request-id', 'x-llm-provider', 'x-llm-fallback-trail'],
    maxAge: 600,
  }),
);

app.get('/health', (c) => c.json({ ok: true }));

const STREAM_RESPONSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
  Connection: 'keep-alive',
} as const;

const JSON_RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-cache, no-transform',
} as const;

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

  let body: GenericLlmBody;
  try {
    body = (await c.req.json()) as GenericLlmBody;
  } catch {
    log('warn', ctx, 'body.invalid_json');
    return c.text('Invalid JSON body', 400, { 'x-request-id': reqId });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    log('warn', ctx, 'body.no_messages');
    return c.text('`messages` must be a non-empty array', 400, { 'x-request-id': reqId });
  }

  const messageCount = body.messages.length;
  const toolCount = Array.isArray(body.tools) ? body.tools.length : 0;
  const streaming = body.stream === true;

  let chain;
  try {
    chain = buildProductionChain({
      CEREBRAS_API_KEY: Deno.env.get('CEREBRAS_API_KEY'),
      GROQ_API_KEY: Deno.env.get('GROQ_API_KEY'),
      FIREWORKS_API_KEY: Deno.env.get('FIREWORKS_API_KEY'),
      OPENROUTER_API_KEY: Deno.env.get('OPENROUTER_API_KEY'),
    });
  } catch (err) {
    log('error', ctx, 'chain.build_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.text(
      `agent-chat: ${err instanceof Error ? err.message : 'no providers configured'}`,
      500,
      { 'x-request-id': reqId },
    );
  }

  log('info', ctx, 'request.received', {
    messages: messageCount,
    tools: toolCount,
    streaming,
    chain: describeChain(chain),
  });

  let attempt: StreamChatResult;
  const tUpstreamStart = performance.now();
  try {
    attempt = await chain.streamChat({ body, signal: c.req.raw.signal });
  } catch (err) {
    if (err instanceof LlmChainExhaustedError) {
      log('error', ctx, 'chain.exhausted', { attempts: err.attempts });
      return c.text(
        `All LLM providers failed: ${err.attempts.map((a) => `${a.providerLabel} (${a.error})`).join(' | ')}`,
        502,
        { 'x-request-id': reqId },
      );
    }
    log('error', ctx, 'chain.unexpected_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.text(
      `agent-chat: unexpected — ${err instanceof Error ? err.message : String(err)}`,
      500,
      { 'x-request-id': reqId },
    );
  }

  log('info', ctx, 'upstream.streaming', {
    provider: attempt.providerLabel,
    fallback_trail: attempt.fallbackTrail,
    ttfb_ms: Math.round(performance.now() - tUpstreamStart),
    total_ms_to_first_byte: Math.round(performance.now() - t0),
  });

  const baseHeaders = streaming ? STREAM_RESPONSE_HEADERS : JSON_RESPONSE_HEADERS;
  const upstreamContentType = attempt.response.headers.get('Content-Type');
  const responseHeaders: Record<string, string> = {
    ...baseHeaders,
    ...(upstreamContentType ? { 'Content-Type': upstreamContentType } : {}),
    'x-request-id': reqId,
    'x-llm-provider': asHeaderValue(attempt.providerLabel),
  };
  if (attempt.fallbackTrail.length > 0) {
    responseHeaders['x-llm-fallback-trail'] = asHeaderValue(
      attempt.fallbackTrail.map((a) => `${a.providerLabel}=${truncate(a.error, 80)}`).join(';'),
    );
  }

  // Stream observability — pipe the upstream body through a counting /
  // finish_reason-extracting transform so we log a single structured
  // `upstream.completed` event when the stream ends. Without this, the
  // function only logs request-received + first-byte; turn completion is
  // invisible from the server side, which is exactly the diagnostic gap
  // we hit on 2026-05-16.
  //
  // Client-cancel is observed separately via the request's AbortSignal
  // because non-EOF terminations don't run the transform's `flush()`.
  const observedBody = attempt.response.body
    ? attempt.response.body.pipeThrough(
        makeUpstreamObserver({
          onDone: ({ bytes, finishReason, durationMs }) => {
            log('info', ctx, 'upstream.completed', {
              provider: attempt.providerLabel,
              total_ms: durationMs,
              bytes_streamed: bytes,
              finish_reason: finishReason,
            });
          },
        }),
      )
    : null;

  c.req.raw.signal.addEventListener(
    'abort',
    () => {
      log('warn', ctx, 'upstream.cancelled', {
        provider: attempt.providerLabel,
        total_ms: Math.round(performance.now() - tUpstreamStart),
      });
    },
    { once: true },
  );

  return new Response(observedBody, {
    status: attempt.response.status,
    headers: responseHeaders,
  });
}

app.post('/chat/completions', handleChat);
app.post('/', handleChat);

Deno.serve(app.fetch);
