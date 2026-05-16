/**
 * End-to-end contract test for the dev-only debug recorder route +
 * `pnpm last-turn` script.
 *
 * Drives the POST handler with the exact sequence HttpDebugRecorder
 * emits during a real turn, then:
 *   - asserts the on-disk layout matches NodeDebugRecorder's format
 *     (so `pnpm agent-replay` / `cat trace/*.json` work the same way)
 *   - shells out to `pnpm last-turn` and asserts the human-readable
 *     summary picks up finishReason + segment tail correctly
 *
 * If this test breaks, my autonomous-debugging loop is broken — the
 * recorder + reader pair MUST stay in sync.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { POST } from './route';

let tmpRoot = '';
const ORIG_ROOT = process.env.REKNOWABLE_DEBUG_ROOT;

function event(method: string, slug: string, turn: number, payload: unknown): Request {
  return new Request('http://localhost/api/debug/recorder', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      slug,
      ts: new Date().toISOString(),
      method,
      turn,
      payload,
    }),
  });
}

async function postSeq(
  slug: string,
  events: Array<{ method: string; turn: number; payload: unknown }>,
): Promise<void> {
  for (const e of events) {
    const res = await POST(event(e.method, slug, e.turn, e.payload));
    expect(res.status).toBe(200);
  }
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'recorder-test-'));
  process.env.REKNOWABLE_DEBUG_ROOT = tmpRoot;
});

afterEach(() => {
  if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
  if (ORIG_ROOT === undefined) delete process.env.REKNOWABLE_DEBUG_ROOT;
  else process.env.REKNOWABLE_DEBUG_ROOT = ORIG_ROOT;
});

describe('POST /api/debug/recorder', () => {
  it('writes startTurn → metadata.json + index.jsonl entry', async () => {
    const slug = 'test-slug-1';
    await postSeq(slug, [
      {
        method: 'startTurn',
        turn: 1,
        payload: { threadId: 't1', userId: 'u1', userMessage: 'Hello world' },
      },
    ]);

    const metaRaw = await fs.readFile(join(tmpRoot, slug, 'metadata.json'), 'utf8');
    expect(JSON.parse(metaRaw)).toMatchObject({
      threadId: 't1',
      userId: 'u1',
      userMessage: 'Hello world',
      turn: 1,
    });

    const indexRaw = await fs.readFile(join(tmpRoot, 'index.jsonl'), 'utf8');
    const lines = indexRaw
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      slug,
      userMessage: 'Hello world',
      outcome: 'running',
    });
  });

  it('llmRequest → llm/turn-NN/request.json (byte-exact JSON)', async () => {
    const slug = 'test-slug-2';
    const body = { system: 'sys', messages: [{ role: 'user', content: 'go' }], tools: ['find'] };
    await postSeq(slug, [
      { method: 'startTurn', turn: 1, payload: { threadId: 't', userId: 'u', userMessage: 'go' } },
      { method: 'llmRequest', turn: 1, payload: body },
    ]);
    const reqRaw = await fs.readFile(join(tmpRoot, slug, 'llm', 'turn-01', 'request.json'), 'utf8');
    expect(JSON.parse(reqRaw)).toEqual(body);
  });

  it('toolCall + toolResult → tool_calls/<id>.json with both records', async () => {
    const slug = 'test-slug-3';
    await postSeq(slug, [
      { method: 'startTurn', turn: 1, payload: { threadId: 't', userId: 'u', userMessage: 'go' } },
      {
        method: 'toolCall',
        turn: 1,
        payload: { id: 'tc-1', name: 'find', args: { queries: ['anna'] } },
      },
      {
        method: 'toolResult',
        turn: 1,
        payload: {
          id: 'tc-1',
          result: { ok: true, data: { rows: [{ id: 'r1' }] } },
          durationMs: 42,
        },
      },
    ]);
    const raw = await fs.readFile(join(tmpRoot, slug, 'tool_calls', 'tc-1.json'), 'utf8');
    expect(raw).toContain('"name": "find"');
    expect(raw).toContain('"durationMs": 42');
    expect(raw).toContain('"rows"');
  });

  it('endTurn → metadata.json finalized + new index.jsonl entry with outcome', async () => {
    const slug = 'test-slug-4';
    await postSeq(slug, [
      { method: 'startTurn', turn: 1, payload: { threadId: 't', userId: 'u', userMessage: 'go' } },
      { method: 'endTurn', turn: 1, payload: { outcome: 'ok' } },
    ]);
    const meta = JSON.parse(await fs.readFile(join(tmpRoot, slug, 'metadata.json'), 'utf8'));
    expect(meta.outcome).toBe('ok');
    expect(meta.endedAt).toBeTruthy();
    expect(typeof meta.durationMs).toBe('number');

    const lines = (await fs.readFile(join(tmpRoot, 'index.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(lines.some((l) => l.outcome === 'running')).toBe(true);
    expect(lines.some((l) => l.outcome === 'ok')).toBe(true);
  });

  it('timeline llm/finished → lifts finish_reason + text_length + tool_calls into the index', async () => {
    const slug = 'test-slug-5';
    await postSeq(slug, [
      { method: 'startTurn', turn: 1, payload: { threadId: 't', userId: 'u', userMessage: 'go' } },
      {
        method: 'timeline',
        turn: 1,
        payload: {
          event: 'llm/finished',
          payload: {
            attempt: 0,
            text_length: 0,
            tool_calls: 2,
            finish_reason: 'stop',
            segments_summary: ['text:24', 'tool:find', 'text:48', 'tool:query_sql'],
          },
        },
      },
      { method: 'endTurn', turn: 1, payload: { outcome: 'ok' } },
    ]);
    const lines = (await fs.readFile(join(tmpRoot, 'index.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    // The merged latest-state should expose the lifted summary fields.
    const merged = lines.reduce((acc, l) => ({ ...acc, ...l }), {});
    expect(merged.finishReason).toBe('stop');
    expect(merged.textLength).toBe(0);
    expect(merged.toolCallCount).toBe(2);
  });

  it('rejects path-traversal slugs', async () => {
    const res = await POST(
      event('startTurn', '../../etc/passwd', 1, {
        threadId: 't',
        userId: 'u',
        userMessage: 'evil',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects invalid JSON bodies', async () => {
    const res = await POST(
      new Request('http://localhost/api/debug/recorder', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not-json',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('refuses in production', async () => {
    const orig = process.env.NODE_ENV;
    // process.env.NODE_ENV is a string-valued env var. The Node typings
    // mark it as a literal union, so we cast to bypass for the test.
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    try {
      const res = await POST(
        event('startTurn', 'slug-prod', 1, { threadId: 't', userId: 'u', userMessage: 'go' }),
      );
      expect(res.status).toBe(404);
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = orig;
    }
  });
});

describe('pnpm last-turn (end-to-end via the same tmpRoot)', () => {
  it('summarizes a SILENT STOP turn (the failure mode that started all this)', async () => {
    const slug = '2026-05-16T10-36-04-zzzz';
    await postSeq(slug, [
      {
        method: 'startTurn',
        turn: 1,
        payload: {
          threadId: 'thread-x',
          userId: 'user-x',
          userMessage: 'I wanna travel to Gothenburg next week',
        },
      },
      {
        method: 'timeline',
        turn: 1,
        payload: {
          event: 'llm/finished',
          payload: {
            attempt: 0,
            text_length: 0,
            tool_calls: 2,
            finish_reason: 'stop',
            segments_summary: ['text:32', 'tool:find', 'text:64', 'tool:query_sql'],
          },
        },
      },
      { method: 'endTurn', turn: 1, payload: { outcome: 'ok' } },
    ]);

    const out = execSync(`tsx ${join(process.cwd(), '..', '..', 'scripts', 'last-turn.ts')}`, {
      encoding: 'utf8',
      env: { ...process.env, REKNOWABLE_DEBUG_ROOT: tmpRoot },
    });

    expect(out).toContain(slug);
    expect(out).toContain('Gothenburg');
    expect(out).toContain('finish_reason: stop');
    expect(out).toContain('SILENT STOP');
    expect(out).toContain('tool:query_sql');
  });

  it('--failed surfaces a recoverable_truncated error turn (not the latest clean one)', async () => {
    const cleanSlug = '2026-05-16T11-00-00-aaaa';
    const failSlug = '2026-05-16T10-50-00-bbbb';

    await postSeq(failSlug, [
      {
        method: 'startTurn',
        turn: 1,
        payload: { threadId: 't', userId: 'u', userMessage: 'add anna' },
      },
      {
        method: 'endTurn',
        turn: 1,
        payload: { outcome: 'error', detail: 'recoverable_truncated' },
      },
    ]);
    await postSeq(cleanSlug, [
      {
        method: 'startTurn',
        turn: 1,
        payload: { threadId: 't', userId: 'u', userMessage: 'add bo' },
      },
      { method: 'endTurn', turn: 1, payload: { outcome: 'ok' } },
    ]);

    const out = execSync(
      `tsx ${join(process.cwd(), '..', '..', 'scripts', 'last-turn.ts')} --failed`,
      {
        encoding: 'utf8',
        env: { ...process.env, REKNOWABLE_DEBUG_ROOT: tmpRoot },
      },
    );

    expect(out).toContain(failSlug);
    expect(out).toContain('add anna');
    expect(out).toContain('recoverable_truncated');
    expect(out).not.toContain(cleanSlug);
  });
});
