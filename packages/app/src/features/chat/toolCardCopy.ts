/**
 * Pure copy + verb helpers for the chat tool cards.
 *
 * No JSX, no React, no imports outside types — these are unit-testable
 * functions consumed by `ToolCallCard`, the closed-content renderer,
 * the expanded-content renderer, and `ToolGroup`. Co-locating them
 * keeps the dictionary in one place so cards never drift apart in
 * wording (the bug that produced "Searched for X" on a set_panel call).
 *
 * Hard rule: NEVER expose raw tool names. `set_panel`, `mutate_sql`,
 * `query_sql` are implementation details — the user reads what the
 * agent DID to their world, not which API it called.
 */

import type { ToolCardKind } from '../../lib/agent';

// ─────────────────────────────────────────────────────────────────
// 1. Running-state copy — what shows while the tool is in flight.
// ─────────────────────────────────────────────────────────────────

export function runningCopy(name: string, args: unknown): string {
  if (name === 'find') return findRunningCopy(args);
  if (name === 'set_panel') return setPanelRunningCopy(args);
  if (name === 'clear_panel') return 'Clearing your filters…';
  if (name === 'query_sql') return querySqlRunningCopy(args);
  if (name === 'mutate_sql') return mutateSqlRunningCopy(args);
  return 'Working on it…';
}

function findRunningCopy(args: unknown): string {
  const a = (args ?? {}) as {
    queries?: string[];
    intent?: string;
    city?: string;
    any_tags?: string[];
  };
  const qs = a.queries?.filter(Boolean) ?? [];
  const hint =
    (qs.length > 0 ? `“${truncate(qs.join(', '), 40)}”` : '') ||
    (a.intent ? `“${truncate(a.intent, 50)}”` : '') ||
    (a.city ? `in ${a.city}` : '') ||
    (a.any_tags?.length ? `tagged ${a.any_tags.slice(0, 2).join(', ')}` : '');
  return hint ? `Searching ${hint}…` : 'Searching your network…';
}

function setPanelRunningCopy(args: unknown): string {
  const a = (args ?? {}) as {
    pinnedContactIds?: string[];
    pinnedAssetIds?: string[];
    contactFilter?: unknown;
    assetFilter?: unknown;
    contactSort?: string;
    assetSort?: string;
    view?: string;
    search?: string;
  };
  if ((a.pinnedContactIds?.length ?? 0) + (a.pinnedAssetIds?.length ?? 0) > 0) {
    return 'Pinning your top picks…';
  }
  if (a.search) return `Filtering the pane to “${truncate(a.search, 32)}”…`;
  if (a.contactFilter || a.assetFilter) return 'Filtering the pane…';
  if (a.contactSort || a.assetSort) return 'Reordering the pane…';
  if (a.view) return a.view === 'assets' ? 'Switching to assets…' : 'Switching to network…';
  return 'Updating the pane…';
}

function querySqlRunningCopy(args: unknown): string {
  const sql = ((args as { sql?: string } | undefined)?.sql ?? '').trim().toLowerCase();
  const noun = sqlTableNoun(sql);
  return noun ? `Reading ${noun} details…` : 'Looking up details…';
}

function mutateSqlRunningCopy(args: unknown): string {
  const sql = ((args as { sql?: string } | undefined)?.sql ?? '').trim().toLowerCase();
  const noun = sqlTableNoun(sql) ?? 'note';
  if (sql.startsWith('insert')) return `Adding a new ${noun}…`;
  if (sql.startsWith('update') && /deleted_at\s*=\s*null/.test(sql)) return `Restoring a ${noun}…`;
  if (sql.startsWith('update') && sql.includes('deleted_at')) return `Removing a ${noun}…`;
  if (sql.startsWith('update')) return `Updating a ${noun}…`;
  if (sql.startsWith('delete')) return `Removing a ${noun}…`;
  return `Saving a ${noun}…`;
}

// ─────────────────────────────────────────────────────────────────
// 2. Closed-state headlines — verb + subject + count for each kind.
//    These are the FACE of the card; they replace the legacy
//    "Searched for X" wording that made set_panel look like a search.
// ─────────────────────────────────────────────────────────────────

export type Headline = {
  /** Lead verb in `text-muted` ("Updated the pane"). */
  verb: string;
  /** Subject phrase in `text-fg`, optional, blank string skips. */
  subject: string;
  /** Comma-separated sub-actions for compound mutations. */
  detail: string;
  /** Trailing faint count ("323 matches"). Empty string skips. */
  count: string;
};

export function closedHeadline(parsed: Extract<ToolCardKind, { kind: string }>): Headline {
  switch (parsed.kind) {
    case 'find':
      return findHeadline(parsed);
    case 'query':
    case 'search':
      return queryHeadline(parsed);
    case 'panel_set':
      return panelSetHeadline(parsed);
    case 'panel_cleared':
      return panelClearedHeadline(parsed);
    case 'contact_added':
    case 'asset_added':
      return mutationHeadline(parsed, 'Added');
    case 'contact_updated':
    case 'asset_updated':
      return mutationHeadline(parsed, 'Updated');
    case 'contact_deleted':
    case 'asset_deleted':
      return mutationHeadline(parsed, 'Removed');
    case 'error':
      return errorHeadline(parsed);
    default:
      return { verb: 'Done.', subject: '', detail: '', count: '' };
  }
}

function findHeadline(p: Extract<ToolCardKind, { kind: 'find' }>): Headline {
  const grand = p.contactsTotal + p.assetsTotal;
  if (grand === 0) {
    return { verb: 'Searched your network.', subject: '', detail: '', count: 'No matches' };
  }
  return {
    verb: 'Searched your network.',
    subject: '',
    detail: '',
    count: friendlyFindCount(p),
  };
}

function queryHeadline(p: Extract<ToolCardKind, { kind: 'query' | 'search' }>): Headline {
  const verb = p.kind === 'search' ? 'Looked through your network.' : 'Looked up details.';
  const noun = p.count === 1 ? 'result' : 'results';
  return { verb, subject: '', detail: '', count: `${p.count.toLocaleString()} ${noun}` };
}

function panelSetHeadline(p: Extract<ToolCardKind, { kind: 'panel_set' }>): Headline {
  const subActions = paneSubActions(p);
  const pinnedCount = p.pinnedContactIds.length + p.pinnedAssetIds.length;

  // Pinning-only: lead with the most concrete fact.
  if (subActions.length === 1 && pinnedCount > 0) {
    return {
      verb: pinnedCount === 1 ? 'Pinned 1 person' : `Pinned ${pinnedCount} people`,
      subject: '',
      detail: '',
      count: '',
    };
  }
  // View-only: name the destination.
  if (subActions.length === 1 && p.view) {
    return {
      verb: 'Switched to',
      subject: p.view === 'contacts' ? 'your network' : 'your assets',
      detail: '',
      count: friendlyPaneCount(p.count),
    };
  }
  // Single search-only: read like the search query you'd type.
  if (subActions.length === 1 && p.search) {
    return {
      verb: 'Filtered the pane to',
      subject: `“${truncate(p.search, 36)}”`,
      detail: '',
      count: friendlyPaneCount(p.count),
    };
  }
  // Single filter-only: lead with the most concrete facet phrase.
  if (subActions.length === 1 && p.facets.length > 0) {
    return {
      verb: 'Filtered the pane to',
      subject: humanizeFacets(p.facets),
      detail: '',
      count: friendlyPaneCount(p.count),
    };
  }
  // Sort-only.
  if (subActions.length === 1 && subActions[0].startsWith('Sorted')) {
    return { verb: subActions[0], subject: '', detail: '', count: '' };
  }
  // Compound: short verb on left, detail comma-list, count tail.
  return {
    verb: 'Updated the pane.',
    subject: '',
    detail: subActions.join(', '),
    count: friendlyPaneCount(p.count),
  };
}

function panelClearedHeadline(p: Extract<ToolCardKind, { kind: 'panel_cleared' }>): Headline {
  return {
    verb: 'Cleared filters and pins.',
    subject: '',
    detail: '',
    count: p.count ? `Back to ${friendlyPaneCount(p.count)}` : '',
  };
}

function mutationHeadline(
  p:
    | Extract<ToolCardKind, { kind: 'contact_added' | 'contact_updated' | 'contact_deleted' }>
    | Extract<ToolCardKind, { kind: 'asset_added' | 'asset_updated' | 'asset_deleted' }>,
  verb: 'Added' | 'Updated' | 'Removed',
): Headline {
  const name = 'contact' in p ? p.contact.name : 'asset' in p ? p.asset.name : '';
  const detail =
    p.kind === 'contact_added'
      ? warmthDetail(p.contact.warmth, p.contact.city)
      : p.kind === 'asset_added'
        ? (p.asset.availability ?? '')
        : p.kind === 'contact_updated' || p.kind === 'asset_updated'
          ? humanizeFields(p.fields)
          : '';
  return { verb, subject: name, detail, count: '' };
}

function errorHeadline(p: Extract<ToolCardKind, { kind: 'error' }>): Headline {
  return {
    verb: 'Couldn’t finish that.',
    subject: '',
    detail: truncate(p.error, 80),
    count: '',
  };
}

// ─────────────────────────────────────────────────────────────────
// 3. Sub-action humanizers for compound set_panel calls.
// ─────────────────────────────────────────────────────────────────

/**
 * Return one short phrase per sub-action the agent performed in a
 * single set_panel call. Order: view → search → filter → pins → sort.
 * Empty array = a no-op set_panel (shouldn't happen, but defensive).
 */
export function paneSubActions(p: Extract<ToolCardKind, { kind: 'panel_set' }>): string[] {
  const out: string[] = [];
  if (p.view) {
    out.push(`Switched to ${p.view === 'contacts' ? 'Network' : 'Assets'}`);
  }
  if (p.search) {
    out.push(`Filtered to “${truncate(p.search, 32)}”`);
  }
  if (p.facets.length > 0) {
    out.push(`Filtered by ${humanizeFacets(p.facets)}`);
  }
  const pinnedCount = p.pinnedContactIds.length + p.pinnedAssetIds.length;
  if (pinnedCount > 0) {
    out.push(`Pinned ${pinnedCount === 1 ? '1 person' : `${pinnedCount}`}`);
  }
  // contactSort / assetSort live on `call.args`, NOT in `parsed`. They
  // get added by the caller when both are available.
  return out;
}

/** Same as `paneSubActions` but also includes sort verbs when given. */
export function paneSubActionsWithSort(
  p: Extract<ToolCardKind, { kind: 'panel_set' }>,
  contactSort: string | undefined,
  assetSort: string | undefined,
): string[] {
  const out = paneSubActions(p);
  const sortLabel = friendlySort(contactSort) || friendlySort(assetSort);
  if (sortLabel) out.push(`Sorted by ${sortLabel}`);
  return out;
}

// ─────────────────────────────────────────────────────────────────
// 4. Friendly count formatters.
// ─────────────────────────────────────────────────────────────────

export function friendlyPaneCount(count: { contacts: number; assets: number } | null): string {
  if (!count) return '';
  const parts: string[] = [];
  if (count.contacts > 0) {
    parts.push(`${count.contacts.toLocaleString()} ${count.contacts === 1 ? 'person' : 'people'}`);
  }
  if (count.assets > 0) {
    parts.push(`${count.assets.toLocaleString()} ${count.assets === 1 ? 'asset' : 'assets'}`);
  }
  return parts.join(', ');
}

export function friendlyFindCount(p: Extract<ToolCardKind, { kind: 'find' }>): string {
  const parts: string[] = [];
  if (p.contactsTotal > 0) {
    const noun = p.contactsTotal === 1 ? 'person' : 'people';
    parts.push(formatOfTotal(p.contactsCount, p.contactsTotal, noun));
  }
  if (p.assetsTotal > 0) {
    const noun = p.assetsTotal === 1 ? 'asset' : 'assets';
    parts.push(formatOfTotal(p.assetsCount, p.assetsTotal, noun));
  }
  return parts.join(', ');
}

function formatOfTotal(returned: number, total: number, noun: string): string {
  if (returned === total) return `${total.toLocaleString()} ${noun}`;
  return `${returned.toLocaleString()} of ${total.toLocaleString()} ${noun}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─────────────────────────────────────────────────────────────────
// 5. Lower-level humanizers (facets, fields, sort enums).
// ─────────────────────────────────────────────────────────────────

export function friendlySort(sort: string | undefined): string {
  if (!sort) return '';
  switch (sort) {
    case 'warmth_desc':
      return 'warmest first';
    case 'warmth_asc':
      return 'coldest first';
    case 'updated_desc':
      return 'recently updated first';
    case 'created_desc':
      return 'recently added first';
    case 'name_asc':
      return 'A to Z';
    case 'name_desc':
      return 'Z to A';
    case 'asset_count_desc':
      return 'most assets first';
    default:
      return '';
  }
}

/**
 * Strip parser-side markers (the `+tag` AND prefix, the `sort:` /
 * `asset sort:` leftovers, the `asset:` namespace) and join up to 3
 * facet labels with `+N more` overflow.
 */
export function humanizeFacets(facets: string[]): string {
  if (facets.length === 0) return '';
  const cleaned = facets
    .map((f) => {
      if (f.startsWith('+')) return f.slice(1);
      if (f.startsWith('sort:') || f.startsWith('asset sort:')) return '';
      if (f.startsWith('asset: ')) return f.slice('asset: '.length);
      return f;
    })
    .map((s) => s.trim())
    .filter(Boolean);
  if (cleaned.length === 0) return '';
  const shown = cleaned.slice(0, 3).join(', ');
  return cleaned.length > 3 ? `${shown} +${cleaned.length - 3} more` : shown;
}

export function humanizeFields(fields: string[]): string {
  const clean = fields.filter((f) => f && f !== 'fields');
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')}, and ${clean[clean.length - 1]}`;
}

function warmthDetail(warmth: number | null, city: string | null): string {
  const parts: string[] = [];
  if (warmth != null) parts.push(`warmth ${warmth}`);
  if (city) parts.push(city);
  return parts.join(', ');
}

export function sqlTableNoun(sql: string): string | null {
  if (/\bcontacts\b/.test(sql)) return 'contact';
  if (/\bassets\b/.test(sql)) return 'asset';
  return null;
}

export function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
