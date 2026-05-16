/**
 * toolResultParser — turn a raw tool envelope into a structured "what did the
 * agent just do" card the chat can render.
 *
 * The agent's tool results carry the affected rows (because every mutate uses
 * RETURNING). This module classifies the result into a CardKind:
 *
 *   - `contact_added`   — new contact row in result.rows[]
 *   - `contact_updated` — existing contact's notes / warmth / tags changed
 *   - `contact_deleted` — soft-delete (UPDATE … SET deleted_at = now())
 *   - `asset_added`     — new asset row
 *   - `asset_updated`   — asset mutation
 *   - `asset_deleted`   — soft-delete
 *   - `query`           — query_sql with N rows
 *   - `search`          — search_* with N rows
 *   - `error`           — envelope.ok === false
 *
 * The chat renders a different card per kind, each with a "Jump to ↗"
 * button when there's a single canonical target row.
 */

import type { Contact, Asset } from '../store';

export type ToolCardKind =
  | { kind: 'contact_added'; contact: Contact }
  | { kind: 'contact_updated'; contact: Contact; fields: string[] }
  | { kind: 'contact_deleted'; contact: Contact }
  | { kind: 'asset_added'; asset: Asset }
  | { kind: 'asset_updated'; asset: Asset; fields: string[] }
  | { kind: 'asset_deleted'; asset: Asset }
  | { kind: 'query'; count: number; preview?: unknown }
  | { kind: 'search'; count: number; preview?: unknown }
  | {
      kind: 'find';
      contactsCount: number;
      assetsCount: number;
      contactPreviews: string[];
      assetPreviews: string[];
      debug?: unknown;
    }
  | {
      kind: 'panel_set';
      /** Short list of human-readable facet labels applied this call. */
      facets: string[];
      /** Count of contacts pinned by this set_panel invocation. */
      pinnedContactIds: string[];
      /** Count of assets pinned by this set_panel invocation. */
      pinnedAssetIds: string[];
      /** Free-text search string if this call set one, else null. */
      search: string | null;
      /** View mode set by this call (contacts | both | assets), or null. */
      view: 'contacts' | 'both' | 'assets' | null;
    }
  | { kind: 'panel_cleared' }
  | { kind: 'error'; tool: string; error: string; hint: string };

type Envelope = {
  ok?: boolean;
  data?: unknown;
  rows?: unknown;
  error?: string;
  hint?: string;
};

function isContactRow(o: unknown): o is Contact {
  if (!o || typeof o !== 'object') return false;
  const r = o as Record<string, unknown>;
  return typeof r.id === 'string' && typeof r.name === 'string' && 'warmth' in r;
}

function isAssetRow(o: unknown): o is Asset {
  if (!o || typeof o !== 'object') return false;
  const r = o as Record<string, unknown>;
  return typeof r.id === 'string' && typeof r.name === 'string' && 'availability' in r;
}

function asRows(out: Envelope): unknown[] {
  // The tools may return { ok: true, data: { rows: [...] } } OR { ok: true, data: [...] }.
  const data = out.data;
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && Array.isArray((data as { rows?: unknown }).rows)) {
    return (data as { rows: unknown[] }).rows;
  }
  if (Array.isArray(out.rows)) return out.rows;
  return [];
}

export function parseToolResult(
  toolName: string,
  args: unknown,
  result: unknown,
): ToolCardKind | null {
  const out = (result ?? {}) as Envelope;

  if (out.ok === false) {
    return {
      kind: 'error',
      tool: toolName,
      error: out.error ?? 'unknown error',
      hint: out.hint ?? '',
    };
  }
  if (out.ok !== true) return null;

  const rows = asRows(out);
  const sql = (args as { sql?: string } | undefined)?.sql ?? '';
  const sqlLc = sql.toLowerCase();

  switch (toolName) {
    case 'mutate_sql': {
      const isInsert = sqlLc.includes('insert');
      const isUpdate = sqlLc.includes('update');
      const isDelete = sqlLc.includes('delete from') || sqlLc.includes('set deleted_at');

      // Find the first contact or asset row in the response.
      for (const row of rows) {
        if (isContactRow(row)) {
          if (isInsert) return { kind: 'contact_added', contact: row };
          if (isDelete || (isUpdate && sqlLc.includes('deleted_at')))
            return { kind: 'contact_deleted', contact: row };
          if (isUpdate)
            return {
              kind: 'contact_updated',
              contact: row,
              fields: extractUpdatedFields(sql),
            };
        }
        if (isAssetRow(row)) {
          if (isInsert) return { kind: 'asset_added', asset: row };
          if (isDelete || (isUpdate && sqlLc.includes('deleted_at')))
            return { kind: 'asset_deleted', asset: row };
          if (isUpdate)
            return {
              kind: 'asset_updated',
              asset: row,
              fields: extractUpdatedFields(sql),
            };
        }
      }
      return null;
    }
    case 'query_sql':
      return { kind: 'query', count: rows.length };
    case 'find': {
      const data = out.data as
        | {
            contacts?: Array<Record<string, unknown>>;
            assets?: Array<Record<string, unknown>>;
            debug?: unknown;
          }
        | undefined;
      const contacts = data?.contacts ?? [];
      const assets = data?.assets ?? [];
      return {
        kind: 'find',
        contactsCount: contacts.length,
        assetsCount: assets.length,
        contactPreviews: contacts
          .slice(0, 3)
          .map((c) => (typeof c.name === 'string' ? c.name : ''))
          .filter(Boolean),
        assetPreviews: assets
          .slice(0, 3)
          .map((a) => (typeof a.name === 'string' ? a.name : ''))
          .filter(Boolean),
        debug: data?.debug,
      };
    }
    case 'set_panel': {
      const a = (args ?? {}) as {
        contactFilter?: {
          cities?: string[];
          tags?: string[];
          tagsAll?: string[];
          warmth?: number[];
          hasAssets?: boolean | null;
          updatedWithinDays?: number | null;
        };
        assetFilter?: {
          tags?: string[];
          tagsAll?: string[];
          ownerIds?: string[];
          hasOwner?: boolean | null;
          availabilityContains?: string;
          updatedWithinDays?: number | null;
        };
        contactSort?: string;
        assetSort?: string;
        search?: string;
        pinnedContactIds?: string[];
        pinnedAssetIds?: string[];
        view?: 'contacts' | 'both' | 'assets';
      };
      const facets: string[] = [];
      const cf = a.contactFilter;
      if (cf) {
        if (cf.cities?.length) facets.push(...cf.cities);
        if (cf.tags?.length) facets.push(...cf.tags);
        if (cf.tagsAll?.length) facets.push(...cf.tagsAll.map((t) => `+${t}`));
        if (cf.warmth?.length) facets.push(...cf.warmth.map((w) => `warmth ${w}`));
        if (cf.hasAssets === true) facets.push('has assets');
        if (cf.hasAssets === false) facets.push('no assets');
        if (cf.updatedWithinDays != null) facets.push(`updated ${cf.updatedWithinDays}d`);
      }
      const af = a.assetFilter;
      if (af) {
        if (af.tags?.length) facets.push(...af.tags.map((t) => `asset: ${t}`));
        if (af.tagsAll?.length) facets.push(...af.tagsAll.map((t) => `asset: +${t}`));
        if (af.hasOwner === true) facets.push('attached assets');
        if (af.hasOwner === false) facets.push('unattached assets');
        if (af.availabilityContains) facets.push(`available: ${af.availabilityContains}`);
        if (af.updatedWithinDays != null) facets.push(`asset updated ${af.updatedWithinDays}d`);
      }
      if (a.contactSort) facets.push(`sort: ${a.contactSort}`);
      if (a.assetSort) facets.push(`asset sort: ${a.assetSort}`);

      return {
        kind: 'panel_set',
        facets,
        pinnedContactIds: a.pinnedContactIds ?? [],
        pinnedAssetIds: a.pinnedAssetIds ?? [],
        search: a.search ? a.search : null,
        view: a.view ?? null,
      };
    }
    case 'clear_panel':
      return { kind: 'panel_cleared' };
  }
  return null;
}

export type MutationRows = {
  upsertContacts: Contact[];
  upsertAssets: Asset[];
  removeContactIds: string[];
  removeAssetIds: string[];
};

/**
 * Extract every contact / asset row touched by a `mutate_sql` call.
 *
 * `parseToolResult` returns at most one card-worthy row, which silently
 * loses bulk inserts (the right pane stayed empty after "add 20 contacts"
 * until a page refresh). The optimistic-update path needs all rows.
 */
export function extractMutationRows(args: unknown, result: unknown): MutationRows {
  const empty: MutationRows = {
    upsertContacts: [],
    upsertAssets: [],
    removeContactIds: [],
    removeAssetIds: [],
  };
  const out = (result ?? {}) as Envelope;
  if (out.ok !== true) return empty;
  const sql = ((args as { sql?: string } | undefined)?.sql ?? '').toLowerCase();
  const isHardDelete = sql.trimStart().startsWith('delete');
  const isSoftDelete = sql.includes('set deleted_at') && !/deleted_at\s*=\s*null/.test(sql);
  const isDelete = isHardDelete || isSoftDelete;

  const acc: MutationRows = {
    upsertContacts: [],
    upsertAssets: [],
    removeContactIds: [],
    removeAssetIds: [],
  };
  for (const row of asRows(out)) {
    if (isContactRow(row)) {
      if (isDelete) acc.removeContactIds.push(row.id);
      else acc.upsertContacts.push(row);
    } else if (isAssetRow(row)) {
      if (isDelete) acc.removeAssetIds.push(row.id);
      else acc.upsertAssets.push(row);
    }
  }
  return acc;
}

/** Extract column names from a `SET col = …, col2 = …` clause. Best-effort. */
function extractUpdatedFields(sql: string): string[] {
  const match = sql.match(/set\s+([\s\S]+?)\s+(where|returning)/i);
  if (!match) return [];
  const setClause = match[1];
  return setClause
    .split(',')
    .map((part) => part.trim().split(/\s*=/)[0]?.trim())
    .filter((s): s is string => Boolean(s));
}
