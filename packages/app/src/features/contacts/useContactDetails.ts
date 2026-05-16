'use client';

import { useEffect, useRef, useState } from 'react';
import { getBrowserSupabase } from '../../lib/supabase';
import { useNetworkStore, type Contact } from '../../lib/store';

/**
 * Module-level cache keyed by id so multiple ContactRow instances
 * don't trigger duplicate fetches for the same row, and so detail
 * fetches survive store-level remounts.
 */
const inFlight = new Map<string, Promise<void>>();
const fetched = new Set<string>();

/**
 * useContactDetails — lazy-load the heavy `notes` field for one
 * contact when it's first needed (typically on row expand).
 *
 * useContacts pulls LIGHT columns on first paint, so contact.notes
 * is the empty string for any row that hasn't been opened yet. This
 * hook detects that state and fills it in. After the fetch, the
 * store's upsert path takes over — re-rendering the row with full
 * notes — so this hook just returns `{ loading }` for UI feedback.
 *
 * Set `enabled: false` to noop (e.g. when the row isn't open).
 */
export function useContactDetails(contactId: string, enabled: boolean): { loading: boolean } {
  const [loading, setLoading] = useState(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) return;
    if (fetched.has(contactId)) return;
    // Check the live store — if notes is already non-empty, the row
    // was either inserted with full data (e.g. via mutate_sql RETURNING)
    // or already hydrated by another consumer.
    const cur = useNetworkStore.getState().contacts.find((c) => c.id === contactId);
    if (cur && cur.notes !== '') {
      fetched.add(contactId);
      return;
    }

    let alive = true;
    setLoading(true);

    const existing = inFlight.get(contactId);
    const p =
      existing ??
      (async () => {
        try {
          const { data, error } = await getBrowserSupabase()
            .from('contacts')
            .select('id, notes')
            .eq('id', contactId)
            .maybeSingle();
          if (error || !data) return;
          const row = data as { id: string; notes: string | null };
          // Merge into store via upsert. We need the existing row to
          // preserve light fields, so look it up first.
          const store = useNetworkStore.getState();
          const existingRow = store.contacts.find((c) => c.id === contactId);
          if (existingRow) {
            store.actions.upsertContacts([{ ...existingRow, notes: row.notes ?? '' }]);
          }
          fetched.add(contactId);
        } finally {
          inFlight.delete(contactId);
        }
      })();
    inFlight.set(contactId, p);

    void p.finally(() => {
      if (alive) setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [contactId, enabled]);

  return { loading };
}

/** Test/dev helper to drop the cache (e.g. after sign-out). */
export function clearContactDetailsCache(): void {
  fetched.clear();
  inFlight.clear();
}

// Touch Contact in the value namespace once so the import isn't tree-
// shaken; we use the actual type inside the inline casts above.
export type _ContactRef = Contact;
