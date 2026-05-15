/**
 * query_sql RPC: SELECT/WITH only, RLS-scoped via SECURITY INVOKER.
 * This is one of the four agent tools — its safety is non-negotiable.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testUserHarness, seedFactory, type TestUser } from '@network-ai/test-utils';

describe('query_sql', () => {
  let alice: TestUser;

  beforeEach(async () => {
    alice = await testUserHarness('query-sql');
  });

  afterEach(async () => {
    await alice.cleanup();
  });

  it("returns the current user's rows as JSONB array", async () => {
    await seedFactory.contact(alice.supabase, { name: 'Anna', warmth: 1 });
    await seedFactory.contact(alice.supabase, { name: 'Bo', warmth: 3 });

    const { data, error } = await alice.supabase.rpc('query_sql', {
      query: 'select name, warmth from contacts order by warmth',
    });
    expect(error).toBeNull();
    expect(data).toEqual([
      { name: 'Anna', warmth: 1 },
      { name: 'Bo', warmth: 3 },
    ]);
  });

  it('returns [] for queries that match no rows', async () => {
    const { data, error } = await alice.supabase.rpc('query_sql', {
      query: "select * from contacts where name = 'nobody'",
    });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('supports WITH (CTE) queries', async () => {
    await seedFactory.contact(alice.supabase, { warmth: 1 });
    await seedFactory.contact(alice.supabase, { warmth: 1 });
    await seedFactory.contact(alice.supabase, { warmth: 4 });

    const { data, error } = await alice.supabase.rpc('query_sql', {
      query: `with grouped as (select warmth, count(*)::int as n from contacts group by warmth)
              select * from grouped order by warmth`,
    });
    expect(error).toBeNull();
    expect(data).toEqual([
      { warmth: 1, n: 2 },
      { warmth: 4, n: 1 },
    ]);
  });

  it('rejects INSERT statements', async () => {
    const { error } = await alice.supabase.rpc('query_sql', {
      query: "insert into contacts (name) values ('x')",
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/SELECT/i);
  });

  it('rejects UPDATE statements', async () => {
    const { error } = await alice.supabase.rpc('query_sql', {
      query: 'update contacts set warmth = 1',
    });
    expect(error).not.toBeNull();
  });

  it('rejects DELETE statements', async () => {
    const { error } = await alice.supabase.rpc('query_sql', {
      query: 'delete from contacts',
    });
    expect(error).not.toBeNull();
  });

  it("RLS-scopes: cannot see another user's rows", async () => {
    const bob = await testUserHarness('query-sql-bob');
    try {
      await seedFactory.contact(bob.supabase, { name: 'Bob-only' });

      const { data, error } = await alice.supabase.rpc('query_sql', {
        query: 'select count(*)::int as n from contacts',
      });
      expect(error).toBeNull();
      expect(data).toEqual([{ n: 0 }]);
    } finally {
      await bob.cleanup();
    }
  });
});
