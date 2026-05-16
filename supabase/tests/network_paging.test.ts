/**
 * Contract tests for the server-side network paging RPCs added in
 * 0013_network_paging_rpcs.sql:
 *
 *   - network_counts()
 *   - query_contacts_page(...)
 *   - query_assets_page(...)
 *
 * Asserted properties:
 *   1. Counts match the seeded data and are RLS-scoped (cross-user denial).
 *   2. Pagination: offset + limit, total_count is the filtered total
 *      (NOT just the page size).
 *   3. Sort modes: every sort mode produces the same ordering as the
 *      client comparator chain (primary key → name asc tiebreak → id asc).
 *   4. Null handling: rows with null sort keys always sort LAST,
 *      regardless of direction.
 *   5. Each filter facet narrows correctly (cities, warmth, tags any/all,
 *      has_assets, updated_within_days, search).
 *   6. Empty result sets return zero rows + total_count = 0.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testUserHarness, seedFactory, type TestUser } from '@reknowable/test-utils';

async function callContacts(
  user: TestUser,
  args: Record<string, unknown> = {},
): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await user.supabase.rpc('query_contacts_page', args);
  if (error) throw new Error(`query_contacts_page failed: ${error.message}`);
  return (data ?? []) as Array<Record<string, unknown>>;
}

async function callAssets(
  user: TestUser,
  args: Record<string, unknown> = {},
): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await user.supabase.rpc('query_assets_page', args);
  if (error) throw new Error(`query_assets_page failed: ${error.message}`);
  return (data ?? []) as Array<Record<string, unknown>>;
}

describe('network_counts', () => {
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    alice = await testUserHarness('counts-alice');
    bob = await testUserHarness('counts-bob');
  });

  afterEach(async () => {
    await alice.cleanup();
    await bob.cleanup();
  });

  it('returns zero counts for a fresh user', async () => {
    const { data, error } = await alice.supabase.rpc('network_counts');
    expect(error).toBeNull();
    expect(data).toEqual([{ contacts: 0, assets: 0 }]);
  });

  it("counts only the calling user's alive rows (RLS-scoped)", async () => {
    // Alice has 3 contacts (one soft-deleted) + 1 asset
    await seedFactory.contact(alice.supabase, { name: 'A1' });
    await seedFactory.contact(alice.supabase, { name: 'A2' });
    const { id: deleted } = await seedFactory.contact(alice.supabase, { name: 'A3' });
    await alice.supabase
      .from('contacts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deleted);
    await seedFactory.asset(alice.supabase, { name: 'A-asset' });

    // Bob has 5 contacts + 2 assets — should be invisible to Alice
    for (let i = 0; i < 5; i++) await seedFactory.contact(bob.supabase, { name: `B${i}` });
    await seedFactory.asset(bob.supabase, { name: 'B-a1' });
    await seedFactory.asset(bob.supabase, { name: 'B-a2' });

    const { data: aliceData } = await alice.supabase.rpc('network_counts');
    expect(aliceData).toEqual([{ contacts: 2, assets: 1 }]);

    const { data: bobData } = await bob.supabase.rpc('network_counts');
    expect(bobData).toEqual([{ contacts: 5, assets: 2 }]);
  });
});

describe('query_contacts_page — basic pagination + total_count', () => {
  let alice: TestUser;

  beforeEach(async () => {
    alice = await testUserHarness('page-basic');
  });

  afterEach(async () => {
    await alice.cleanup();
  });

  it('returns no rows + total=0 for empty user', async () => {
    const rows = await callContacts(alice);
    expect(rows).toEqual([]);
  });

  it('total_count reflects the FULL filtered count, not the page size', async () => {
    for (let i = 0; i < 25; i++) {
      await seedFactory.contact(alice.supabase, { name: `C${i.toString().padStart(2, '0')}` });
    }
    const page1 = await callContacts(alice, { p_offset: 0, p_limit: 10 });
    expect(page1).toHaveLength(10);
    expect(page1[0].total_count).toBe(25);

    const page2 = await callContacts(alice, { p_offset: 10, p_limit: 10 });
    expect(page2).toHaveLength(10);
    expect(page2[0].total_count).toBe(25);

    const page3 = await callContacts(alice, { p_offset: 20, p_limit: 10 });
    expect(page3).toHaveLength(5);
    expect(page3[0].total_count).toBe(25);
  });

  it('paginates without duplicates or gaps across the full set', async () => {
    for (let i = 0; i < 23; i++) {
      await seedFactory.contact(alice.supabase, { name: `C${i.toString().padStart(2, '0')}` });
    }
    const collected: string[] = [];
    for (let offset = 0; offset < 23; offset += 7) {
      const page = await callContacts(alice, {
        p_offset: offset,
        p_limit: 7,
        p_sort: 'name_asc',
      });
      for (const row of page) collected.push(row.name as string);
    }
    expect(collected).toHaveLength(23);
    expect(new Set(collected).size).toBe(23);
  });
});

describe('query_contacts_page — sort modes (match client comparator chain)', () => {
  let alice: TestUser;

  beforeEach(async () => {
    alice = await testUserHarness('page-sort');
  });

  afterEach(async () => {
    await alice.cleanup();
  });

  it('warmth_desc puts warmest first, ties resolved by name asc, nulls last', async () => {
    await seedFactory.contact(alice.supabase, { name: 'Charlie', warmth: 5 });
    await seedFactory.contact(alice.supabase, { name: 'Anna', warmth: 5 });
    await seedFactory.contact(alice.supabase, { name: 'Bo', warmth: 3 });
    // null warmth (set after insert since the factory defaults to 3)
    const { id } = await seedFactory.contact(alice.supabase, { name: 'Diana' });
    await alice.supabase.from('contacts').update({ warmth: null }).eq('id', id);
    await seedFactory.contact(alice.supabase, { name: 'Alma', warmth: 5 });

    const rows = await callContacts(alice, { p_sort: 'warmth_desc' });
    // warmth=5 tier alphabetical (Alma, Anna, Charlie), warmth=3 (Bo), null last (Diana)
    expect(rows.map((r) => r.name)).toEqual(['Alma', 'Anna', 'Charlie', 'Bo', 'Diana']);
  });

  it('warmth_asc puts coldest first, ties resolved by name asc, nulls STILL last', async () => {
    await seedFactory.contact(alice.supabase, { name: 'Bo', warmth: 1 });
    await seedFactory.contact(alice.supabase, { name: 'Anna', warmth: 1 });
    await seedFactory.contact(alice.supabase, { name: 'Charlie', warmth: 2 });
    const { id } = await seedFactory.contact(alice.supabase, { name: 'Diana' });
    await alice.supabase.from('contacts').update({ warmth: null }).eq('id', id);

    const rows = await callContacts(alice, { p_sort: 'warmth_asc' });
    expect(rows.map((r) => r.name)).toEqual(['Anna', 'Bo', 'Charlie', 'Diana']);
  });

  it('name_asc / name_desc are case-insensitive in tiebreaks, alphabetical', async () => {
    await seedFactory.contact(alice.supabase, { name: 'cara' });
    await seedFactory.contact(alice.supabase, { name: 'Bo' });
    await seedFactory.contact(alice.supabase, { name: 'anna' });

    const asc = await callContacts(alice, { p_sort: 'name_asc' });
    expect(asc.map((r) => r.name)).toEqual(['anna', 'Bo', 'cara']);
    const desc = await callContacts(alice, { p_sort: 'name_desc' });
    expect(desc.map((r) => r.name)).toEqual(['cara', 'Bo', 'anna']);
  });

  it('updated_desc tiebreaks by name when timestamps collide', async () => {
    const ts = new Date('2026-04-01T00:00:00Z').toISOString();
    const { id: c1 } = await seedFactory.contact(alice.supabase, { name: 'Charlie' });
    const { id: c2 } = await seedFactory.contact(alice.supabase, { name: 'Anna' });
    const { id: c3 } = await seedFactory.contact(alice.supabase, { name: 'Bo' });
    await alice.supabase.from('contacts').update({ updated_at: ts }).in('id', [c1, c2, c3]);

    const rows = await callContacts(alice, { p_sort: 'updated_desc' });
    expect(rows.map((r) => r.name)).toEqual(['Anna', 'Bo', 'Charlie']);
  });

  it('asset_count_desc puts the most-connected contact first, tiebreak by name', async () => {
    const { id: charlie } = await seedFactory.contact(alice.supabase, { name: 'Charlie' });
    const { id: anna } = await seedFactory.contact(alice.supabase, { name: 'Anna' });
    // Bo is seeded with zero assets — id unused, the row appears via the
    // sort assertion below.
    await seedFactory.contact(alice.supabase, { name: 'Bo' });

    // Charlie + Anna both have 2 assets (tie); Bo has 0.
    await seedFactory.asset(alice.supabase, { contact_id: charlie });
    await seedFactory.asset(alice.supabase, { contact_id: charlie });
    await seedFactory.asset(alice.supabase, { contact_id: anna });
    await seedFactory.asset(alice.supabase, { contact_id: anna });

    const rows = await callContacts(alice, { p_sort: 'asset_count_desc' });
    expect(rows.map((r) => r.name)).toEqual(['Anna', 'Charlie', 'Bo']);
    expect(rows.map((r) => r.asset_count)).toEqual([2, 2, 0]);
  });
});

describe('query_contacts_page — filters', () => {
  let alice: TestUser;

  beforeEach(async () => {
    alice = await testUserHarness('page-filter');
  });

  afterEach(async () => {
    await alice.cleanup();
  });

  it('p_cities filters by city (case-sensitive equality, list semantics)', async () => {
    await seedFactory.contact(alice.supabase, { name: 'A', city: 'Stockholm' });
    await seedFactory.contact(alice.supabase, { name: 'B', city: 'Göteborg' });
    await seedFactory.contact(alice.supabase, { name: 'C', city: 'Stockholm' });
    await seedFactory.contact(alice.supabase, { name: 'D', city: 'Malmö' });

    const rows = await callContacts(alice, { p_cities: ['Stockholm', 'Malmö'] });
    expect(rows.map((r) => r.name).sort()).toEqual(['A', 'C', 'D']);
    expect(rows[0].total_count).toBe(3);
  });

  it('p_warmth filters by warmth (list semantics)', async () => {
    await seedFactory.contact(alice.supabase, { name: 'A', warmth: 1 });
    await seedFactory.contact(alice.supabase, { name: 'B', warmth: 3 });
    await seedFactory.contact(alice.supabase, { name: 'C', warmth: 5 });
    await seedFactory.contact(alice.supabase, { name: 'D', warmth: 3 });

    const rows = await callContacts(alice, { p_warmth: [3, 5] });
    expect(rows.map((r) => r.name).sort()).toEqual(['B', 'C', 'D']);
  });

  it('p_tags_any: row matches if it has ANY of the listed tags', async () => {
    await seedFactory.contact(alice.supabase, { name: 'A', tags: ['engineer'] });
    await seedFactory.contact(alice.supabase, { name: 'B', tags: ['founder'] });
    await seedFactory.contact(alice.supabase, { name: 'C', tags: ['designer'] });
    await seedFactory.contact(alice.supabase, { name: 'D', tags: ['engineer', 'designer'] });

    const rows = await callContacts(alice, { p_tags_any: ['engineer', 'founder'] });
    expect(rows.map((r) => r.name).sort()).toEqual(['A', 'B', 'D']);
  });

  it('p_tags_all: row matches only if it has ALL listed tags', async () => {
    await seedFactory.contact(alice.supabase, { name: 'A', tags: ['engineer'] });
    await seedFactory.contact(alice.supabase, { name: 'B', tags: ['founder', 'investor'] });
    await seedFactory.contact(alice.supabase, { name: 'C', tags: ['engineer', 'founder'] });
    await seedFactory.contact(alice.supabase, {
      name: 'D',
      tags: ['engineer', 'founder', 'investor'],
    });

    const rows = await callContacts(alice, { p_tags_all: ['engineer', 'founder'] });
    expect(rows.map((r) => r.name).sort()).toEqual(['C', 'D']);
  });

  it('p_has_assets=true keeps only contacts that own at least one asset', async () => {
    const { id: withAssets } = await seedFactory.contact(alice.supabase, { name: 'A' });
    await seedFactory.contact(alice.supabase, { name: 'B' });
    await seedFactory.asset(alice.supabase, { contact_id: withAssets });

    const rows = await callContacts(alice, { p_has_assets: true });
    expect(rows.map((r) => r.name)).toEqual(['A']);
  });

  it('p_has_assets=false keeps only contacts with no assets', async () => {
    const { id: withAssets } = await seedFactory.contact(alice.supabase, { name: 'A' });
    await seedFactory.contact(alice.supabase, { name: 'B' });
    await seedFactory.asset(alice.supabase, { contact_id: withAssets });

    const rows = await callContacts(alice, { p_has_assets: false });
    expect(rows.map((r) => r.name)).toEqual(['B']);
  });

  it('p_search matches name OR notes OR city, case-insensitive', async () => {
    await seedFactory.contact(alice.supabase, { name: 'Anna Svensson', city: 'Stockholm' });
    await seedFactory.contact(alice.supabase, {
      name: 'Bo Larsson',
      notes: 'works at klarna',
      city: 'Göteborg',
    });
    await seedFactory.contact(alice.supabase, { name: 'Cara Klein', city: 'Malmö' });

    const byName = await callContacts(alice, { p_search: 'svensson' });
    expect(byName.map((r) => r.name)).toEqual(['Anna Svensson']);

    const byNotes = await callContacts(alice, { p_search: 'klarna' });
    expect(byNotes.map((r) => r.name)).toEqual(['Bo Larsson']);

    const byCity = await callContacts(alice, { p_search: 'malmö' });
    expect(byCity.map((r) => r.name)).toEqual(['Cara Klein']);
  });

  it('asset_count is computed correctly for each contact', async () => {
    const { id: c1 } = await seedFactory.contact(alice.supabase, { name: 'A' });
    const { id: c2 } = await seedFactory.contact(alice.supabase, { name: 'B' });
    await seedFactory.contact(alice.supabase, { name: 'C' });
    await seedFactory.asset(alice.supabase, { contact_id: c1 });
    await seedFactory.asset(alice.supabase, { contact_id: c1 });
    await seedFactory.asset(alice.supabase, { contact_id: c1 });
    await seedFactory.asset(alice.supabase, { contact_id: c2 });

    const rows = await callContacts(alice, { p_sort: 'name_asc' });
    const byName = Object.fromEntries(rows.map((r) => [r.name, r.asset_count]));
    expect(byName).toEqual({ A: 3, B: 1, C: 0 });
  });
});

describe('query_assets_page', () => {
  let alice: TestUser;

  beforeEach(async () => {
    alice = await testUserHarness('page-assets');
  });

  afterEach(async () => {
    await alice.cleanup();
  });

  it('returns empty array for a fresh user', async () => {
    const rows = await callAssets(alice);
    expect(rows).toEqual([]);
  });

  it('p_has_owner=true / false correctly partitions assets', async () => {
    const { id: owner } = await seedFactory.contact(alice.supabase, { name: 'Owner' });
    await seedFactory.asset(alice.supabase, { name: 'Owned', contact_id: owner });
    await seedFactory.asset(alice.supabase, { name: 'Standalone' });

    const owned = await callAssets(alice, { p_has_owner: true });
    expect(owned.map((r) => r.name)).toEqual(['Owned']);

    const standalone = await callAssets(alice, { p_has_owner: false });
    expect(standalone.map((r) => r.name)).toEqual(['Standalone']);
  });

  it('total_count reflects the filtered total, not the page size', async () => {
    for (let i = 0; i < 15; i++) {
      await seedFactory.asset(alice.supabase, { name: `A${i.toString().padStart(2, '0')}` });
    }
    const page = await callAssets(alice, { p_offset: 0, p_limit: 5 });
    expect(page).toHaveLength(5);
    expect(page[0].total_count).toBe(15);
  });

  it('search matches across name, description, availability', async () => {
    await seedFactory.asset(alice.supabase, { name: 'Studio in SoFo', description: 'great vibe' });
    await seedFactory.asset(alice.supabase, {
      name: 'Beach house',
      description: 'sleeps 6',
      availability: 'August only',
    });

    const byName = await callAssets(alice, { p_search: 'sofo' });
    expect(byName.map((r) => r.name)).toEqual(['Studio in SoFo']);

    const byDesc = await callAssets(alice, { p_search: 'sleeps' });
    expect(byDesc.map((r) => r.name)).toEqual(['Beach house']);

    const byAvail = await callAssets(alice, { p_search: 'august' });
    expect(byAvail.map((r) => r.name)).toEqual(['Beach house']);
  });
});

describe('network_facets', () => {
  let alice: TestUser;

  beforeEach(async () => {
    alice = await testUserHarness('facets');
  });

  afterEach(async () => {
    await alice.cleanup();
  });

  it('returns empty arrays for every facet on a fresh user', async () => {
    const { data, error } = await alice.supabase.rpc('network_facets');
    expect(error).toBeNull();
    expect(data).toEqual({
      cities: [],
      tags: [],
      warmth: [],
      asset_tags: [],
      asset_availability: [],
    });
  });

  it('counts cities, tags, warmth, asset_tags, asset_availability accurately', async () => {
    // 3 Stockholm + 2 Göteborg
    await seedFactory.contact(alice.supabase, {
      name: 'A',
      city: 'Stockholm',
      tags: ['engineer'],
      warmth: 5,
    });
    await seedFactory.contact(alice.supabase, {
      name: 'B',
      city: 'Stockholm',
      tags: ['founder'],
      warmth: 3,
    });
    await seedFactory.contact(alice.supabase, {
      name: 'C',
      city: 'Stockholm',
      tags: ['engineer', 'investor'],
      warmth: 3,
    });
    await seedFactory.contact(alice.supabase, {
      name: 'D',
      city: 'Göteborg',
      tags: ['designer'],
      warmth: 5,
    });
    await seedFactory.contact(alice.supabase, { name: 'E', city: 'Göteborg', tags: [], warmth: 5 });

    await seedFactory.asset(alice.supabase, { tags: ['studio'], availability: 'August' });
    await seedFactory.asset(alice.supabase, {
      tags: ['studio', 'equipment'],
      availability: 'August',
    });
    await seedFactory.asset(alice.supabase, { tags: ['equipment'] });

    const { data, error } = await alice.supabase.rpc('network_facets');
    expect(error).toBeNull();

    expect(data.cities).toEqual([
      { value: 'Stockholm', count: 3 },
      { value: 'Göteborg', count: 2 },
    ]);
    // engineer=2, founder=1, investor=1, designer=1 → ordered by count desc, then alphabetical
    expect(data.tags).toEqual([
      { value: 'engineer', count: 2 },
      { value: 'designer', count: 1 },
      { value: 'founder', count: 1 },
      { value: 'investor', count: 1 },
    ]);
    expect(data.warmth).toEqual([
      { value: 3, count: 2 },
      { value: 5, count: 3 },
    ]);
    expect(data.asset_tags).toEqual([
      { value: 'equipment', count: 2 },
      { value: 'studio', count: 2 },
    ]);
    expect(data.asset_availability).toEqual([{ value: 'August', count: 2 }]);
  });

  it("is RLS-scoped — never leaks another user's facets", async () => {
    await seedFactory.contact(alice.supabase, {
      name: 'A',
      city: 'Alice Town',
      tags: ['alice-only'],
    });
    const bob = await testUserHarness('facets-bob');
    try {
      await seedFactory.contact(bob.supabase, { name: 'B', city: 'Bob City', tags: ['bob-only'] });

      const { data: aliceData } = await alice.supabase.rpc('network_facets');
      expect(aliceData.cities.map((c: { value: string }) => c.value)).toEqual(['Alice Town']);
      expect(aliceData.tags.map((t: { value: string }) => t.value)).toEqual(['alice-only']);
    } finally {
      await bob.cleanup();
    }
  });
});
