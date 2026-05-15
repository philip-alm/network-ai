/**
 * agent-chat core: unit tests for the request-shaping logic.
 *
 * The actual SSE streaming behavior is exercised end-to-end by Phase 5's
 * verify:agent-loop (which runs the function locally via `supabase functions
 * serve` and drives a real conversation through it).
 */

import { describe, expect, it } from 'vitest';
import {
  buildUpstreamRequest,
  OPENROUTER_URL,
  STREAM_RESPONSE_HEADERS,
} from '../functions/agent-chat/core';

const OPTS = { openrouterKey: 'test-key', referer: 'https://network-ai.app', title: 'network-ai' };

describe('agent-chat / buildUpstreamRequest', () => {
  it('targets the OpenRouter chat completions endpoint', () => {
    const { url } = buildUpstreamRequest(
      { model: 'm', messages: [{ role: 'user', content: 'hi' }] },
      OPTS,
    );
    expect(url).toBe(OPENROUTER_URL);
  });

  it('forces stream:true even when the client omits or disables it', () => {
    const { init } = buildUpstreamRequest(
      { model: 'm', messages: [{ role: 'user', content: 'hi' }], stream: false },
      OPTS,
    );
    expect(JSON.parse(init.body as string).stream).toBe(true);
  });

  it('sets Bearer auth + OpenRouter app headers', () => {
    const { init } = buildUpstreamRequest(
      { model: 'm', messages: [{ role: 'user', content: 'hi' }] },
      OPTS,
    );
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe('Bearer test-key');
    expect(h['Content-Type']).toBe('application/json');
    expect(h['HTTP-Referer']).toBe('https://network-ai.app');
    expect(h['X-Title']).toBe('network-ai');
  });

  it('passes through tools + temperature + arbitrary fields', () => {
    const { init } = buildUpstreamRequest(
      {
        model: 'm',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [{ type: 'function', function: { name: 'query_sql' } }],
        temperature: 0.2,
        custom_field: 'preserved',
      },
      OPTS,
    );
    const body = JSON.parse(init.body as string);
    expect(body.tools).toEqual([{ type: 'function', function: { name: 'query_sql' } }]);
    expect(body.temperature).toBe(0.2);
    expect(body.custom_field).toBe('preserved');
  });

  it('rejects missing model', () => {
    expect(() =>
      buildUpstreamRequest({ model: '', messages: [{ role: 'user', content: 'hi' }] }, OPTS),
    ).toThrow(/model/);
  });

  it('rejects empty messages', () => {
    expect(() => buildUpstreamRequest({ model: 'm', messages: [] }, OPTS)).toThrow(/messages/);
  });

  it('rejects missing OPENROUTER_API_KEY', () => {
    expect(() =>
      buildUpstreamRequest(
        { model: 'm', messages: [{ role: 'user', content: 'hi' }] },
        { ...OPTS, openrouterKey: '' },
      ),
    ).toThrow(/OPENROUTER_API_KEY/);
  });
});

describe('agent-chat / STREAM_RESPONSE_HEADERS', () => {
  it('sets SSE + no-buffering headers', () => {
    expect(STREAM_RESPONSE_HEADERS['Content-Type']).toBe('text/event-stream');
    expect(STREAM_RESPONSE_HEADERS['X-Accel-Buffering']).toBe('no');
  });
});
