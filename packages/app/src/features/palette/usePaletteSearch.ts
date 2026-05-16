'use client';

/**
 * usePaletteSearch — hybrid local + server search for the command palette.
 *
 * The palette is the most-used recall surface after the chat composer.
 * It MUST be exhaustive: any contact or asset the user has, ever, on
 * any page, regardless of the active right-pane filter, should be
 * findable here. Otherwise it lies — the user types a known name and
 * sees nothing because that contact happens to be on page 3.
 *
 * Strategy:
 *
 *   1. LOCAL PHASE (instant, < 16ms)
 *      Substring + token scoring against the rows already in the store
 *      (page-1 of the active panel filter + pinned + optimistic upserts).
 *      Renders on frame 1 so the dropdown never feels slow on a fast
 *      typist.
 *
 *   2. SERVER PHASE (debounced ~80ms)
 *      `find_anything` RPC — the same hybrid (FTS + trigram + semantic
 *      + substring + regex) the agent's `find` tool uses. Returns full
 *      rows from the user's WHOLE corpus, not just the loaded slice.
 *      Cancels in-flight requests via a seq guard so a fast typist
 *      always sees the latest query's results.
 *
 *   3. MERGE
 *      Once server results arrive, they replace the local fallback —
 *      server ranking is strictly better (FTS + vector + trigram > our
 *      substring buckets). Each result is tagged `source: 'local'` if
 *      its id is also in the local store (zero-fetch click) or
 *      `'server'` if a click will trigger a lookup_*_by_ids fetch via
 *      useNavigateToRow. The palette uses this to render a subtle
 *      "fetching" cue on server-only rows so the user understands the
 *      slight latency.
 *
 * Empty query: returns top recent local rows (no server call). The
 * "you're browsing" path doesn't need to hit the database.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { getBrowserSupabase } from '../../lib/supabase';
import { useNetworkStore, type Contact, type Asset } from '../../lib/store';

export type PaletteResult =
  | {
      kind: 'contact';
      contact: Contact;
      score: number;
      /** 'local' = the row is already in the store; clicking is zero-network.
       *  'server' = the row came from find_anything and isn't loaded yet;
       *             clicking triggers a lookup + upsert via useNavigateToRow. */
      source: 'local' | 'server';
    }
  | {
      kind: 'asset';
      asset: Asset;
      score: number;
      source: 'local' | 'server';
    };

export type UsePaletteSearchOptions = {
  /** Maximum results to surface (across contacts + assets combined). */
  limit?: number;
  /** Per-keystroke server-search debounce. 80ms is the sweet spot
   *  between "fires on every key" (wasteful, rate-limit risk) and
   *  "feels laggy" (≥ 150ms). */
  debounceMs?: number;
};

export type UsePaletteSearchValue = {
  results: PaletteResult[];
  /** Server RPC is in flight. The palette renders a subtle "searching
   *  everywhere" indicator so the user knows results may expand. */
  serverInflight: boolean;
  /** Server search errored (RPC failure, network drop). Local fallback
   *  is still shown; the palette surfaces this as a single-line note. */
  serverError: string | null;
};

const DEFAULT_LIMIT = 8;
const DEFAULT_DEBOUNCE_MS = 80;

/** Strip the find_anything return-shape augments before exposing the
 *  row to consumers. `_score`, `_matched`, `_contact_name` are scoring
 *  metadata — useful inside the hook, not part of the Contact/Asset
 *  contract. */
function stripContactAugments(row: Contact & Record<string, unknown>): Contact {
  // Build a clean Contact in the same shape useContacts.rpcToContact
  // produces, so downstream consumers get a uniform row regardless of
  // which RPC sourced it.
  return {
    id: row.id,
    name: row.name,
    warmth: row.warmth,
    city: row.city,
    tags: row.tags ?? [],
    notes: row.notes ?? '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function stripAssetAugments(row: Asset & Record<string, unknown>): Asset {
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

export function usePaletteSearch(
  query: string,
  options: UsePaletteSearchOptions = {},
): UsePaletteSearchValue {
  const { limit = DEFAULT_LIMIT, debounceMs = DEFAULT_DEBOUNCE_MS } = options;
  const localContacts = useNetworkStore((s) => s.contacts);
  const localAssets = useNetworkStore((s) => s.assets);

  const q = query.trim();

  // ── Local phase — synchronous, instant.
  const localResults = useMemo<PaletteResult[]>(
    () => rankLocal(q, localContacts, localAssets, limit),
    [q, localContacts, localAssets, limit],
  );

  // ── Server phase — debounced + seq-guarded.
  //
  // rawServer holds the LAST committed server response. Tagging
  // `source: 'local' | 'server'` happens in the render-time merge
  // memo so that local upserts (which can land WHILE a search is in
  // flight) get the up-to-date source flag without re-firing the RPC.
  type RawServerResults = { contacts: Contact[]; assets: Asset[]; scores: Map<string, number> };
  const [rawServer, setRawServer] = useState<RawServerResults | null>(null);
  const [serverInflight, setServerInflight] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!q) {
      setRawServer(null);
      setServerInflight(false);
      setServerError(null);
      return;
    }
    const seq = ++seqRef.current;
    setServerInflight(true);
    setServerError(null);
    const handle = setTimeout(async () => {
      try {
        const { data, error } = await getBrowserSupabase().rpc('find_anything', {
          query_terms: [q],
          in_contacts: true,
          in_assets: true,
          // contains_filter ensures a literal substring match in name/
          // notes/city wins even when FTS would miss (rare names, exact
          // tokens). 1.4× weight in the RPC's scoring, so deliberate
          // typing of a known name floats it to the top.
          contains_filter: q,
          match_count: limit,
        });
        if (seq !== seqRef.current) return; // Stale response — newer query in flight.
        if (error) {
          setServerError(error.message);
          setRawServer(null);
          return;
        }
        const payload = data as {
          contacts?: Array<Contact & { _score?: number } & Record<string, unknown>>;
          assets?: Array<Asset & { _score?: number } & Record<string, unknown>>;
        } | null;
        if (!payload) {
          setRawServer(null);
          return;
        }
        const scores = new Map<string, number>();
        const contacts: Contact[] = [];
        for (const c of payload.contacts ?? []) {
          contacts.push(stripContactAugments(c));
          scores.set(`c:${c.id}`, Number(c._score ?? 0));
        }
        const assets: Asset[] = [];
        for (const a of payload.assets ?? []) {
          assets.push(stripAssetAugments(a));
          scores.set(`a:${a.id}`, Number(a._score ?? 0));
        }
        setRawServer({ contacts, assets, scores });
      } catch (err) {
        if (seq !== seqRef.current) return;
        setServerError(err instanceof Error ? err.message : String(err));
        setRawServer(null);
      } finally {
        if (seq === seqRef.current) setServerInflight(false);
      }
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [q, debounceMs, limit]);

  // ── Merge: prefer server when present, tag source per current store.
  const results = useMemo<PaletteResult[]>(() => {
    if (!q) return localResults;
    if (!rawServer) return localResults; // Debouncing or first-load — local fallback.
    const localContactIds = new Set(localContacts.map((c) => c.id));
    const localAssetIds = new Set(localAssets.map((a) => a.id));
    const merged: PaletteResult[] = [];
    for (const c of rawServer.contacts) {
      merged.push({
        kind: 'contact',
        contact: c,
        score: rawServer.scores.get(`c:${c.id}`) ?? 0,
        source: localContactIds.has(c.id) ? 'local' : 'server',
      });
    }
    for (const a of rawServer.assets) {
      merged.push({
        kind: 'asset',
        asset: a,
        score: rawServer.scores.get(`a:${a.id}`) ?? 0,
        source: localAssetIds.has(a.id) ? 'local' : 'server',
      });
    }
    merged.sort((x, y) => y.score - x.score);
    return merged.slice(0, limit);
  }, [q, rawServer, localContacts, localAssets, localResults, limit]);

  return { results, serverInflight, serverError };
}

// ─── Local ranking ──────────────────────────────────────────────────
//
// Exported (with _ prefix) for tests. The substring/token scoring
// matches the previous CommandPalette behavior verbatim so users don't
// see a ranking shift when the server is unreachable.

export function _rankLocal(
  query: string,
  contacts: Contact[],
  assets: Asset[],
  limit: number,
): PaletteResult[] {
  return rankLocal(query, contacts, assets, limit);
}

function rankLocal(
  query: string,
  contacts: Contact[],
  assets: Asset[],
  limit: number,
): PaletteResult[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    // Empty query: surface a small recency-mixed top sample, 70/30
    // contacts/assets. Trimmed to limit. The user sees something
    // immediately on ⌘K even before they type a key.
    const out: PaletteResult[] = [];
    const contactCap = Math.ceil(limit * 0.7);
    for (const c of contacts.slice(0, contactCap)) {
      out.push({ kind: 'contact', contact: c, score: 1, source: 'local' });
    }
    for (const a of assets.slice(0, limit - out.length)) {
      out.push({ kind: 'asset', asset: a, score: 1, source: 'local' });
    }
    return out.slice(0, limit);
  }
  const tokens = q.split(/\s+/).filter(Boolean);
  const scored: PaletteResult[] = [];
  for (const c of contacts) {
    const score = scoreContact(c, q, tokens);
    if (score > 0) scored.push({ kind: 'contact', contact: c, score, source: 'local' });
  }
  for (const a of assets) {
    const score = scoreAsset(a, q, tokens);
    if (score > 0) scored.push({ kind: 'asset', asset: a, score, source: 'local' });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

function scoreContact(c: Contact, q: string, tokens: string[]): number {
  const haystack = `${c.name}\n${c.city ?? ''}\n${c.tags.join(' ')}\n${c.notes}`.toLowerCase();
  let score = 0;
  if (c.name.toLowerCase().startsWith(q)) score += 100;
  else if (c.name.toLowerCase().includes(q)) score += 60;
  for (const t of tokens) {
    if (haystack.includes(t)) score += 10;
  }
  // Warmer contacts edge out colder ones on a tie — useful as a sane
  // default when search is ambiguous. Direct addition (NOT `6 - warmth`,
  // which is left over from before the 2026-05-15 warmth flip and would
  // reward the COLDEST contact). Capped at +5 so it's a tiebreak, not
  // a primary signal.
  if (score > 0 && c.warmth != null) score += c.warmth;
  return score;
}

function scoreAsset(a: Asset, q: string, tokens: string[]): number {
  const haystack =
    `${a.name}\n${a.description ?? ''}\n${a.tags.join(' ')}\n${a.availability ?? ''}`.toLowerCase();
  let score = 0;
  if (a.name.toLowerCase().startsWith(q)) score += 90;
  else if (a.name.toLowerCase().includes(q)) score += 55;
  for (const t of tokens) {
    if (haystack.includes(t)) score += 9;
  }
  return score;
}
