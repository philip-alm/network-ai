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
    case 'search_contacts':
    case 'search_assets':
      return { kind: 'search', count: rows.length };
  }
  return null;
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
