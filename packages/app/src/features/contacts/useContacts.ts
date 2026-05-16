'use client';

/**
 * useContacts — server-driven, lazy, paginated. Scales to 100k+ contacts.
 *
 * Architecture (replaces the old "load everything client-side" model):
 *
 *   1. CACHE PAINT (≈20 ms on warm visits)
 *      First mount reads the last snapshot from IndexedDB and pumps it
 *      into the store. The UI paints with real rows on frame 1 of
 *      every subsequent visit.
 *
 *   2. PAGE 1 (≈150 ms after mount)
 *      Three parallel RPCs:
 *        - network_counts()         — totals for the panel header
 *        - network_facets()         — distinct values + counts for the filter UI
 *        - query_contacts_page(...) — server-filtered + sorted page 1
 *        - query_assets_page(...)   — server-filtered + sorted page 1
 *      Each page returns its filtered total_count via a window
 *      function, so the UI knows "200 of 15,461" without a separate
 *      count query.
 *
 *   3. FILTER / SORT / SEARCH CHANGES
 *      Debounce 200 ms (search is per-keystroke), then refetch page 1
 *      of the affected kind. Old page replaced, scroll resets to top.
 *
 *   4. LOAD MORE (user scrolls within ~50 rows of the end)
 *      ContactsAccordion calls loadMore({kind}) which fetches the next
 *      page and appends. hasMore is derived from offset vs total_count.
 *
 *   5. REALTIME (continuous, best-effort)
 *      Postgres-changes events feed a 50 ms batcher. Upserts merge
 *      into the loaded set in-place. Counts/facets get slightly stale
 *      between full refetches — refreshing them on every realtime
 *      event would create a thundering-herd at scale.
 *
 *   6. OPTIMISTIC UPSERT PATH (orthogonal)
 *      The agent's tool calls dispatch directly into the store via
 *      upsertContacts/upsertAssets. Those rows appear instantly even
 *      if they don't match the current filter — the user sees their
 *      action take effect. Next user-triggered refetch reconciles.
 *
 * Snapshot cache write happens lazily after page-1 fetch. Older pages
 * are not cached separately; on next visit, the cache only restores
 * page 1 worth of rows. That's fine: scroll-loaded pages are re-
 * fetched on demand.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getBrowserSupabase } from '../../lib/supabase';
import {
  useNetworkStore,
  type Contact,
  type Asset,
  type ContactFilterState,
  type AssetFilterState,
  type ContactSortMode,
  type AssetSortMode,
} from '../../lib/store';
import { readNetworkSnapshot, writeNetworkSnapshot, panelViewHash } from './networkCache';
import { makeRealtimeBatcher, type RealtimeEvent } from './realtimeBatcher';

export type { Contact, Asset } from '../../lib/store';

export type UseContactsOptions = {
  /** Required so the IndexedDB cache is keyed per user. */
  userId: string;
};

export type NetworkTotals = { contacts: number; assets: number };

export type FacetCount<T> = { value: T; count: number };
export type NetworkFacets = {
  cities: FacetCount<string>[];
  tags: FacetCount<string>[];
  warmth: FacetCount<number>[];
  assetTags: FacetCount<string>[];
  assetAvailability: FacetCount<string>[];
};

export type UseContactsResult = {
  contacts: Contact[];
  assets: Asset[];
  /** Total alive rows in the user's network — independent of filter. */
  totals: NetworkTotals;
  /** Total rows matching the CURRENT filter (server-reported). The
   *  loaded `contacts.length` is a subset; this is the denominator. */
  filteredTotals: NetworkTotals;
  /** Distinct values for each filterable column with counts. Refreshes
   *  on mount + after realtime echoes (debounced). */
  facets: NetworkFacets;
  /** Page-1 fetch in flight (initial load AND filter/sort change). */
  isLoading: boolean;
  /** A refetch is in flight — the loaded rows are "stale" until it
   *  completes. UI uses this to dim-and-crossfade instead of going
   *  blank between filter changes. */
  isRefetching: { contacts: boolean; assets: boolean };
  /** User is typing in the search box but the debounce hasn't fired
   *  yet. UI shows this as a search-input spinner so typing doesn't
   *  feel like "nothing is happening." */
  isSearchPending: boolean;
  /** loadMore() fetch in flight (per kind). */
  isLoadingMore: { contacts: boolean; assets: boolean };
  /** Whether there are more rows past the currently loaded set. */
  hasMore: { contacts: boolean; assets: boolean };
  /** Imperatively fetch the next page of the given kind. */
  loadMore: (kind: 'contacts' | 'assets') => Promise<void>;
  /** Force a full refetch — page 1 + counts + facets. */
  refetch: () => Promise<void>;
  /** Last error from a server query, if any. Cleared on next success.
   *  Drives a "Couldn't load — Retry" banner in the UI. */
  error: string | null;
  /** Imperatively clear the error and try again. */
  retry: () => Promise<void>;
};

const PAGE_SIZE = 200;
/** Per-keystroke search debounce. Filter/sort/view changes do NOT
 *  use this — they fire immediately because the user clicked an
 *  intentional control and a 200ms delay reads as lag, not polish. */
const SEARCH_DEBOUNCE_MS = 200;
/** Realtime burst coalesce window. */
const REALTIME_DEBOUNCE_MS = 300;

const EMPTY_FACETS: NetworkFacets = {
  cities: [],
  tags: [],
  warmth: [],
  assetTags: [],
  assetAvailability: [],
};

// Raw RPC row shape — includes total_count window column.
type ContactRpcRow = Contact & { total_count: number; asset_count: number };
type AssetRpcRow = Asset & { total_count: number };

function rpcToContact(row: ContactRpcRow): Contact {
  return {
    id: row.id,
    name: row.name,
    warmth: row.warmth,
    city: row.city,
    tags: row.tags ?? [],
    notes: row.notes ?? '',
    created_at: row.created_at,
    updated_at: row.updated_at,
    asset_count: row.asset_count,
  };
}

function rpcToAsset(row: AssetRpcRow): Asset {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    availability: row.availability ?? null,
    tags: row.tags ?? [],
    contact_id: row.contact_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Map the client filter state to the RPC's argument shape. Keys
 *  prefixed `p_` per the SQL convention. UNDEFINED (not null!) signals
 *  "no constraint" — PostgREST omits undefined keys from the JSON
 *  body, and PostgreSQL applies the SQL DEFAULT (null) for each. The
 *  generated Database types model defaults as undefined. */
function contactsRpcArgs(
  filter: ContactFilterState,
  sort: ContactSortMode,
  search: string,
  offset: number,
  limit: number,
): Record<string, unknown> {
  const q = search.trim();
  return {
    p_search: q || undefined,
    p_cities: filter.cities.length > 0 ? filter.cities : undefined,
    p_warmth: filter.warmth.length > 0 ? filter.warmth : undefined,
    p_tags_any: filter.tags.length > 0 ? filter.tags : undefined,
    p_tags_all: filter.tagsAll.length > 0 ? filter.tagsAll : undefined,
    p_has_assets: filter.hasAssets ?? undefined,
    p_updated_within_days: filter.updatedWithinDays ?? undefined,
    p_sort: sort,
    p_offset: offset,
    p_limit: limit,
  };
}

function assetsRpcArgs(
  filter: AssetFilterState,
  sort: AssetSortMode,
  search: string,
  offset: number,
  limit: number,
): Record<string, unknown> {
  const q = search.trim();
  return {
    p_search: q || undefined,
    p_tags_any: filter.tags.length > 0 ? filter.tags : undefined,
    p_tags_all: filter.tagsAll.length > 0 ? filter.tagsAll : undefined,
    p_owner_ids: filter.ownerIds.length > 0 ? filter.ownerIds : undefined,
    p_has_owner: filter.hasOwner ?? undefined,
    p_availability_contains: filter.availabilityContains.trim() || undefined,
    p_updated_within_days: filter.updatedWithinDays ?? undefined,
    p_sort: sort,
    p_offset: offset,
    p_limit: limit,
  };
}

export function useContacts(options: UseContactsOptions): UseContactsResult {
  const { userId } = options;

  // Pull canonical lists from the zustand store. The store remains the
  // single source of truth for rendering — useContacts is the
  // orchestration layer that decides WHAT to put into it and WHEN.
  const contacts = useNetworkStore((s) => s.contacts);
  const assets = useNetworkStore((s) => s.assets);
  const panel = useNetworkStore((s) => s.panel);
  const {
    setSnapshot,
    replaceContacts,
    replaceAssets,
    appendContacts,
    appendAssets,
    upsertContacts,
    upsertAssets,
    removeContact,
    removeAsset,
    setLoading,
    markRecentlyUpdated,
  } = useNetworkStore((s) => s.actions);

  // Stable ref so the long-lived realtime effect doesn't tear down
  // every time the actions object identity changes.
  const actionsRef = useRef({
    setSnapshot,
    replaceContacts,
    replaceAssets,
    appendContacts,
    appendAssets,
    upsertContacts,
    upsertAssets,
    removeContact,
    removeAsset,
    setLoading,
    markRecentlyUpdated,
  });
  actionsRef.current = {
    setSnapshot,
    replaceContacts,
    replaceAssets,
    appendContacts,
    appendAssets,
    upsertContacts,
    upsertAssets,
    removeContact,
    removeAsset,
    setLoading,
    markRecentlyUpdated,
  };

  const [totals, setTotals] = useState<NetworkTotals>({ contacts: 0, assets: 0 });
  const [filteredTotals, setFilteredTotals] = useState<NetworkTotals>({
    contacts: 0,
    assets: 0,
  });
  const [facets, setFacets] = useState<NetworkFacets>(EMPTY_FACETS);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState({ contacts: false, assets: false });
  const [isSearchPending, setIsSearchPending] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState({ contacts: false, assets: false });
  const [error, setError] = useState<string | null>(null);
  /** Bumped whenever realtime fires (debounced) so the page-1 effects
   *  re-run and the top of the list stays fresh. Pages 2+ get stale
   *  between bumps; users scrolled there see consistent rows even
   *  through bursts of inserts at the top. */
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Offsets are owned by refs so loadMore can read the latest without
  // closure issues, AND the page-1 refetch can reset them atomically.
  const contactOffsetRef = useRef(0);
  const assetOffsetRef = useRef(0);
  // Tracks "what filter+sort+search are we currently rendering pages
  // for" so a stale page-2 response from before the filter changed
  // can be discarded.
  const contactsViewKeyRef = useRef('');
  const assetsViewKeyRef = useRef('');

  // ── Fetch helpers ────────────────────────────────────────────────

  const fetchContactsPage = useCallback(
    async (
      filter: ContactFilterState,
      sort: ContactSortMode,
      search: string,
      offset: number,
      viewKey: string,
    ): Promise<{ rows: Contact[]; total: number }> => {
      const supabase = getBrowserSupabase();
      const { data, error } = await supabase.rpc(
        'query_contacts_page',
        contactsRpcArgs(filter, sort, search, offset, PAGE_SIZE) as never,
      );
      if (error) throw new Error(`query_contacts_page: ${error.message}`);
      const rpcRows = (data ?? []) as unknown as ContactRpcRow[];
      // If the active viewKey moved on while this request was in
      // flight, discard the result — applying it would clobber the
      // current page with stale data.
      if (contactsViewKeyRef.current !== viewKey) {
        return { rows: [], total: 0 };
      }
      const rows = rpcRows.map(rpcToContact);
      const total = rpcRows[0]?.total_count ?? 0;
      return { rows, total };
    },
    [],
  );

  const fetchAssetsPage = useCallback(
    async (
      filter: AssetFilterState,
      sort: AssetSortMode,
      search: string,
      offset: number,
      viewKey: string,
    ): Promise<{ rows: Asset[]; total: number }> => {
      const supabase = getBrowserSupabase();
      const { data, error } = await supabase.rpc(
        'query_assets_page',
        assetsRpcArgs(filter, sort, search, offset, PAGE_SIZE) as never,
      );
      if (error) throw new Error(`query_assets_page: ${error.message}`);
      const rpcRows = (data ?? []) as unknown as AssetRpcRow[];
      if (assetsViewKeyRef.current !== viewKey) {
        return { rows: [], total: 0 };
      }
      const rows = rpcRows.map(rpcToAsset);
      const total = rpcRows[0]?.total_count ?? 0;
      return { rows, total };
    },
    [],
  );

  const refreshCounts = useCallback(async (): Promise<void> => {
    const supabase = getBrowserSupabase();
    const { data, error } = await supabase.rpc('network_counts');
    if (error) {
      console.warn('[useContacts] network_counts failed:', error.message);
      return;
    }
    const rows = (data ?? []) as unknown as Array<{ contacts: number; assets: number }>;
    const row = rows[0];
    if (row) setTotals({ contacts: Number(row.contacts), assets: Number(row.assets) });
  }, []);

  const refreshFacets = useCallback(async (): Promise<void> => {
    const supabase = getBrowserSupabase();
    const { data, error } = await supabase.rpc('network_facets');
    if (error) {
      console.warn('[useContacts] network_facets failed:', error.message);
      return;
    }
    if (!data) return;
    const json = data as unknown as {
      cities?: FacetCount<string>[];
      tags?: FacetCount<string>[];
      warmth?: FacetCount<number>[];
      asset_tags?: FacetCount<string>[];
      asset_availability?: FacetCount<string>[];
    };
    setFacets({
      cities: json.cities ?? [],
      tags: json.tags ?? [],
      warmth: json.warmth ?? [],
      assetTags: json.asset_tags ?? [],
      assetAvailability: json.asset_availability ?? [],
    });
  }, []);

  // ── Page-1 effects: smart debounce strategy ──────────────────────
  //
  // Filter and sort changes are deliberate user clicks — they should
  // fire IMMEDIATELY. Only per-keystroke search needs debouncing.
  //
  // Strategy: track the previous search value in a ref. When the
  // effect fires:
  //   - If only filter/sort changed → run the fetch synchronously.
  //   - If search changed → wait SEARCH_DEBOUNCE_MS, then fetch.
  //
  // `isSearchPending` flips on so the UI can show a spinner inside
  // the search input until the matching page returns.

  const contactFilter = panel.contactFilter;
  const contactSort = panel.contactSort;
  const search = panel.search;
  const prevSearchRef = useRef(search);

  useEffect(() => {
    const searchChanged = prevSearchRef.current !== search;
    prevSearchRef.current = search;
    const delay = searchChanged ? SEARCH_DEBOUNCE_MS : 0;
    const viewKey = JSON.stringify({ contactFilter, contactSort, search });

    if (searchChanged) setIsSearchPending(true);
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      contactsViewKeyRef.current = viewKey;
      contactOffsetRef.current = 0;
      setIsRefetching((p) => ({ ...p, contacts: true }));
      void (async () => {
        try {
          const { rows, total } = await fetchContactsPage(
            contactFilter,
            contactSort,
            search,
            0,
            viewKey,
          );
          if (cancelled || contactsViewKeyRef.current !== viewKey) return;
          actionsRef.current.replaceContacts(rows);
          contactOffsetRef.current = rows.length;
          setFilteredTotals((p) => ({ ...p, contacts: total }));
          setError(null);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn('[useContacts] contacts page-1 fetch failed:', msg);
          if (!cancelled) setError(msg);
        } finally {
          if (!cancelled) {
            setIsRefetching((p) => ({ ...p, contacts: false }));
            setIsSearchPending(false);
          }
        }
      })();
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [contactFilter, contactSort, search, refreshNonce, fetchContactsPage]);

  // ── Page-1 effect: assets — same smart-debounce strategy ────────

  const assetFilter = panel.assetFilter;
  const assetSort = panel.assetSort;
  const prevSearchAssetsRef = useRef(search);

  useEffect(() => {
    const searchChanged = prevSearchAssetsRef.current !== search;
    prevSearchAssetsRef.current = search;
    const delay = searchChanged ? SEARCH_DEBOUNCE_MS : 0;
    const viewKey = JSON.stringify({ assetFilter, assetSort, search });

    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      assetsViewKeyRef.current = viewKey;
      assetOffsetRef.current = 0;
      setIsRefetching((p) => ({ ...p, assets: true }));
      void (async () => {
        try {
          const { rows, total } = await fetchAssetsPage(assetFilter, assetSort, search, 0, viewKey);
          if (cancelled || assetsViewKeyRef.current !== viewKey) return;
          actionsRef.current.replaceAssets(rows);
          assetOffsetRef.current = rows.length;
          setFilteredTotals((p) => ({ ...p, assets: total }));
          setError(null);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn('[useContacts] assets page-1 fetch failed:', msg);
          if (!cancelled) setError(msg);
        } finally {
          if (!cancelled) {
            setIsRefetching((p) => ({ ...p, assets: false }));
          }
        }
      })();
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [assetFilter, assetSort, search, refreshNonce, fetchAssetsPage]);

  // ── Mount-time bootstrap: cache → counts + facets + realtime ───

  useEffect(() => {
    let alive = true;
    const supabase = getBrowserSupabase();

    // Cache hydration is keyed by the current panel view hash so a
    // different filter never paints the wrong rows. Same key used by
    // the writeback effect — they MUST agree or we'd hydrate a stale
    // snapshot from a previous filter.
    const initialViewHash = panelViewHash(useNetworkStore.getState().panel);
    (async () => {
      const cached = await readNetworkSnapshot(userId, initialViewHash);
      if (!alive || !cached) {
        if (alive) actionsRef.current.setLoading({ phase: 'cold' });
        return;
      }
      actionsRef.current.setSnapshot({ contacts: cached.contacts, assets: cached.assets });
      actionsRef.current.setLoading({
        phase: 'cached',
        total: cached.contacts.length + cached.assets.length,
      });
    })();

    // Bootstrap network calls — counts + facets in parallel. Page-1
    // refetches are owned by the dedicated effects above.
    (async () => {
      try {
        setIsLoading(true);
        actionsRef.current.setLoading({ phase: 'syncing' });
        await Promise.all([refreshCounts(), refreshFacets()]);
      } finally {
        if (alive) {
          setIsLoading(false);
          actionsRef.current.setLoading({ phase: 'idle' });
        }
      }
    })();

    // Realtime — coalesce events for 50 ms, then upsert/remove into
    // the current loaded set. Stale counts/facets are accepted as the
    // cost of not refetching on every event at scale.
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
        // ASSETS — also patch the owning contact's asset_count in the
        // loaded set so the badge updates immediately. The next page-1
        // refetch reconciles against the server. Without this, an
        // agent that adds an asset to a contact wouldn't bump the
        // visible "N assets" badge until the next manual refresh.
        if (toUpsert.length > 0) {
          a.upsertAssets(toUpsert as Asset[]);
          patchOwnerCountsOnAssetUpsert(toUpsert as Asset[]);
        }
        for (const id of toRemove) {
          patchOwnerCountsOnAssetRemove(id);
          a.removeAsset(id);
        }
      }
      // Debounced refresh of counts + facets so the header denominator
      // tracks reality without thundering on every realtime burst.
      scheduleCountsFacetsRefresh();
    }

    /** Local optimistic patch: when realtime says an asset was added/
     *  updated for contact X, bump X's asset_count by 1 if this is a
     *  new asset id we haven't seen attached to X before. */
    function patchOwnerCountsOnAssetUpsert(rows: Asset[]): void {
      const state = useNetworkStore.getState();
      const knownAssetsByOwner = new Map<string, Set<string>>();
      for (const a of state.assets) {
        if (!a.contact_id) continue;
        const set = knownAssetsByOwner.get(a.contact_id) ?? new Set();
        set.add(a.id);
        knownAssetsByOwner.set(a.contact_id, set);
      }
      const deltaByContact = new Map<string, number>();
      for (const row of rows) {
        if (!row.contact_id) continue;
        const wasKnownToOwner = knownAssetsByOwner.get(row.contact_id)?.has(row.id);
        if (wasKnownToOwner) continue;
        deltaByContact.set(row.contact_id, (deltaByContact.get(row.contact_id) ?? 0) + 1);
      }
      if (deltaByContact.size === 0) return;
      const nextContacts = state.contacts.map((c) => {
        const delta = deltaByContact.get(c.id);
        if (!delta || c.asset_count == null) return c;
        return { ...c, asset_count: c.asset_count + delta };
      });
      actionsRef.current.replaceContacts(nextContacts);
    }

    /** Local optimistic patch: when realtime says an asset was removed,
     *  decrement the owning contact's asset_count. */
    function patchOwnerCountsOnAssetRemove(assetId: string): void {
      const state = useNetworkStore.getState();
      const removed = state.assets.find((a) => a.id === assetId);
      if (!removed?.contact_id) return;
      const ownerId = removed.contact_id;
      const nextContacts = state.contacts.map((c) => {
        if (c.id !== ownerId || c.asset_count == null) return c;
        return { ...c, asset_count: Math.max(0, c.asset_count - 1) };
      });
      actionsRef.current.replaceContacts(nextContacts);
    }

    let countsFacetsTimer: ReturnType<typeof setTimeout> | null = null;
    function scheduleCountsFacetsRefresh(): void {
      if (countsFacetsTimer) clearTimeout(countsFacetsTimer);
      countsFacetsTimer = setTimeout(() => {
        void refreshCounts();
        void refreshFacets();
        // Also bump the refresh nonce so the page-1 effects re-run.
        // Keeps the top of the list fresh through realtime bursts.
        setRefreshNonce((n) => n + 1);
      }, REALTIME_DEBOUNCE_MS);
    }

    const chan = supabase
      .channel('public:contacts-assets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, (payload) => {
        const row = (payload.new ?? payload.old) as Contact | null;
        if (!row) return;
        if (payload.eventType === 'DELETE' || row.deleted_at) {
          batcher.push('contacts', { kind: 'remove', id: row.id });
        } else {
          batcher.push('contacts', { kind: 'upsert', row });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assets' }, (payload) => {
        const row = (payload.new ?? payload.old) as Asset | null;
        if (!row) return;
        if (payload.eventType === 'DELETE' || row.deleted_at) {
          batcher.push('assets', { kind: 'remove', id: row.id });
        } else {
          batcher.push('assets', { kind: 'upsert', row });
        }
      })
      .subscribe();

    // Backstop: after an agent turn finishes, refresh counts/facets +
    // page 1 to pick up any optimistic miss. Cheap insurance.
    //
    // ALSO: when the agent's set_panel / clear_panel tool fires, it
    // dispatches this event with the SERVER-CONFIRMED totals it just
    // read. Adopt those immediately so the panel header matches the
    // chat card without waiting for the page-1 refetch to land.
    const onChanged = (e: Event): void => {
      const ce = e as CustomEvent<{ totals?: NetworkTotals }>;
      if (ce.detail?.totals) {
        setFilteredTotals(ce.detail.totals);
      }
      scheduleCountsFacetsRefresh();
    };
    window.addEventListener('reknowable:network-changed', onChanged);

    return () => {
      alive = false;
      window.removeEventListener('reknowable:network-changed', onChanged);
      if (countsFacetsTimer) clearTimeout(countsFacetsTimer);
      batcher.cancel();
      void supabase.removeChannel(chan);
    };
  }, [userId, refreshCounts, refreshFacets]);

  // ── Pinned-always-loaded.
  //
  // The right pane's "Pinned" section must show EVERY pinned id, even
  // if it doesn't match the active filter. If the agent pins a contact
  // tagged 'gaming' and the user's filter is 'investor', that pinned
  // contact would otherwise disappear — pinning is supposed to OVERRIDE
  // filter. This effect ensures every pinned id is in the loaded set
  // by fetching the missing ones via lookup_*_by_ids.

  const pinnedContactIds = panel.pinnedContactIds;
  const pinnedAssetIds = panel.pinnedAssetIds;

  useEffect(() => {
    if (pinnedContactIds.length === 0) return;
    const loadedIds = new Set(contacts.map((c) => c.id));
    const missing = pinnedContactIds.filter((id) => !loadedIds.has(id));
    if (missing.length === 0) return;
    void (async () => {
      const supabase = getBrowserSupabase();
      const { data, error } = await supabase.rpc('lookup_contacts_by_ids', {
        p_ids: missing,
      } as never);
      if (error) {
        console.warn('[useContacts] pinned-contacts lookup failed:', error.message);
        return;
      }
      const rows = (data ?? []) as unknown as Contact[];
      if (rows.length > 0) actionsRef.current.upsertContacts(rows);
    })();
  }, [pinnedContactIds, contacts]);

  useEffect(() => {
    if (pinnedAssetIds.length === 0) return;
    const loadedIds = new Set(assets.map((a) => a.id));
    const missing = pinnedAssetIds.filter((id) => !loadedIds.has(id));
    if (missing.length === 0) return;
    void (async () => {
      const supabase = getBrowserSupabase();
      const { data, error } = await supabase.rpc('lookup_assets_by_ids', {
        p_ids: missing,
      } as never);
      if (error) {
        console.warn('[useContacts] pinned-assets lookup failed:', error.message);
        return;
      }
      const rows = (data ?? []) as unknown as Asset[];
      if (rows.length > 0) actionsRef.current.upsertAssets(rows);
    })();
  }, [pinnedAssetIds, assets]);

  // ── Cache writeback: persist the current contacts/assets to IDB
  //    after they stabilize. Debounced so a flurry of upserts doesn't
  //    write 50 times.

  useEffect(() => {
    const t = setTimeout(() => {
      if (contacts.length === 0 && assets.length === 0) return;
      // Cache key MATCHES the hydration key so the next mount with the
      // same view sees these rows. A different view hash → separate
      // cache entry, no cross-contamination.
      const viewHash = panelViewHash(useNetworkStore.getState().panel);
      void writeNetworkSnapshot({
        userId,
        viewHash,
        contacts,
        assets,
        fetchedAt: Date.now(),
      });
    }, 500);
    return () => clearTimeout(t);
  }, [userId, contacts, assets]);

  // ── loadMore: fetch the next page of the given kind and append.

  const loadMore = useCallback(
    async (kind: 'contacts' | 'assets'): Promise<void> => {
      if (kind === 'contacts') {
        if (isLoadingMore.contacts) return;
        const loaded = contactOffsetRef.current;
        if (loaded >= filteredTotals.contacts) return;
        setIsLoadingMore((p) => ({ ...p, contacts: true }));
        try {
          const viewKey = contactsViewKeyRef.current;
          const { rows } = await fetchContactsPage(
            contactFilter,
            contactSort,
            search,
            loaded,
            viewKey,
          );
          if (rows.length > 0) {
            actionsRef.current.appendContacts(rows);
            contactOffsetRef.current += rows.length;
          }
        } catch (err) {
          console.warn('[useContacts] loadMore contacts failed:', err);
        } finally {
          setIsLoadingMore((p) => ({ ...p, contacts: false }));
        }
      } else {
        if (isLoadingMore.assets) return;
        const loaded = assetOffsetRef.current;
        if (loaded >= filteredTotals.assets) return;
        setIsLoadingMore((p) => ({ ...p, assets: true }));
        try {
          const viewKey = assetsViewKeyRef.current;
          const { rows } = await fetchAssetsPage(assetFilter, assetSort, search, loaded, viewKey);
          if (rows.length > 0) {
            actionsRef.current.appendAssets(rows);
            assetOffsetRef.current += rows.length;
          }
        } catch (err) {
          console.warn('[useContacts] loadMore assets failed:', err);
        } finally {
          setIsLoadingMore((p) => ({ ...p, assets: false }));
        }
      }
    },
    [
      isLoadingMore.contacts,
      isLoadingMore.assets,
      filteredTotals.contacts,
      filteredTotals.assets,
      contactFilter,
      contactSort,
      assetFilter,
      assetSort,
      search,
      fetchContactsPage,
      fetchAssetsPage,
    ],
  );

  const refetch = useCallback(async (): Promise<void> => {
    const contactsKey = JSON.stringify({ contactFilter, contactSort, search });
    const assetsKey = JSON.stringify({ assetFilter, assetSort, search });
    contactsViewKeyRef.current = contactsKey;
    assetsViewKeyRef.current = assetsKey;
    contactOffsetRef.current = 0;
    assetOffsetRef.current = 0;
    setIsRefetching({ contacts: true, assets: true });
    try {
      const [contactPage, assetPage] = await Promise.all([
        fetchContactsPage(contactFilter, contactSort, search, 0, contactsKey),
        fetchAssetsPage(assetFilter, assetSort, search, 0, assetsKey),
        refreshCounts(),
        refreshFacets(),
      ]);
      actionsRef.current.setSnapshot({ contacts: contactPage.rows, assets: assetPage.rows });
      contactOffsetRef.current = contactPage.rows.length;
      assetOffsetRef.current = assetPage.rows.length;
      setFilteredTotals({ contacts: contactPage.total, assets: assetPage.total });
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsRefetching({ contacts: false, assets: false });
    }
  }, [
    contactFilter,
    contactSort,
    assetFilter,
    assetSort,
    search,
    fetchContactsPage,
    fetchAssetsPage,
    refreshCounts,
    refreshFacets,
  ]);

  const retry = useCallback(async (): Promise<void> => {
    setError(null);
    await refetch();
  }, [refetch]);

  const hasMore = {
    contacts: contacts.length < filteredTotals.contacts,
    assets: assets.length < filteredTotals.assets,
  };

  return {
    contacts,
    assets,
    totals,
    filteredTotals,
    facets,
    isLoading,
    isRefetching,
    isSearchPending,
    isLoadingMore,
    hasMore,
    loadMore,
    refetch,
    error,
    retry,
  };
}
