'use client';

/**
 * useNavigateToRow — the canonical click→land primitive for the command
 * palette, @mention pills, and tool-card "Jump to" buttons.
 *
 * The store's `jumpTo(id, kind)` only flips a `scrollIntent` flag. Two
 * layers listen:
 *   1. `VirtualPanelList` — finds the row's index in the active item
 *      list and calls `virtualizer.scrollToIndex` so an off-screen row
 *      scrolls into the render window FIRST. Without this, virtualization
 *      silently drops the intent for any row not currently mounted.
 *   2. `ContactRow` / `AssetRow` — once mounted, runs the local
 *      "scrollIntoView + open + clear highlight after 1.2s" effect.
 *
 * Both layers require the row to exist in the current panel items list.
 * Three things can break that:
 *
 *   a. The active view is the wrong kind (assets vs contacts). The row
 *      component is never built.
 *   b. The row is not in the loaded server-paginated slice (the palette
 *      surfaced it via a server-side search of the full corpus).
 *   c. The row is in the slice but filtered out somewhere — currently
 *      not possible because `visibleContacts` = `contacts` + pin
 *      hoisting, but covered defensively if filtering ever moves
 *      client-side.
 *
 * This hook closes all three gaps deterministically:
 *
 *   1. Switch `panel.view` if `kind` doesn't match it.
 *   2. Fire `jumpTo` immediately so loaded rows scroll instantly.
 *   3. If the row isn't in the store, fetch via
 *      `lookup_{contacts,assets}_by_ids`, upsert it, then re-fire
 *      `jumpTo` with a fresh nonce so the now-rebuilt items list lets
 *      the virtualizer's scroll-to-index find it.
 *   4. Coalesce concurrent in-flight lookups for the same id so a
 *      flurry of clicks fires one network request.
 *   5. Mark the row as recently-updated so the tint pulse lights it
 *      up as the user's eye lands.
 *
 * Idempotent. RLS-scoped (the lookup RPCs are invoker). Awaitable.
 */

import { useCallback } from 'react';
import { getBrowserSupabase } from '../../lib/supabase';
import { useNetworkStore, type Contact, type Asset, type PanelViewMode } from '../../lib/store';

export type NavigateKind = 'contact' | 'asset';

export type NavigateOptions = {
  /** Skip the automatic view toggle. Default false — the hook will
   *  flip `panel.view` to match `kind` because that's almost always
   *  what the user wants when they click a recall result. Pass
   *  `preserveView: true` from call sites that have already
   *  intentionally arranged the panel (e.g., a future "preview in
   *  current view" affordance). */
  preserveView?: boolean;
};

export type NavigateToRow = (
  kind: NavigateKind,
  id: string,
  options?: NavigateOptions,
) => Promise<void>;

/** Module-level cache so a burst of clicks on the same id collapses to
 *  ONE network call. Keyed `<kind>:<id>`. The entry is a Promise so
 *  late callers can await the in-flight result instead of firing again. */
const inFlight = new Map<string, Promise<void>>();

const VIEW_FOR_KIND: Record<NavigateKind, PanelViewMode> = {
  contact: 'contacts',
  asset: 'assets',
};

export function useNavigateToRow(): NavigateToRow {
  const jumpTo = useNetworkStore((s) => s.actions.jumpTo);
  const setPanelState = useNetworkStore((s) => s.actions.setPanelState);
  const upsertContacts = useNetworkStore((s) => s.actions.upsertContacts);
  const upsertAssets = useNetworkStore((s) => s.actions.upsertAssets);
  const markRecentlyUpdated = useNetworkStore((s) => s.actions.markRecentlyUpdated);

  return useCallback(
    async (kind, id, options) => {
      // 1. View toggle. Done BEFORE jumpTo so the items list contains
      //    the right kind of rows by the time the scrollIntent effect
      //    fires on the next render.
      if (!options?.preserveView) {
        const currentView = useNetworkStore.getState().panel.view;
        const wantedView = VIEW_FOR_KIND[kind];
        if (currentView !== wantedView) {
          setPanelState({ view: wantedView }, { source: 'user' });
        }
      }

      // 2. First scroll intent. If the row is already loaded AND in the
      //    matching view, this lands instantly — no network needed.
      //    Set the intent FIRST so the click feels immediate even on
      //    slow networks; the same nonce drives the scroll once the
      //    fetched row mounts.
      jumpTo(id, kind);

      // 3. Inspect the store directly (avoid stale-closure of selector
      //    snapshots — selectors re-fire on every render but we want
      //    the latest committed state here).
      const state = useNetworkStore.getState();
      const inStore =
        kind === 'contact'
          ? state.contacts.some((c) => c.id === id)
          : state.assets.some((a) => a.id === id);
      if (inStore) return;

      // 4. Coalesce concurrent calls for the same id.
      const cacheKey = `${kind}:${id}`;
      const pending = inFlight.get(cacheKey);
      if (pending) return pending;

      const promise = (async () => {
        const supabase = getBrowserSupabase();
        try {
          if (kind === 'contact') {
            const { data, error } = await supabase.rpc('lookup_contacts_by_ids', {
              p_ids: [id],
            } as never);
            if (error) {
              console.warn('[useNavigateToRow] lookup_contacts_by_ids failed:', error.message);
              return;
            }
            const rows = (data ?? []) as unknown as Contact[];
            if (rows.length === 0) {
              console.warn('[useNavigateToRow] contact not found or RLS-denied:', id);
              return;
            }
            upsertContacts(rows);
          } else {
            const { data, error } = await supabase.rpc('lookup_assets_by_ids', {
              p_ids: [id],
            } as never);
            if (error) {
              console.warn('[useNavigateToRow] lookup_assets_by_ids failed:', error.message);
              return;
            }
            const rows = (data ?? []) as unknown as Asset[];
            if (rows.length === 0) {
              console.warn('[useNavigateToRow] asset not found or RLS-denied:', id);
              return;
            }
            upsertAssets(rows);
          }
          // 5. Tint pulse so the user's eye lands as the pane scrolls.
          markRecentlyUpdated(id);
          // 6. Re-fire jumpTo so the now-rebuilt items list (with the
          //    fetched row prepended via mergeWithoutReSorting) gets a
          //    fresh nonce. The virtualizer effect re-runs against the
          //    NEW items array, finds the row, scrolls.
          jumpTo(id, kind);
        } finally {
          inFlight.delete(cacheKey);
        }
      })();
      inFlight.set(cacheKey, promise);
      return promise;
    },
    [jumpTo, setPanelState, upsertContacts, upsertAssets, markRecentlyUpdated],
  );
}

/** Test helper — clears the in-flight cache so tests don't leak across
 *  one another. Not exported to product code. */
export function _resetNavigateToRowInFlight(): void {
  inFlight.clear();
}
