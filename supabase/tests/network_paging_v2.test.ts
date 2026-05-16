/**
 * Contract tests for the v2 paging + lookup + validation RPCs added in
 * 0014_finalize_paging_and_lookup.sql:
 *
 *   - query_contacts_page / query_assets_page  (p_search now FTS + trigram)
 *   - find_anything                            (now returns top-level `total`)
 *   - lookup_contacts_by_ids / lookup_assets_by_ids
 *   - validate_panel_pins
 *
 * The original network_paging.test.ts stays — those tests exercise
 * filter/sort/pagination correctness which 0014 doesn't change. This
 * file covers ONLY the new semantics.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testUserHarness, seedFactory, type TestUser } from '@reknowable/test-utils';

async function call<T = unknown>(
  user: TestUser,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await user.supabase.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

// ─── p_search: FTS stem matching ─────────────────────────────────

describe('query_contacts_page — p_search FTS upgrade', () => {
  let alice: TestUser;

  beforeEach(async () => {
    alice = await testUserHarness('search-fts');
  });

  afterEach(async () => {
    await alice.cleanup();
  });

  it('matches stem variants via FTS (podcast → podcaster / podcasting)', async () => {
    // Three contacts whose notes share a stem but differ in suffix.
    await seedFactory.contact(alice.supabase, {
      name: 'Anna',
      notes: 'hosts a podcast in Stockholm',
    });
    await seedFactory.contact(alice.supabase, { name: 'Bo', notes: 'podcaster, joined recently' });
    await seedFactory.contact(alice.supabase, { name: 'Cara', notes: 'into podcasting equipment' });
    await seedFactory.contact(alice.supabase, { name: 'Diana', notes: 'completely unrelated' });

    const rows = await call<Array<{ name: string; total_count: number }>>(
      alice,
      'query_contacts_page',
      { p_search: 'podcast' },
    );
    const names = new Set(rows.map((r) => r.name));
    expect(names.has('Anna')).toBe(true);
    expect(names.has('Bo')).toBe(true);
    expect(names.has('Cara')).toBe(true);
    expect(names.has('Diana')).toBe(false);
  });

  it('falls through to trigram on typo (extra letter)', async () => {
    // Trigram's default similarity threshold is 0.3. "Annaa" vs
    // "Anna Svensson" overlaps in 'ann' + 'nna' → similarity ≈ 0.5,
    // safely above threshold. The realistic-typo test.
    await seedFactory.contact(alice.supabase, { name: 'Anna Svensson' });
    await seedFactory.contact(alice.supabase, { name: 'Bo Larsson' });
    const rows = await call<Array<{ name: string }>>(alice, 'query_contacts_page', {
      p_search: 'Annaa',
    });
    const names = rows.map((r) => r.name);
    expect(names).toContain('Anna Svensson');
  });

  it('returns 0 when search matches nothing', async () => {
    await seedFactory.contact(alice.supabase, { name: 'Anna' });
    const rows = await call<Array<{ name: string }>>(alice, 'query_contacts_page', {
      p_search: 'zxqwvbnxxxxxxx',
    });
    expect(rows).toEqual([]);
  });
});

describe('query_assets_page — p_search FTS upgrade', () => {
  let alice: TestUser;

  beforeEach(async () => {
    alice = await testUserHarness('search-assets-fts');
  });

  afterEach(async () => {
    await alice.cleanup();
  });

  it('matches stem variants over name + description + availability', async () => {
    await seedFactory.asset(alice.supabase, {
      name: 'Studio in SoFo',
      description: 'recording booth',
    });
    await seedFactory.asset(alice.supabase, {
      name: 'Camera kit',
      description: 'for film recording',
    });
    await seedFactory.asset(alice.supabase, { name: 'Apartment', description: 'guest stays' });

    const rows = await call<Array<{ name: string }>>(alice, 'query_assets_page', {
      p_search: 'record',
    });
    const names = rows.map((r) => r.name);
    expect(names).toContain('Studio in SoFo');
    expect(names).toContain('Camera kit');
    expect(names).not.toContain('Apartment');
  });
});

// ─── find_anything.total ─────────────────────────────────────────

describe('find_anything — total field', () => {
  let alice: TestUser;

  beforeEach(async () => {
    alice = await testUserHarness('find-total');
  });

  afterEach(async () => {
    await alice.cleanup();
  });

  it('returns total counts BEFORE the match_count cap', async () => {
    // Seed 12 contacts with the same tag; cap match_count at 5.
    for (let i = 0; i < 12; i++) {
      await seedFactory.contact(alice.supabase, {
        name: `Contact ${i.toString().padStart(2, '0')}`,
        tags: ['gaming'],
      });
    }
    const result = await call<{
      contacts: unknown[];
      assets: unknown[];
      total: { contacts: number; assets: number };
    }>(alice, 'find_anything', {
      any_tags: ['gaming'],
      match_count: 5,
    });
    expect(result.contacts.length).toBeLessThanOrEqual(5);
    expect(Number(result.total.contacts)).toBe(12);
    expect(Number(result.total.assets)).toBe(0);
  });

  it('total stays 0 when nothing matches', async () => {
    await seedFactory.contact(alice.supabase, { name: 'Anna', tags: ['engineer'] });
    const result = await call<{
      total: { contacts: number; assets: number };
    }>(alice, 'find_anything', { any_tags: ['nonexistent-tag-xyz'] });
    expect(Number(result.total.contacts)).toBe(0);
    expect(Number(result.total.assets)).toBe(0);
  });
});

// ─── lookup_contacts_by_ids ──────────────────────────────────────

describe('lookup_contacts_by_ids', () => {
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    alice = await testUserHarness('lookup-contacts');
    bob = await testUserHarness('lookup-bob');
  });

  afterEach(async () => {
    await alice.cleanup();
    await bob.cleanup();
  });

  it('returns rows for the calling user only (RLS-scoped)', async () => {
    const { id: aliceContactId } = await seedFactory.contact(alice.supabase, { name: 'Alice C' });
    const { id: bobContactId } = await seedFactory.contact(bob.supabase, { name: 'Bob C' });

    const aliceResult = await call<Array<{ id: string; name: string }>>(
      alice,
      'lookup_contacts_by_ids',
      { p_ids: [aliceContactId, bobContactId] },
    );
    // Only Alice's id should come back — Bob's filtered by RLS.
    expect(aliceResult.length).toBe(1);
    expect(aliceResult[0].id).toBe(aliceContactId);
  });

  it('returns asset_count alongside the row', async () => {
    const { id: contactId } = await seedFactory.contact(alice.supabase, { name: 'Withassets' });
    await seedFactory.asset(alice.supabase, { contact_id: contactId });
    await seedFactory.asset(alice.supabase, { contact_id: contactId });
    await seedFactory.asset(alice.supabase, { contact_id: contactId });

    const rows = await call<Array<{ id: string; asset_count: number }>>(
      alice,
      'lookup_contacts_by_ids',
      { p_ids: [contactId] },
    );
    expect(rows.length).toBe(1);
    expect(Number(rows[0].asset_count)).toBe(3);
  });

  it('skips soft-deleted rows', async () => {
    const { id } = await seedFactory.contact(alice.supabase, { name: 'Ghost' });
    await alice.supabase
      .from('contacts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    const rows = await call<Array<{ id: string }>>(alice, 'lookup_contacts_by_ids', {
      p_ids: [id],
    });
    expect(rows).toEqual([]);
  });

  it('returns empty array for empty input', async () => {
    const rows = await call<Array<unknown>>(alice, 'lookup_contacts_by_ids', { p_ids: [] });
    expect(rows).toEqual([]);
  });
});

describe('lookup_assets_by_ids', () => {
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    alice = await testUserHarness('lookup-assets');
    bob = await testUserHarness('lookup-assets-bob');
  });

  afterEach(async () => {
    await alice.cleanup();
    await bob.cleanup();
  });

  it('is RLS-scoped', async () => {
    const { id: aliceAssetId } = await seedFactory.asset(alice.supabase, { name: 'Alice A' });
    const { id: bobAssetId } = await seedFactory.asset(bob.supabase, { name: 'Bob A' });
    const rows = await call<Array<{ id: string }>>(alice, 'lookup_assets_by_ids', {
      p_ids: [aliceAssetId, bobAssetId],
    });
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(aliceAssetId);
  });
});

// ─── validate_panel_pins ─────────────────────────────────────────

describe('validate_panel_pins', () => {
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    alice = await testUserHarness('validate-pins');
    bob = await testUserHarness('validate-pins-bob');
  });

  afterEach(async () => {
    await alice.cleanup();
    await bob.cleanup();
  });

  it('separates valid from missing for the calling user', async () => {
    const { id: aliceContactId } = await seedFactory.contact(alice.supabase, { name: 'Alice' });
    const { id: bobContactId } = await seedFactory.contact(bob.supabase, { name: 'Bob' });
    const fakeId = '00000000-0000-0000-0000-000000000000';

    const result = await call<{
      valid_contact_ids: string[];
      missing_contact_ids: string[];
      valid_asset_ids: string[];
      missing_asset_ids: string[];
    }>(alice, 'validate_panel_pins', {
      p_contact_ids: [aliceContactId, bobContactId, fakeId],
      p_asset_ids: [],
    });

    expect(result.valid_contact_ids).toEqual([aliceContactId]);
    // Both Bob's id (RLS-hidden) and the made-up id are "missing" from Alice's view.
    expect(result.missing_contact_ids.sort()).toEqual([bobContactId, fakeId].sort());
    expect(result.valid_asset_ids).toEqual([]);
    expect(result.missing_asset_ids).toEqual([]);
  });

  it('soft-deleted ids count as missing', async () => {
    const { id } = await seedFactory.contact(alice.supabase, { name: 'Ghost' });
    await alice.supabase
      .from('contacts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    const result = await call<{ valid_contact_ids: string[]; missing_contact_ids: string[] }>(
      alice,
      'validate_panel_pins',
      { p_contact_ids: [id], p_asset_ids: [] },
    );
    expect(result.valid_contact_ids).toEqual([]);
    expect(result.missing_contact_ids).toEqual([id]);
  });

  it('returns empty arrays when no input', async () => {
    const result = await call<{
      valid_contact_ids: string[];
      missing_contact_ids: string[];
      valid_asset_ids: string[];
      missing_asset_ids: string[];
    }>(alice, 'validate_panel_pins', { p_contact_ids: [], p_asset_ids: [] });
    expect(result.valid_contact_ids).toEqual([]);
    expect(result.missing_contact_ids).toEqual([]);
    expect(result.valid_asset_ids).toEqual([]);
    expect(result.missing_asset_ids).toEqual([]);
  });
});
