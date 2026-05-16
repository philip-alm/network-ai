'use client';

/**
 * useOwnerName — lazy-fetch a contact's name for asset row "Owned by X"
 * pills when the contact isn't in the loaded slice.
 *
 * AssetRow renders `contactById.get(asset.contact_id)?.name` to label
 * the owner. With server-side asset pagination, an asset's owner might
 * not be in the currently-loaded contacts page — so the pill silently
 * goes blank. This hook backfills it.
 *
 * Module-level cache: same contact's name resolves instantly across
 * any asset rows that share an owner. Survives unmount/remount; cleared
 * only on page reload.
 *
 * RLS-scoped. Soft-delete aware (deleted contacts return no row).
 */

import { useEffect, useState } from 'react';
import { getBrowserSupabase } from '../../lib/supabase';

const cache = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();

async function fetchName(contactId: string): Promise<string | null> {
  const cached = cache.get(contactId);
  if (cached) return cached;
  const existing = inFlight.get(contactId);
  if (existing) return existing;
  const promise = (async () => {
    const supabase = getBrowserSupabase();
    const { data, error } = await supabase.rpc('lookup_contacts_by_ids', {
      p_ids: [contactId],
    } as never);
    if (error) {
      console.warn('[useOwnerName] lookup failed:', error.message);
      return null;
    }
    const rows = (data ?? []) as unknown as Array<{ name: string }>;
    const name = rows[0]?.name ?? null;
    if (name) cache.set(contactId, name);
    return name;
  })();
  inFlight.set(contactId, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(contactId);
  }
}

/**
 * Returns the contact's name, falling back to lazy fetch if not in
 * the cache (and not in the prop-passed `knownName`). Returns null
 * while the fetch is in flight or if the contact doesn't exist.
 *
 * @param contactId  Contact id to resolve. Pass null/undefined to skip.
 * @param knownName  If the parent already has a name (from loaded
 *                   contacts), pass it here — skips the fetch entirely.
 */
export function useOwnerName(
  contactId: string | null | undefined,
  knownName: string | null | undefined,
): string | null {
  const [name, setName] = useState<string | null>(() => {
    if (!contactId) return null;
    if (knownName) return knownName;
    return cache.get(contactId) ?? null;
  });

  useEffect(() => {
    if (!contactId) {
      setName(null);
      return;
    }
    if (knownName) {
      setName(knownName);
      return;
    }
    const cached = cache.get(contactId);
    if (cached) {
      setName(cached);
      return;
    }
    let alive = true;
    fetchName(contactId).then((n) => {
      if (alive) setName(n);
    });
    return () => {
      alive = false;
    };
  }, [contactId, knownName]);

  return name;
}

/** Test helper — clears the name cache. Not exported to product code. */
export function _resetOwnerNameCache(): void {
  cache.clear();
  inFlight.clear();
}
