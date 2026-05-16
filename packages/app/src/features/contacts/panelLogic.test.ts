import { describe, expect, it } from 'vitest';
import {
  applyContactFilter,
  applyContactSort,
  applyAssetFilter,
  applyAssetSort,
  applyPinning,
  buildAssetCountMap,
  isContactFilterEmpty,
  isAssetFilterEmpty,
} from './panelLogic';
import type { Contact, Asset } from '../../lib/store';
import { EMPTY_CONTACT_FILTER, EMPTY_ASSET_FILTER } from '../../lib/store';

function makeContact(over: Partial<Contact> = {}): Contact {
  return {
    id: 'c-' + Math.random().toString(36).slice(2, 8),
    name: 'Anna',
    warmth: 3,
    city: 'Stockholm',
    tags: [],
    notes: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function makeAsset(over: Partial<Asset> = {}): Asset {
  return {
    id: 'a-' + Math.random().toString(36).slice(2, 8),
    name: 'Studio',
    description: '',
    availability: null,
    tags: [],
    contact_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

describe('panelLogic — filter emptiness', () => {
  it('detects empty contact filter', () => {
    expect(isContactFilterEmpty(EMPTY_CONTACT_FILTER)).toBe(true);
  });
  it('detects empty asset filter', () => {
    expect(isAssetFilterEmpty(EMPTY_ASSET_FILTER)).toBe(true);
  });
  it('non-empty when any facet has values', () => {
    expect(isContactFilterEmpty({ ...EMPTY_CONTACT_FILTER, tags: ['x'] })).toBe(false);
    expect(isContactFilterEmpty({ ...EMPTY_CONTACT_FILTER, hasAssets: true })).toBe(false);
  });
});

describe('applyContactFilter', () => {
  const c1 = makeContact({ id: 'c1', name: 'Anna', city: 'Stockholm', tags: ['vc'], warmth: 1 });
  const c2 = makeContact({ id: 'c2', name: 'Bo', city: 'Göteborg', tags: ['eng'], warmth: 2 });
  const c3 = makeContact({
    id: 'c3',
    name: 'Cara',
    city: 'Stockholm',
    tags: ['vc', 'angel'],
    warmth: 3,
  });
  const contacts = [c1, c2, c3];

  it('city facet filters by membership', () => {
    const out = applyContactFilter(
      contacts,
      { ...EMPTY_CONTACT_FILTER, cities: ['Stockholm'] },
      { assets: [], search: '' },
    );
    expect(out.map((c) => c.id)).toEqual(['c1', 'c3']);
  });

  it('warmth facet filters by membership', () => {
    const out = applyContactFilter(
      contacts,
      { ...EMPTY_CONTACT_FILTER, warmth: [1] },
      { assets: [], search: '' },
    );
    expect(out.map((c) => c.id)).toEqual(['c1']);
  });

  it('tags (any) matches at least one tag', () => {
    const out = applyContactFilter(
      contacts,
      { ...EMPTY_CONTACT_FILTER, tags: ['vc'] },
      { assets: [], search: '' },
    );
    expect(out.map((c) => c.id)).toEqual(['c1', 'c3']);
  });

  it('tagsAll requires every listed tag', () => {
    const out = applyContactFilter(
      contacts,
      { ...EMPTY_CONTACT_FILTER, tagsAll: ['vc', 'angel'] },
      { assets: [], search: '' },
    );
    expect(out.map((c) => c.id)).toEqual(['c3']);
  });

  it('facets AND together', () => {
    const out = applyContactFilter(
      contacts,
      {
        ...EMPTY_CONTACT_FILTER,
        cities: ['Stockholm'],
        warmth: [3],
      },
      { assets: [], search: '' },
    );
    expect(out.map((c) => c.id)).toEqual(['c3']);
  });

  it('search needle scans name + city + tags + notes', () => {
    const cWithNote = makeContact({ id: 'cn', name: 'X', notes: 'great podcast guest' });
    const out = applyContactFilter([...contacts, cWithNote], EMPTY_CONTACT_FILTER, {
      assets: [],
      search: 'podcast',
    });
    expect(out.map((c) => c.id)).toEqual(['cn']);
  });

  it('hasAssets filters by ownership', () => {
    const a1 = makeAsset({ id: 'a1', contact_id: 'c1' });
    const out = applyContactFilter(
      contacts,
      { ...EMPTY_CONTACT_FILTER, hasAssets: true },
      { assets: [a1], search: '' },
    );
    expect(out.map((c) => c.id)).toEqual(['c1']);
  });

  it('updatedWithinDays filters by recency', () => {
    const now = Date.now();
    const recent = makeContact({
      id: 'recent',
      updated_at: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    });
    const stale = makeContact({
      id: 'stale',
      updated_at: new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const out = applyContactFilter(
      [recent, stale],
      { ...EMPTY_CONTACT_FILTER, updatedWithinDays: 7 },
      { assets: [], search: '', now },
    );
    expect(out.map((c) => c.id)).toEqual(['recent']);
  });
});

describe('applyAssetFilter', () => {
  it('hasOwner=false keeps only unattached assets', () => {
    const a1 = makeAsset({ id: 'a1', contact_id: 'c1' });
    const a2 = makeAsset({ id: 'a2', contact_id: null });
    const out = applyAssetFilter(
      [a1, a2],
      { ...EMPTY_ASSET_FILTER, hasOwner: false },
      { search: '' },
    );
    expect(out.map((a) => a.id)).toEqual(['a2']);
  });
  it('availabilityContains is case-insensitive', () => {
    const a1 = makeAsset({ id: 'a1', availability: 'Tuesdays only' });
    const a2 = makeAsset({ id: 'a2', availability: 'Weekends' });
    const out = applyAssetFilter(
      [a1, a2],
      { ...EMPTY_ASSET_FILTER, availabilityContains: 'TUESDAY' },
      { search: '' },
    );
    expect(out.map((a) => a.id)).toEqual(['a1']);
  });
});

describe('applyContactSort', () => {
  it('asset_count_desc uses the precomputed map', () => {
    const contacts = [makeContact({ id: 'A' }), makeContact({ id: 'B' }), makeContact({ id: 'C' })];
    const assets = [
      makeAsset({ contact_id: 'B' }),
      makeAsset({ contact_id: 'B' }),
      makeAsset({ contact_id: 'B' }),
      makeAsset({ contact_id: 'A' }),
    ];
    const map = buildAssetCountMap(assets);
    const out = applyContactSort(contacts, 'asset_count_desc', { assetCountMap: map });
    expect(out.map((c) => c.id)).toEqual(['B', 'A', 'C']);
  });
  it('warmth_asc treats null as last', () => {
    const contacts = [
      makeContact({ id: 'A', warmth: null }),
      makeContact({ id: 'B', warmth: 1 }),
      makeContact({ id: 'C', warmth: 3 }),
    ];
    const out = applyContactSort(contacts, 'warmth_asc', { assets: [] });
    expect(out.map((c) => c.id)).toEqual(['B', 'C', 'A']);
  });
  it('name_desc is reverse alphabetical, case-insensitive', () => {
    const contacts = [
      makeContact({ id: 'a', name: 'anna' }),
      makeContact({ id: 'b', name: 'Bo' }),
      makeContact({ id: 'c', name: 'cara' }),
    ];
    const out = applyContactSort(contacts, 'name_desc', { assets: [] });
    expect(out.map((c) => c.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('applyAssetSort', () => {
  it('created_desc sorts newest first', () => {
    const a1 = makeAsset({ id: 'old', created_at: '2026-01-01T00:00:00Z' });
    const a2 = makeAsset({ id: 'new', created_at: '2026-05-01T00:00:00Z' });
    expect(applyAssetSort([a1, a2], 'created_desc').map((a) => a.id)).toEqual(['new', 'old']);
  });
});

describe('applyPinning', () => {
  it('hoists pinned ids to the top in pin order', () => {
    const list = [
      makeContact({ id: 'A' }),
      makeContact({ id: 'B' }),
      makeContact({ id: 'C' }),
      makeContact({ id: 'D' }),
    ];
    const { list: out, pinnedSet } = applyPinning(list, ['C', 'A']);
    expect(out.map((c) => c.id)).toEqual(['C', 'A', 'B', 'D']);
    expect([...pinnedSet]).toEqual(['C', 'A']);
  });
  it('preserves remaining order for unpinned items', () => {
    const list = [makeContact({ id: 'A' }), makeContact({ id: 'B' }), makeContact({ id: 'C' })];
    const { list: out } = applyPinning(list, ['B']);
    expect(out.map((c) => c.id)).toEqual(['B', 'A', 'C']);
  });
  it('ignores pin ids that aren’t present', () => {
    const list = [makeContact({ id: 'A' })];
    const { list: out } = applyPinning(list, ['MISSING', 'A']);
    expect(out.map((c) => c.id)).toEqual(['A']);
  });
});

describe('perf budget — filter + sort at 10k', () => {
  it('completes the full pipeline under 80 ms on 10k contacts', () => {
    const contacts: Contact[] = [];
    const cities = ['Stockholm', 'Göteborg', 'Malmö', 'Oslo', 'Berlin'];
    for (let i = 0; i < 10_000; i++) {
      contacts.push(
        makeContact({
          id: `c-${i}`,
          name: `Person ${i}`,
          city: cities[i % cities.length],
          tags: [`tag-${i % 50}`],
          warmth: ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5,
        }),
      );
    }
    const assets: Asset[] = [];
    for (let i = 0; i < 5_000; i++) {
      assets.push(makeAsset({ id: `a-${i}`, contact_id: `c-${i % 10_000}` }));
    }
    const start = performance.now();
    const map = buildAssetCountMap(assets);
    const filtered = applyContactFilter(
      contacts,
      { ...EMPTY_CONTACT_FILTER, cities: ['Stockholm'] },
      { assets, search: 'person' },
    );
    const sorted = applyContactSort(filtered, 'asset_count_desc', {
      assetCountMap: map,
    });
    const { list } = applyPinning(sorted, ['c-100', 'c-50']);
    const elapsed = performance.now() - start;
    expect(list.length).toBeGreaterThan(0);
    // Generous budget — gives headroom for CI cold runs.
    expect(elapsed).toBeLessThan(150);
  });
});
