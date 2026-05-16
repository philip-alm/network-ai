/**
 * Stream observability contract — the passive identity transform that
 * fires `upstream.completed` (with finish_reason + byte count) at EOF
 * and `upstream.cancelled` on client disconnect.
 *
 * If you change anything here, also update the consumer in
 * `supabase/functions/agent-chat/index.ts` and the `pnpm last-turn`
 * reader that downstream tooling uses to surface these events.
 */

import { describe, expect, it, vi } from 'vitest';
import { makeUpstreamObserver } from '../functions/agent-chat/llm/streamObserver';

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

async function pipeThrough(
  chunks: Uint8Array[],
  observer: TransformStream<Uint8Array, Uint8Array>,
): Promise<Uint8Array[]> {
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });

  const collected: Uint8Array[] = [];
  const sink = new WritableStream<Uint8Array>({
    write(chunk): Promise<void> {
      collected.push(chunk);
      return Promise.resolve();
    },
  });

  await readable.pipeThrough(observer).pipeTo(sink);
  return collected;
}

describe('makeUpstreamObserver', () => {
  it('passes bytes through unchanged (identity transform)', async () => {
    const observer = makeUpstreamObserver({ onDone: vi.fn() });
    const collected = await pipeThrough([bytes('hello '), bytes('world')], observer);
    const joined = collected.map((c) => new TextDecoder().decode(c)).join('');
    expect(joined).toBe('hello world');
  });

  it('fires onDone with byte total + finish_reason from the SSE tail', async () => {
    const onDone = vi.fn();
    const observer = makeUpstreamObserver({ onDone });
    await pipeThrough(
      [
        bytes('data: {"choices":[{"delta":{"content":"hi"},"index":0}]}\n\n'),
        bytes('data: {"choices":[{"delta":{},"index":0,"finish_reason":"stop"}]}\n\n'),
        bytes('data: [DONE]\n\n'),
      ],
      observer,
    );
    expect(onDone).toHaveBeenCalledOnce();
    const info = onDone.mock.calls[0][0] as {
      bytes: number;
      finishReason: string | null;
      durationMs: number;
    };
    expect(info.finishReason).toBe('stop');
    expect(info.bytes).toBeGreaterThan(0);
    expect(typeof info.durationMs).toBe('number');
  });

  it('returns null finishReason when the upstream emits no finish_reason field', async () => {
    const onDone = vi.fn();
    const observer = makeUpstreamObserver({ onDone });
    await pipeThrough([bytes('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n')], observer);
    const info = onDone.mock.calls[0][0] as { finishReason: string | null };
    expect(info.finishReason).toBeNull();
  });

  it('grabs the LAST finish_reason when many appear (chunked completions)', async () => {
    const onDone = vi.fn();
    const observer = makeUpstreamObserver({ onDone });
    await pipeThrough(
      [
        bytes('data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n'),
        bytes('data: {"choices":[{"finish_reason":"stop"}]}\n\n'),
      ],
      observer,
    );
    expect((onDone.mock.calls[0][0] as { finishReason: string }).finishReason).toBe('stop');
  });

  it('only keeps a rolling 8KB tail so big bodies do not blow up memory', async () => {
    const onDone = vi.fn();
    const observer = makeUpstreamObserver({ onDone });
    // 100KB of filler in front of the final finish_reason event.
    const filler = bytes('x'.repeat(100_000));
    const final = bytes('data: {"choices":[{"finish_reason":"length"}]}\n\n');
    await pipeThrough([filler, final], observer);
    const info = onDone.mock.calls[0][0] as { bytes: number; finishReason: string | null };
    expect(info.bytes).toBeGreaterThan(100_000);
    expect(info.finishReason).toBe('length');
  });

  it('measures durationMs from creation to flush (injected clock)', async () => {
    let t = 100;
    const now = (): number => t;
    const onDone = vi.fn();
    const observer = makeUpstreamObserver({ onDone }, now);
    t = 350;
    await pipeThrough([bytes('data: {"finish_reason":"stop"}\n\n')], observer);
    const info = onDone.mock.calls[0][0] as { durationMs: number };
    expect(info.durationMs).toBe(250);
  });

  it('swallows callback errors so a broken logger never breaks the stream', async () => {
    const observer = makeUpstreamObserver({
      onDone: () => {
        throw new Error('logger blew up');
      },
    });
    // Should not reject.
    await expect(
      pipeThrough([bytes('data: {"finish_reason":"stop"}\n\n')], observer),
    ).resolves.toBeDefined();
  });
});
