'use client';

import { useCallback, useEffect, useRef } from 'react';
import { getBrowserSupabase } from '../../lib/supabase';
import { useNetworkStore, type Contact, type Asset } from '../../lib/store';
import { readNetworkSnapshot, writeNetworkSnapshot } from './networkCache';
import { makeRealtimeBatcher, type RealtimeEvent } from './realtimeBatcher';

export type { Contact, Asset } from '../../lib/store';

export type UseContactsOptions = {
  /** Required so the IndexedDB cache is keyed per user. */
  userId: string;
};

const FIRST_PAGE_SIZE = 200;
const PAGINATION_CHUNK = 500;

/**
 * All columns pulled on the first page + during pagination. We used to
 * omit notes/description ("light cols") and lazy-fetch them on row
 * expand, but that produced a visible 100-400 ms lag on every open AND
 * a two-render dance (open → fetch → update with notes) that made the
 * expansion feel jank. Notes are bounded by user typing — at typical
 * scale (~500 contacts × 200 chars) the payload addition is trivial.
 * At extreme scale (10k contacts × 500 chars = ~5 MB pre-gzip) it's
 * still acceptable and the cache absorbs the cost on subsequent visits.
 */
const CONTACT_COLS = 'id, name, warmth, city, tags, notes, created_at, updated_at, deleted_at';
const ASSET_COLS =
  'id, name, description, availability, tags, contact_id, created_at, updated_at, deleted_at';

function fillContact(c: Contact): Contact {
  return { ...c, notes: c.notes ?? '' };
}
function fillAsset(a: Asset): Asset {
  return { ...a, description: a.description ?? '' };
}

/**
 * useContacts — hydrates the cross-pane Zustand store with the user's
 * network. Orchestration:
 *
 *   1. CACHE HYDRATION (synchronous-feeling, ~20 ms)
 *      Read the last-saved snapshot from IndexedDB and dump it into
 *      the store. The UI paints with real rows on frame 1 of every
 *      subsequent visit.
 *
 *   2. FIRST PAGE (~150 ms after mount)
 *      Pull the 200 most-recently-updated contacts + assets with
 *      LIGHT columns (no notes / description — those are heavy and
 *      lazy-loaded on row expand). Merge into the store. Phase
 *      advances cached → syncing → paginating.
 *
 *   3. BACKGROUND PAGINATION
 *      Drain the remainder in 500-row chunks via a cursor on
 *      updated_at. Merge each chunk as it lands. Write the final
 *      snapshot to the cache.
 *
 *   4. REALTIME (continuous)
 *      Postgres-changes events feed a 50 ms-window batcher so a
 *      flood becomes a single store update. Per-row last-write-wins.
 *      Every realtime upsert also marks the row recentlyUpdated so
 *      the UI can pulse the accent tint.
 *
 *   5. POST-AGENT-TURN REFETCH (best-effort backstop)
 *      Listens for `reknowable:network-changed` and re-runs page 1
 *      so the right pane catches anything the optimistic path or
 *      realtime missed (rare, but cheap insurance).
 */
export function useContacts(options: UseContactsOptions): {
  contacts: Contact[];
  assets: Asset[];
  refetch: () => Promise<void>;
} {
  const { userId } = options;
  const contacts = useNetworkStore((s) => s.contacts);
  const assets = useNetworkStore((s) => s.assets);
  const {
    setSnapshot,
    upsertContacts,
    upsertAssets,
    removeContact,
    removeAsset,
    setLoading,
    markRecentlyUpdated,
  } = useNetworkStore((s) => s.actions);
  // Stable refs so the long-lived effect doesn't re-run when actions
  // identity changes between renders (zustand returns a fresh object).
  const actionsRef = useRef({
    setSnapshot,
    upsertContacts,
    upsertAssets,
    removeContact,
    removeAsset,
    setLoading,
    markRecentlyUpdated,
  });
  actionsRef.current = {
    setSnapshot,
    upsertContacts,
    upsertAssets,
    removeContact,
    removeAsset,
    setLoading,
    markRecentlyUpdated,
  };

  // Fully cumulative re-fetch (page 1 + background drain), used by
  // both initial mount and the post-agent-turn refresh event.
  const fetchAll = useCallback(async (): Promise<void> => {
    const supabase = getBrowserSupabase();
    const a = actionsRef.current;
    a.setLoading({ phase: 'syncing' });

    // FIRST PAGE — top N most-recently-updated, light columns.
    const [cFirst, aFirst] = await Promise.all([
      supabase
        .from('contacts')
        .select(CONTACT_COLS)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(FIRST_PAGE_SIZE),
      supabase
        .from('assets')
        .select(ASSET_COLS)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(FIRST_PAGE_SIZE),
    ]);

    const firstContacts = ((cFirst.data ?? []) as Contact[]).map(fillContact);
    const firstAssets = ((aFirst.data ?? []) as Asset[]).map(fillAsset);
    a.setSnapshot({ contacts: firstContacts, assets: firstAssets });
    a.setLoading({
      phase: 'paginating',
      total: firstContacts.length + firstAssets.length,
    });

    // BACKGROUND PAGINATION via updated_at cursor.
    const drainContacts = drain(
      supabase,
      'contacts',
      CONTACT_COLS,
      firstContacts.at(-1)?.updated_at ?? null,
      (rows) => a.upsertContacts(rows.map((r) => fillContact(r as Contact))),
    );
    const drainAssets = drain(
      supabase,
      'assets',
      ASSET_COLS,
      firstAssets.at(-1)?.updated_at ?? null,
      (rows) => a.upsertAssets(rows.map((r) => fillAsset(r as Asset))),
    );
    await Promise.all([drainContacts, drainAssets]);

    // Write the final snapshot to the cache.
    const finalState = useNetworkStore.getState();
    void writeNetworkSnapshot({
      userId,
      contacts: finalState.contacts,
      assets: finalState.assets,
      fetchedAt: Date.now(),
    });

    a.setLoading({
      phase: 'idle',
      total: finalState.contacts.length + finalState.assets.length,
    });
  }, [userId]);

  useEffect(() => {
    let alive = true;
    const supabase = getBrowserSupabase();

    // ── STEP 1 — Hydrate from cache, then kick off the full fetch.
    (async () => {
      const cached = await readNetworkSnapshot(userId);
      if (!alive) return;
      if (cached) {
        actionsRef.current.setSnapshot({
          contacts: cached.contacts,
          assets: cached.assets,
        });
        actionsRef.current.setLoading({
          phase: 'cached',
          total: cached.contacts.length + cached.assets.length,
        });
      } else {
        actionsRef.current.setLoading({ phase: 'cold' });
      }
      if (!alive) return;
      try {
        await fetchAll();
      } catch {
        // Network failure: keep whatever we have (cache or empty);
        // realtime + next refetch will eventually catch up.
        actionsRef.current.setLoading({ phase: 'idle' });
      }
    })();

    // ── STEP 4 — Realtime, through the 50 ms batcher.
    const batcher = makeRealtimeBatcher<Contact, Asset>(
      {
        contacts: (events) => applyEvents(events, 'contacts'),
        assets: (events) => applyEvents(events, 'assets'),
      },
      { windowMs: 50 },
    );

    function applyEvents<T extends Contact | Asset>(
      events: RealtimeEvent<T>[],
      kind: 'contacts' | 'assets',
    ): void {
      const a = actionsRef.current;
      const toUpsert: T[] = [];
      const toRemove: string[] = [];
      for (const ev of events) {
        if (ev.kind === 'upsert') {
          toUpsert.push(ev.row);
          a.markRecentlyUpdated((ev.row as { id: string }).id);
        } else {
          toRemove.push(ev.id);
        }
      }
      if (kind === 'contacts') {
        if (toUpsert.length > 0) a.upsertContacts(toUpsert as Contact[]);
        for (const id of toRemove) a.removeContact(id);
      } else {
        if (toUpsert.length > 0) a.upsertAssets(toUpsert as Asset[]);
        for (const id of toRemove) a.removeAsset(id);
      }
    }

    const chan = supabase
      .channel('public:contacts-assets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, (payload) => {
        const row = (payload.new ?? payload.old) as Contact | null;
        if (!row) return;
        if (payload.eventType === 'DELETE' || (row as Contact).deleted_at) {
          batcher.push('contacts', { kind: 'remove', id: row.id });
        } else {
          batcher.push('contacts', { kind: 'upsert', row: fillContact(row) });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assets' }, (payload) => {
        const row = (payload.new ?? payload.old) as Asset | null;
        if (!row) return;
        if (payload.eventType === 'DELETE' || (row as Asset).deleted_at) {
          batcher.push('assets', { kind: 'remove', id: row.id });
        } else {
          batcher.push('assets', { kind: 'upsert', row: fillAsset(row) });
        }
      })
      .subscribe();

    // ── STEP 5 — Post-agent-turn backstop.
    const onChanged = (): void => {
      void fetchAll();
    };
    window.addEventListener('reknowable:network-changed', onChanged);

    return () => {
      alive = false;
      window.removeEventListener('reknowable:network-changed', onChanged);
      batcher.cancel();
      void supabase.removeChannel(chan);
    };
  }, [userId, fetchAll]);

  return { contacts, assets, refetch: fetchAll };
}

/**
 * Page through a table via a stable updated_at cursor. Calls onBatch
 * with each chunk so the store grows progressively (no waiting for
 * the whole drain to finish). Stops when a chunk comes back smaller
 * than PAGINATION_CHUNK (= end of data) or when the cursor is null.
 */
async function drain(
  supabase: ReturnType<typeof getBrowserSupabase>,
  table: 'contacts' | 'assets',
  columns: string,
  initialCursor: string | null,
  onBatch: (rows: Array<Record<string, unknown>>) => void,
): Promise<void> {
  let cursor = initialCursor;
  while (cursor) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .is('deleted_at', null)
      .lt('updated_at', cursor)
      .order('updated_at', { ascending: false })
      .limit(PAGINATION_CHUNK);
    if (error || !data || data.length === 0) return;
    const rows = data as unknown as Array<Record<string, unknown>>;
    onBatch(rows);
    if (rows.length < PAGINATION_CHUNK) return;
    cursor = (rows[rows.length - 1]?.updated_at as string | undefined) ?? null;
  }
}
