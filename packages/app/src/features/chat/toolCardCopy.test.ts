/**
 * Tool card copy contract — verb dictionary + sub-action humanization.
 *
 * The copy dictionary is the user's whole reading experience of what
 * the agent did. Drift here is silent regression: cards say the wrong
 * thing without breaking tests. These cases lock the headline shape
 * for every kind + state that ships.
 */

import { describe, expect, it } from 'vitest';
import {
  closedHeadline,
  formatDuration,
  friendlyFindCount,
  friendlyPaneCount,
  friendlySort,
  humanizeFacets,
  humanizeFields,
  paneSubActionsWithSort,
  runningCopy,
  truncate,
} from './toolCardCopy';
import type { ToolCardKind } from '../../lib/agent';

// ─────────────────────────────────────────────────────────────────
// runningCopy — what shows while the tool is in flight
// ─────────────────────────────────────────────────────────────────

describe('runningCopy', () => {
  it('find with queries quotes the keyword bundle', () => {
    expect(runningCopy('find', { queries: ['podd', 'podcast'] })).toBe(
      'Searching “podd, podcast”…',
    );
  });

  it('find with only intent falls back to that sentence', () => {
    expect(runningCopy('find', { intent: 'office space in Göteborg' })).toBe(
      'Searching “office space in Göteborg”…',
    );
  });

  it('find with no signal at all says the generic phrase', () => {
    expect(runningCopy('find', {})).toBe('Searching your network…');
  });

  it('set_panel with search says "Filtering the pane to …" (not "Searching for")', () => {
    // Regression: pre-redesign the wording was "Searching for X" which
    // made set_panel calls look like another search action.
    expect(runningCopy('set_panel', { search: 'göteborg office desk' })).toBe(
      'Filtering the pane to “göteborg office desk”…',
    );
  });

  it('set_panel with view-only says "Switching to assets/network"', () => {
    expect(runningCopy('set_panel', { view: 'assets' })).toBe('Switching to assets…');
    expect(runningCopy('set_panel', { view: 'contacts' })).toBe('Switching to network…');
  });

  it('set_panel with pins says "Pinning your top picks"', () => {
    expect(runningCopy('set_panel', { pinnedContactIds: ['a', 'b'] })).toBe(
      'Pinning your top picks…',
    );
  });

  it('set_panel with sort-only says "Reordering the pane"', () => {
    expect(runningCopy('set_panel', { contactSort: 'warmth_desc' })).toBe('Reordering the pane…');
  });

  it('set_panel compound (filter + pins) says "Pinning your top picks" (pins win)', () => {
    expect(
      runningCopy('set_panel', {
        contactFilter: { cities: ['stockholm'] },
        pinnedContactIds: ['a'],
      }),
    ).toBe('Pinning your top picks…');
  });

  it('clear_panel says "Clearing your filters"', () => {
    expect(runningCopy('clear_panel', {})).toBe('Clearing your filters…');
  });

  it('mutate_sql insert says "Adding a new <noun>"', () => {
    expect(
      runningCopy('mutate_sql', {
        sql: "INSERT INTO contacts (name) VALUES ('Anna') RETURNING *",
      }),
    ).toBe('Adding a new contact…');
  });

  it('mutate_sql soft-delete says "Removing a <noun>"', () => {
    expect(
      runningCopy('mutate_sql', {
        sql: "UPDATE assets SET deleted_at = now() WHERE id = 'x' RETURNING *",
      }),
    ).toBe('Removing a asset…');
  });

  it('mutate_sql undelete says "Restoring a <noun>"', () => {
    expect(
      runningCopy('mutate_sql', {
        sql: "UPDATE contacts SET deleted_at = NULL WHERE id = 'x' RETURNING *",
      }),
    ).toBe('Restoring a contact…');
  });

  it('query_sql says "Reading <noun> details" when the table is known', () => {
    expect(runningCopy('query_sql', { sql: 'SELECT id, name FROM contacts WHERE city = $1' })).toBe(
      'Reading contact details…',
    );
  });

  it('query_sql falls back to generic when no known table', () => {
    expect(runningCopy('query_sql', { sql: 'SELECT 1' })).toBe('Looking up details…');
  });

  it('unknown tool name still produces a non-leaking phrase', () => {
    expect(runningCopy('some_internal_tool', {})).toBe('Working on it…');
  });
});

// ─────────────────────────────────────────────────────────────────
// closedHeadline — verb + subject + count for each card kind
// ─────────────────────────────────────────────────────────────────

describe('closedHeadline', () => {
  it('find with matches reports the friendly count', () => {
    const h = closedHeadline({
      kind: 'find',
      contactsCount: 50,
      assetsCount: 0,
      contactsTotal: 537,
      assetsTotal: 0,
      contactSamples: [],
      assetSamples: [],
    });
    expect(h.verb).toBe('Searched your network.');
    expect(h.count).toBe('50 of 537 people');
  });

  it('find with zero matches says "No matches"', () => {
    const h = closedHeadline({
      kind: 'find',
      contactsCount: 0,
      assetsCount: 0,
      contactsTotal: 0,
      assetsTotal: 0,
      contactSamples: [],
      assetSamples: [],
    });
    expect(h.count).toBe('No matches');
  });

  it('panel_set with ONLY pinning leads with the pin count', () => {
    const h = closedHeadline({
      kind: 'panel_set',
      facets: [],
      pinnedContactIds: ['a', 'b'],
      pinnedAssetIds: [],
      search: null,
      view: null,
      count: null,
      sample: null,
    });
    expect(h.verb).toBe('Pinned 2 people');
  });

  it('panel_set with single search reads like a filter (not "Searched for")', () => {
    // Regression for the bug Philip saw on 2026-05-16: the card label
    // said "Searched for X" when the action filtered the pane.
    const h = closedHeadline({
      kind: 'panel_set',
      facets: [],
      pinnedContactIds: [],
      pinnedAssetIds: [],
      search: 'göteborg office desk',
      view: null,
      count: { contacts: 0, assets: 323 },
      sample: null,
    });
    expect(h.verb).toBe('Filtered the pane to');
    expect(h.subject).toBe('“göteborg office desk”');
  });

  it('panel_set with view-only says "Switched to your assets"', () => {
    const h = closedHeadline({
      kind: 'panel_set',
      facets: [],
      pinnedContactIds: [],
      pinnedAssetIds: [],
      search: null,
      view: 'assets',
      count: null,
      sample: null,
    });
    expect(h.verb).toBe('Switched to');
    expect(h.subject).toBe('your assets');
  });

  it('panel_set compound (view + search + pins) uses the generic verb', () => {
    const h = closedHeadline({
      kind: 'panel_set',
      facets: [],
      pinnedContactIds: ['a', 'b'],
      pinnedAssetIds: [],
      search: 'office',
      view: 'assets',
      count: { contacts: 0, assets: 50 },
      sample: null,
    });
    expect(h.verb).toBe('Updated the pane.');
    expect(h.count).toBe('50 assets');
  });

  it('panel_cleared reports "Back to N"', () => {
    const h = closedHeadline({
      kind: 'panel_cleared',
      count: { contacts: 10000, assets: 5000 },
    });
    expect(h.verb).toBe('Cleared filters and pins.');
    expect(h.count).toBe('Back to 10,000 people, 5,000 assets');
  });

  it('contact_added reports Added + name + warmth+city', () => {
    const h = closedHeadline({
      kind: 'contact_added',
      contact: {
        id: 'x',
        name: 'Anna',
        warmth: 4,
        city: 'Stockholm',
      } as unknown as Extract<ToolCardKind, { kind: 'contact_added' }>['contact'],
    });
    expect(h.verb).toBe('Added');
    expect(h.subject).toBe('Anna');
    expect(h.detail).toBe('warmth 4, Stockholm');
  });

  it('contact_deleted reports Removed', () => {
    const h = closedHeadline({
      kind: 'contact_deleted',
      contact: { id: 'x', name: 'Bo' } as unknown as Extract<
        ToolCardKind,
        { kind: 'contact_deleted' }
      >['contact'],
    });
    expect(h.verb).toBe('Removed');
    expect(h.subject).toBe('Bo');
  });

  it('error uses the warning-shaped verb', () => {
    const h = closedHeadline({
      kind: 'error',
      tool: 'set_panel',
      error: 'pinned ids not found',
      hint: 're-run find()',
    });
    expect(h.verb.toLowerCase()).toContain('couldn');
    expect(h.detail).toBe('pinned ids not found');
  });
});

// ─────────────────────────────────────────────────────────────────
// paneSubActionsWithSort — the comma list for compound set_panel
// ─────────────────────────────────────────────────────────────────

describe('paneSubActionsWithSort', () => {
  it('reads natural for the canonical Gothenburg case (view + search + pins)', () => {
    const actions = paneSubActionsWithSort(
      {
        kind: 'panel_set',
        facets: [],
        pinnedContactIds: ['a', 'b'],
        pinnedAssetIds: [],
        search: 'göteborg office desk',
        view: 'assets',
        count: null,
        sample: null,
      },
      undefined,
      undefined,
    );
    expect(actions).toEqual([
      'Switched to Assets',
      'Filtered to “göteborg office desk”',
      'Pinned 2',
    ]);
  });

  it('appends sort label when contactSort given', () => {
    const actions = paneSubActionsWithSort(
      {
        kind: 'panel_set',
        facets: ['investor'],
        pinnedContactIds: [],
        pinnedAssetIds: [],
        search: null,
        view: null,
        count: null,
        sample: null,
      },
      'warmth_desc',
      undefined,
    );
    expect(actions).toEqual(['Filtered by investor', 'Sorted by warmest first']);
  });

  it('empty patch yields no sub-actions', () => {
    expect(
      paneSubActionsWithSort(
        {
          kind: 'panel_set',
          facets: [],
          pinnedContactIds: [],
          pinnedAssetIds: [],
          search: null,
          view: null,
          count: null,
          sample: null,
        },
        undefined,
        undefined,
      ),
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────
// Friendly formatters
// ─────────────────────────────────────────────────────────────────

describe('friendlyPaneCount', () => {
  it('lists both counts when both > 0', () => {
    expect(friendlyPaneCount({ contacts: 312, assets: 50 })).toBe('312 people, 50 assets');
  });

  it('skips zero sides', () => {
    expect(friendlyPaneCount({ contacts: 1, assets: 0 })).toBe('1 person');
    expect(friendlyPaneCount({ contacts: 0, assets: 1 })).toBe('1 asset');
  });

  it('thousand-separates large counts', () => {
    expect(friendlyPaneCount({ contacts: 12345, assets: 0 })).toBe('12,345 people');
  });

  it('null returns empty string', () => {
    expect(friendlyPaneCount(null)).toBe('');
  });
});

describe('friendlyFindCount', () => {
  it('"N of T" when results were capped', () => {
    expect(
      friendlyFindCount({
        kind: 'find',
        contactsCount: 50,
        assetsCount: 0,
        contactsTotal: 537,
        assetsTotal: 0,
        contactSamples: [],
        assetSamples: [],
      }),
    ).toBe('50 of 537 people');
  });

  it('just "N" when nothing was capped', () => {
    expect(
      friendlyFindCount({
        kind: 'find',
        contactsCount: 7,
        assetsCount: 0,
        contactsTotal: 7,
        assetsTotal: 0,
        contactSamples: [],
        assetSamples: [],
      }),
    ).toBe('7 people');
  });

  it('joins contacts + assets with comma', () => {
    expect(
      friendlyFindCount({
        kind: 'find',
        contactsCount: 3,
        assetsCount: 5,
        contactsTotal: 3,
        assetsTotal: 5,
        contactSamples: [],
        assetSamples: [],
      }),
    ).toBe('3 people, 5 assets');
  });
});

describe('formatDuration', () => {
  it('< 1s renders as ms', () => {
    expect(formatDuration(42)).toBe('42ms');
  });
  it('≥ 1s renders as 1-decimal seconds', () => {
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(12_345)).toBe('12.3s');
  });
});

describe('friendlySort', () => {
  it.each([
    ['warmth_desc', 'warmest first'],
    ['warmth_asc', 'coldest first'],
    ['updated_desc', 'recently updated first'],
    ['created_desc', 'recently added first'],
    ['name_asc', 'A to Z'],
    ['name_desc', 'Z to A'],
    ['asset_count_desc', 'most assets first'],
  ])('%s → %s', (token, label) => {
    expect(friendlySort(token)).toBe(label);
  });

  it('unknown / undefined returns empty string (never leaks the raw token)', () => {
    expect(friendlySort('some_new_enum')).toBe('');
    expect(friendlySort(undefined)).toBe('');
  });
});

describe('humanizeFacets', () => {
  it('strips the AND-required + prefix', () => {
    expect(humanizeFacets(['+podcast'])).toBe('podcast');
  });

  it('drops sort: leftovers (sort is shown separately)', () => {
    expect(humanizeFacets(['sort: warmth_desc', 'investor'])).toBe('investor');
  });

  it('caps at 3 with +N more overflow', () => {
    expect(humanizeFacets(['a', 'b', 'c', 'd', 'e'])).toBe('a, b, c +2 more');
  });

  it('empty array → empty string', () => {
    expect(humanizeFacets([])).toBe('');
  });
});

describe('humanizeFields', () => {
  it('1 field stays singular', () => {
    expect(humanizeFields(['notes'])).toBe('notes');
  });
  it('2 fields use "and"', () => {
    expect(humanizeFields(['notes', 'tags'])).toBe('notes and tags');
  });
  it('3+ fields use Oxford comma + "and"', () => {
    expect(humanizeFields(['a', 'b', 'c'])).toBe('a, b, and c');
  });
  it('filters out the parser fallback "fields" sentinel', () => {
    expect(humanizeFields(['fields'])).toBe('');
  });
});

describe('truncate', () => {
  it('returns input when shorter than max', () => {
    expect(truncate('hi', 10)).toBe('hi');
  });
  it('truncates with ellipsis when longer', () => {
    expect(truncate('hello world', 8)).toBe('hello w…');
  });
});
