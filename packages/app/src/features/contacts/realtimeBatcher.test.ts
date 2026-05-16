import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRealtimeBatcher } from './realtimeBatcher';

type Row = { id: string; v: number };

describe('makeRealtimeBatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces multiple upserts to the same id into the last one', () => {
    const handler = vi.fn();
    const b = makeRealtimeBatcher<Row, Row>(
      { contacts: handler, assets: vi.fn() },
      { windowMs: 50 },
    );
    b.push('contacts', { kind: 'upsert', row: { id: 'a', v: 1 } });
    b.push('contacts', { kind: 'upsert', row: { id: 'a', v: 2 } });
    b.push('contacts', { kind: 'upsert', row: { id: 'a', v: 3 } });
    expect(handler).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith([{ kind: 'upsert', row: { id: 'a', v: 3 } }]);
  });

  it('preserves order across distinct ids in one flush', () => {
    const handler = vi.fn();
    const b = makeRealtimeBatcher<Row, Row>(
      { contacts: handler, assets: vi.fn() },
      { windowMs: 50 },
    );
    b.push('contacts', { kind: 'upsert', row: { id: 'a', v: 1 } });
    b.push('contacts', { kind: 'upsert', row: { id: 'b', v: 2 } });
    b.push('contacts', { kind: 'upsert', row: { id: 'c', v: 3 } });
    vi.advanceTimersByTime(60);
    const calls = handler.mock.calls[0][0];
    expect(calls).toHaveLength(3);
    expect(calls.map((e: { row: Row }) => e.row.id)).toEqual(['a', 'b', 'c']);
  });

  it('a remove overrides an earlier upsert for the same id', () => {
    const handler = vi.fn();
    const b = makeRealtimeBatcher<Row, Row>(
      { contacts: handler, assets: vi.fn() },
      { windowMs: 50 },
    );
    b.push('contacts', { kind: 'upsert', row: { id: 'a', v: 1 } });
    b.push('contacts', { kind: 'remove', id: 'a' });
    vi.advanceTimersByTime(60);
    expect(handler).toHaveBeenCalledWith([{ kind: 'remove', id: 'a' }]);
  });

  it('keeps contacts and assets buckets independent', () => {
    const c = vi.fn();
    const a = vi.fn();
    const b = makeRealtimeBatcher<Row, Row>({ contacts: c, assets: a }, { windowMs: 50 });
    b.push('contacts', { kind: 'upsert', row: { id: 'a', v: 1 } });
    b.push('assets', { kind: 'upsert', row: { id: 'x', v: 9 } });
    vi.advanceTimersByTime(60);
    expect(c).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledTimes(1);
  });

  it('does not dispatch when nothing was buffered', () => {
    const handler = vi.fn();
    const b = makeRealtimeBatcher<Row, Row>(
      { contacts: handler, assets: vi.fn() },
      { windowMs: 50 },
    );
    b.flush();
    expect(handler).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60);
    expect(handler).not.toHaveBeenCalled();
  });

  it('flush() dispatches immediately and clears the timer', () => {
    const handler = vi.fn();
    const b = makeRealtimeBatcher<Row, Row>(
      { contacts: handler, assets: vi.fn() },
      { windowMs: 50 },
    );
    b.push('contacts', { kind: 'upsert', row: { id: 'a', v: 1 } });
    b.flush();
    expect(handler).toHaveBeenCalledTimes(1);
    // A subsequent timer fire should NOT re-dispatch.
    vi.advanceTimersByTime(60);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('cancel() drops buffered events without dispatching', () => {
    const handler = vi.fn();
    const b = makeRealtimeBatcher<Row, Row>(
      { contacts: handler, assets: vi.fn() },
      { windowMs: 50 },
    );
    b.push('contacts', { kind: 'upsert', row: { id: 'a', v: 1 } });
    b.cancel();
    vi.advanceTimersByTime(60);
    expect(handler).not.toHaveBeenCalled();
  });

  it('handles thousands of events with one dispatch per bucket', () => {
    const handler = vi.fn();
    const b = makeRealtimeBatcher<Row, Row>(
      { contacts: handler, assets: vi.fn() },
      { windowMs: 50 },
    );
    for (let i = 0; i < 5_000; i++) {
      b.push('contacts', { kind: 'upsert', row: { id: `id-${i % 200}`, v: i } });
    }
    vi.advanceTimersByTime(60);
    expect(handler).toHaveBeenCalledTimes(1);
    // 200 distinct ids → 200 final events.
    expect(handler.mock.calls[0][0]).toHaveLength(200);
  });
});
