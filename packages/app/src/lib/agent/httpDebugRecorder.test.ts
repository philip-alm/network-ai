/**
 * HttpDebugRecorder contract tests — verify the wire format, ordering,
 * fire-and-forget semantics, and flush() drain.
 *
 * The route handler at apps/web/app/api/debug/recorder/route.ts mirrors
 * these wire shapes onto disk; if you change wire formats here, update
 * the route too.
 */

import { describe, expect, it, vi } from 'vitest';
import { createHttpDebugRecorder } from './httpDebugRecorder';

type Captured = { url: string; body: Record<string, unknown> };

function makeFakeFetch(): {
  fetchImpl: typeof fetch;
  captured: Captured[];
  failNthCall: (n: number) => void;
} {
  const captured: Captured[] = [];
  let failOn: number | null = null;
  let callCount = 0;
  const fetchImpl = vi
    .fn()
    .mockImplementation(async (url: string, init?: RequestInit): Promise<Response> => {
      callCount++;
      const body = JSON.parse(init?.body as string) as Record<string, unknown>;
      captured.push({ url, body });
      if (failOn !== null && callCount === failOn) {
        throw new Error('simulated network failure');
      }
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch;
  return {
    fetchImpl,
    captured,
    failNthCall: (n) => {
      failOn = n;
    },
  };
}

describe('createHttpDebugRecorder', () => {
  it('posts startTurn with the threadId/userId/userMessage payload', async () => {
    const { fetchImpl, captured } = makeFakeFetch();
    const rec = createHttpDebugRecorder({ slug: 'fixed-slug-1', fetchImpl });

    rec.startTurn({ threadId: 'thread-1', userId: 'user-1', userMessage: 'hello' });
    await rec.flush?.();

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe('/api/debug/recorder');
    expect(captured[0].body).toMatchObject({
      slug: 'fixed-slug-1',
      method: 'startTurn',
      turn: 1,
      payload: { threadId: 'thread-1', userId: 'user-1', userMessage: 'hello' },
    });
    expect(typeof captured[0].body.ts).toBe('string');
  });

  it('bumps the turn counter across startTurn calls', async () => {
    const { fetchImpl, captured } = makeFakeFetch();
    const rec = createHttpDebugRecorder({ slug: 'fixed-slug-2', fetchImpl });

    rec.startTurn({ threadId: 't', userId: 'u', userMessage: 'one' });
    rec.startTurn({ threadId: 't', userId: 'u', userMessage: 'two' });
    await rec.flush?.();

    expect(captured.map((c) => c.body.turn)).toEqual([1, 2]);
  });

  it('preserves event order via the serial fetch chain', async () => {
    const { fetchImpl, captured } = makeFakeFetch();
    const rec = createHttpDebugRecorder({ slug: 'fixed-slug-3', fetchImpl });

    rec.startTurn({ threadId: 't', userId: 'u', userMessage: 'go' });
    rec.recordLlmRequest({ system: 'sys', messages: [], tools: ['find'] });
    rec.recordToolCall('tc-1', 'find', { queries: ['x'] });
    rec.recordToolResult('tc-1', { ok: true, data: { rows: [] } }, 42);
    rec.recordTimeline('llm/finished', { finish_reason: 'stop' });
    rec.endTurn('ok');
    await rec.flush?.();

    expect(captured.map((c) => c.body.method)).toEqual([
      'startTurn',
      'llmRequest',
      'toolCall',
      'toolResult',
      'timeline',
      'endTurn',
    ]);
  });

  it('records llmResponseChunk byte-exactly (string payload)', async () => {
    const { fetchImpl, captured } = makeFakeFetch();
    const rec = createHttpDebugRecorder({ slug: 'fixed-slug-4', fetchImpl });
    rec.startTurn({ threadId: 't', userId: 'u', userMessage: 'go' });
    rec.recordLlmResponseChunk('data: {"delta":"Hello"}\n\n');
    rec.recordLlmResponseChunk('data: {"delta":" world"}\n\n');
    await rec.flush?.();

    const chunks = captured.filter((c) => c.body.method === 'llmResponseChunk');
    expect(chunks.map((c) => c.body.payload)).toEqual([
      'data: {"delta":"Hello"}\n\n',
      'data: {"delta":" world"}\n\n',
    ]);
  });

  it('swallows network failures and keeps the chain alive', async () => {
    const { fetchImpl, captured, failNthCall } = makeFakeFetch();
    failNthCall(2); // second POST will throw
    const rec = createHttpDebugRecorder({ slug: 'fixed-slug-5', fetchImpl });

    rec.startTurn({ threadId: 't', userId: 'u', userMessage: 'go' });
    rec.recordLlmRequest({ system: 'sys' }); // this one will throw inside fetch
    rec.recordTimeline('keepgoing'); // chain MUST continue regardless

    await expect(rec.flush?.()).resolves.toBeUndefined();
    expect(captured.map((c) => c.body.method)).toEqual(['startTurn', 'llmRequest', 'timeline']);
  });

  it('flush() resolves even with zero events', async () => {
    const { fetchImpl } = makeFakeFetch();
    const rec = createHttpDebugRecorder({ slug: 'fixed-slug-6', fetchImpl });
    await expect(rec.flush?.()).resolves.toBeUndefined();
  });

  it('exposes the slug via `path` for callers that want to log the trace location', () => {
    const { fetchImpl } = makeFakeFetch();
    const rec = createHttpDebugRecorder({ slug: 'fixed-slug-7', fetchImpl });
    expect(rec.path).toBe('fixed-slug-7');
  });

  it('encodes args + ids verbatim on toolCall', async () => {
    const { fetchImpl, captured } = makeFakeFetch();
    const rec = createHttpDebugRecorder({ slug: 'fixed-slug-8', fetchImpl });
    rec.startTurn({ threadId: 't', userId: 'u', userMessage: 'go' });
    rec.recordToolCall('id-XYZ', 'mutate_sql', {
      sql: "UPDATE contacts SET tags = array_append(tags, 'podcast') WHERE id = 'abc' RETURNING *",
    });
    await rec.flush?.();
    const tc = captured.find((c) => c.body.method === 'toolCall');
    expect(tc?.body.payload).toEqual({
      id: 'id-XYZ',
      name: 'mutate_sql',
      args: {
        sql: "UPDATE contacts SET tags = array_append(tags, 'podcast') WHERE id = 'abc' RETURNING *",
      },
    });
  });
});
