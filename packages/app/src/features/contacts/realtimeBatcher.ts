/**
 * realtimeBatcher — windowed coalescing for Supabase Realtime events.
 *
 * Without batching, a bulk import or a catch-up burst causes one
 * setState per event (= one React render). At 100 events / second the
 * UI throttles to a crawl. With this batcher, we collect events into a
 * `windowMs` bucket and dispatch a SINGLE store update per window.
 *
 * Per-row last-write-wins is enforced by id: if the same row is touched
 * twice within a window, only the most recent payload is dispatched.
 *
 * The batcher is event-kind-aware:
 *   - INSERT / UPDATE non-deleted → upsert
 *   - DELETE / UPDATE with deleted_at → remove
 *
 * Two independent buckets are maintained (contacts + assets) so a flood
 * of contact updates doesn't delay asset updates and vice versa.
 */

'use client';

export type RealtimeKind = 'contacts' | 'assets';

export type RealtimeEvent<T> = { kind: 'upsert'; row: T } | { kind: 'remove'; id: string };

type Handler<T> = (events: RealtimeEvent<T>[]) => void;

type Bucket<T> = {
  // Per-id last-write-wins map. Key = row id. Value = the latest event.
  events: Map<string, RealtimeEvent<T>>;
  // Active flush timer (setTimeout handle). null when idle.
  timer: ReturnType<typeof setTimeout> | null;
};

export type BatcherOptions = {
  /** Window length in ms; defaults to 50. */
  windowMs?: number;
};

export type Batcher<TC, TA> = {
  /** Enqueue an event. Triggers a flush at the end of the window. */
  push: <K extends RealtimeKind>(
    kind: K,
    event: RealtimeEvent<K extends 'contacts' ? TC : TA>,
  ) => void;
  /** Force-flush both buckets synchronously. Useful for tests + teardown. */
  flush: () => void;
  /** Cancel any pending flush and drop buffered events without dispatching. */
  cancel: () => void;
};

export function makeRealtimeBatcher<TC, TA>(
  handlers: {
    contacts: Handler<TC>;
    assets: Handler<TA>;
  },
  options: BatcherOptions = {},
): Batcher<TC, TA> {
  const windowMs = options.windowMs ?? 50;
  const contactsBucket: Bucket<TC> = { events: new Map(), timer: null };
  const assetsBucket: Bucket<TA> = { events: new Map(), timer: null };

  function flushBucket<T>(bucket: Bucket<T>, handler: Handler<T>): void {
    if (bucket.timer) {
      clearTimeout(bucket.timer);
      bucket.timer = null;
    }
    if (bucket.events.size === 0) return;
    const events = Array.from(bucket.events.values());
    bucket.events.clear();
    handler(events);
  }

  function schedule<T>(bucket: Bucket<T>, handler: Handler<T>): void {
    if (bucket.timer != null) return;
    bucket.timer = setTimeout(() => {
      bucket.timer = null;
      flushBucket(bucket, handler);
    }, windowMs);
  }

  return {
    push: (kind, event) => {
      // The cast lets us reuse a single push signature across both kinds
      // while keeping each bucket type-correct.
      if (kind === 'contacts') {
        const ev = event as RealtimeEvent<TC>;
        const id = ev.kind === 'upsert' ? (ev.row as { id: string }).id : ev.id;
        contactsBucket.events.set(id, ev);
        schedule(contactsBucket, handlers.contacts);
      } else {
        const ev = event as RealtimeEvent<TA>;
        const id = ev.kind === 'upsert' ? (ev.row as { id: string }).id : ev.id;
        assetsBucket.events.set(id, ev);
        schedule(assetsBucket, handlers.assets);
      }
    },
    flush: () => {
      flushBucket(contactsBucket, handlers.contacts);
      flushBucket(assetsBucket, handlers.assets);
    },
    cancel: () => {
      if (contactsBucket.timer) clearTimeout(contactsBucket.timer);
      if (assetsBucket.timer) clearTimeout(assetsBucket.timer);
      contactsBucket.timer = null;
      assetsBucket.timer = null;
      contactsBucket.events.clear();
      assetsBucket.events.clear();
    },
  };
}
