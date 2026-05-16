'use client';

/**
 * useOwnedAssets — lazy-fetch the FULL list of assets owned by a
 * specific contact when the row is expanded for the first time.
 *
 * The parent ContactsAccordion only has the currently-loaded asset
 * slice (a page or two — up to a few hundred rows). For a contact
 * that owns 50+ assets, only the most-recent few may be present. When
 * the user opens that contact, we want to show the COMPLETE list,
 * not a guessing-game subset.
 *
 * One-shot: fetches once per contact id per session. Caches the
 * result module-locally so re-expanding the same contact is instant.
 * On error, the prop-passed `fallback` remains visible — we never go
 * blank.
 */

import { useEffect, useState } from 'react';
import { getBrowserSupabase } from '../../lib/supabase';
import type { Asset } from '../../lib/store';

/** Module-level cache. Keyed by contact id. Survives unmount/remount,
 *  so opening a contact, scrolling away, scrolling back, re-opening
 *  is instant. Cleared only on page reload. */
const cache = new Map<string, Asset[]>();
const inFlight = new Map<string, Promise<Asset[]>>();

const COLS = 'id, name, description, availability, tags, contact_id, created_at, updated_at';

async function fetchOwnedAssets(contactId: string): Promise<Asset[]> {
  // Coalesce concurrent requests for the same id.
  const existing = inFlight.get(contactId);
  if (existing) return existing;
  const promise = (async () => {
    const supabase = getBrowserSupabase();
    const { data, error } = await supabase
      .from('assets')
      .select(COLS)
      .eq('contact_id', contactId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });
    if (error) {
      throw new Error(`useOwnedAssets: ${error.message}`);
    }
    const rows = ((data ?? []) as Asset[]).map((a) => ({
      ...a,
      description: a.description ?? '',
      tags: a.tags ?? [],
    }));
    cache.set(contactId, rows);
    return rows;
  })();
  inFlight.set(contactId, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(contactId);
  }
}

export type UseOwnedAssetsResult = {
  /** Full owned-asset set if loaded; null until the first fetch
   *  resolves. Consumers should fall back to a prop-passed slice
   *  while this is null so the UI never goes blank. */
  assets: Asset[] | null;
  isLoading: boolean;
  error: string | null;
};

export function useOwnedAssets(contactId: string, enabled: boolean): UseOwnedAssetsResult {
  const [assets, setAssets] = useState<Asset[] | null>(() =>
    enabled ? (cache.get(contactId) ?? null) : null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const cached = cache.get(contactId);
    if (cached) {
      setAssets(cached);
      return;
    }
    let alive = true;
    setIsLoading(true);
    setError(null);
    fetchOwnedAssets(contactId)
      .then((rows) => {
        if (!alive) return;
        setAssets(rows);
      })
      .catch((err: Error) => {
        if (!alive) return;
        setError(err.message);
      })
      .finally(() => {
        if (alive) setIsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [contactId, enabled]);

  return { assets, isLoading, error };
}

/** Test helper — clears the module cache. Not exported to product code. */
export function _resetOwnedAssetsCache(): void {
  cache.clear();
  inFlight.clear();
}
