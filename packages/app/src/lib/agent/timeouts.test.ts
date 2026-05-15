import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FirstChunkTimeoutError, StalledTimeoutError } from './errors';
import { makeTimeoutController } from './timeouts';

describe('timeouts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires FirstChunkTimeoutError if tick() never called', async () => {
    const t = makeTimeoutController({ firstChunkMs: 1000, stallMs: 5000 });
    const promise = t.tripped.catch((e: unknown) => e);
    vi.advanceTimersByTime(1100);
    const err = await promise;
    expect(err).toBeInstanceOf(FirstChunkTimeoutError);
    expect(t.signal.aborted).toBe(true);
    t.dispose();
  });

  it('first tick() cancels the firstChunk timer + starts stall timer', async () => {
    const t = makeTimeoutController({ firstChunkMs: 1000, stallMs: 5000 });
    vi.advanceTimersByTime(500);
    t.tick(); // first chunk arrived
    const promise = t.tripped.catch((e: unknown) => e);
    vi.advanceTimersByTime(5100); // stall budget elapsed
    const err = await promise;
    expect(err).toBeInstanceOf(StalledTimeoutError);
    t.dispose();
  });

  it('repeated tick() resets the stall timer indefinitely', async () => {
    const t = makeTimeoutController({ firstChunkMs: 1000, stallMs: 1000 });
    t.tick();
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(900);
      t.tick();
    }
    // 4500ms elapsed, well past stall budget, but each tick reset it.
    expect(t.signal.aborted).toBe(false);
    t.dispose();
  });

  it('dispose() prevents any further timeout firing', async () => {
    const t = makeTimeoutController({ firstChunkMs: 1000, stallMs: 1000 });
    t.dispose();
    vi.advanceTimersByTime(10_000);
    expect(t.signal.aborted).toBe(false);
  });

  it('external AbortSignal propagates to the timeout controller', () => {
    const external = new AbortController();
    const t = makeTimeoutController({
      firstChunkMs: 1000,
      stallMs: 1000,
      externalSignal: external.signal,
    });
    expect(t.signal.aborted).toBe(false);
    external.abort();
    expect(t.signal.aborted).toBe(true);
    t.dispose();
  });
});
