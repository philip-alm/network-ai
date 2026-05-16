'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getBrowserSupabase } from '../../lib/supabase';
import type { Contact, Asset } from '../../lib/store';

/**
 * useNetworkSearch — debounced server-side full-text search.
 *
 * When `query` is non-empty, the hook waits `debounceMs` then calls
 * the `find_anything` RPC (the same one the agent uses) and returns
 * the matched contact + asset ids in rank order. While the call is in
 * flight, `inflight` is true so the UI can show a "searching…" cue.
 *
 * The caller is responsible for using these ids to slice + sort its
 * own list — that way pinning, view-filter, and pinned-section UI
 * still works on top of search results.
 *
 * When the query is empty, `result` is null (caller falls back to its
 * normal filtered list).
 */
export type NetworkSearchResult = {
  contactIds: string[];
  assetIds: string[];
  // Lookup maps for ranking, used by callers that want to sort by score.
  contactScore: Map<string, number>;
  assetScore: Map<string, number>;
};

export type UseNetworkSearchOptions = {
  debounceMs?: number;
  /** When set, also feeds the search through a CLIENT-side substring
   *  scan during the debounce window so the user sees instant feedback
   *  before the server replies. */
  fallback?: {
    contacts: Contact[];
    assets: Asset[];
  };
};

export type UseNetworkSearchValue = {
  result: NetworkSearchResult | null;
  inflight: boolean;
  /** Best-guess fallback computed locally during the debounce window. */
  fallbackResult: NetworkSearchResult | null;
};

export function useNetworkSearch(
  query: string,
  options: UseNetworkSearchOptions = {},
): UseNetworkSearchValue {
  const { debounceMs = 200, fallback } = options;
  const [result, setResult] = useState<NetworkSearchResult | null>(null);
  const [inflight, setInflight] = useState(false);
  // The seq guards us against an older request's response arriving
  // after a newer one — only the latest query's result is committed.
  const seqRef = useRef(0);

  // Trimmed query — empty trim is "no search".
  const q = query.trim();

  // Local fallback while the debounce + RPC is in flight, so the user
  // sees something the moment they type. The server result replaces
  // this once it lands.
  const fallbackResult = useMemo<NetworkSearchResult | null>(() => {
    if (!q || !fallback) return null;
    const needle = q.toLowerCase();
    const contactIds: string[] = [];
    const assetIds: string[] = [];
    for (const c of fallback.contacts) {
      const hay = `${c.name} ${c.notes ?? ''} ${c.city ?? ''} ${c.tags.join(' ')}`.toLowerCase();
      if (hay.includes(needle)) contactIds.push(c.id);
    }
    for (const a of fallback.assets) {
      const hay =
        `${a.name} ${a.description ?? ''} ${a.availability ?? ''} ${a.tags.join(' ')}`.toLowerCase();
      if (hay.includes(needle)) assetIds.push(a.id);
    }
    return {
      contactIds,
      assetIds,
      contactScore: new Map(),
      assetScore: new Map(),
    };
  }, [q, fallback]);

  useEffect(() => {
    if (!q) {
      setResult(null);
      setInflight(false);
      return;
    }
    const seq = ++seqRef.current;
    setInflight(true);
    const handle = setTimeout(async () => {
      try {
        const { data, error } = await getBrowserSupabase().rpc('find_anything', {
          query_terms: [q],
          query_embedding: null,
          regex_pattern: null,
          in_contacts: true,
          in_assets: true,
          required_tags: null,
          any_tags: null,
          min_warmth: null,
          max_warmth: null,
          city_filter: null,
          contains_filter: q,
          has_assets: null,
          recent_days: null,
          match_count: 100,
        });
        if (seq !== seqRef.current) return; // stale response
        if (error || !data) {
          setResult({
            contactIds: [],
            assetIds: [],
            contactScore: new Map(),
            assetScore: new Map(),
          });
          setInflight(false);
          return;
        }
        const payload = data as {
          contacts?: Array<{ id: string; _score?: number }>;
          assets?: Array<{ id: string; _score?: number }>;
        };
        const contacts = payload.contacts ?? [];
        const assets = payload.assets ?? [];
        const contactScore = new Map<string, number>();
        const assetScore = new Map<string, number>();
        for (const c of contacts) contactScore.set(c.id, c._score ?? 0);
        for (const a of assets) assetScore.set(a.id, a._score ?? 0);
        setResult({
          contactIds: contacts.map((c) => c.id),
          assetIds: assets.map((a) => a.id),
          contactScore,
          assetScore,
        });
      } finally {
        if (seq === seqRef.current) setInflight(false);
      }
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [q, debounceMs]);

  return { result, inflight, fallbackResult };
}
