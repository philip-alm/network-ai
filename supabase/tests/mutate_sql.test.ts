/**
 * mutate_sql RPC: INSERT/UPDATE/DELETE with RETURNING. RLS-scoped via SECURITY INVOKER.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testUserHarness, seedFactory, type TestUser } from '@reknowable/test-utils';

describe('mutate_sql', () => {
  let alice: TestUser;

  beforeEach(async () => {
    alice = await testUserHarness('mutate-sql');
  });

  afterEach(async () => {
    await alice.cleanup();
  });

  it('INSERT with RETURNING returns the inserted row', async () => {
    const { data, error } = await alice.supabase.rpc('mutate_sql', {
      query: `insert into contacts (user_id, name, warmth)
              values (auth.uid(), 'Anna', 2)
              returning id, name, warmth`,
    });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ name: 'Anna', warmth: 2 });
  });

  it('UPDATE with RETURNING returns affected rows', async () => {
    const { id } = await seedFactory.contact(alice.supabase, { warmth: 3 });

    const { data, error } = await alice.supabase.rpc('mutate_sql', {
      query: `update contacts set warmth = 1 where id = '${id}' returning id, warmth`,
    });
    expect(error).toBeNull();
    expect(data).toEqual([{ id, warmth: 1 }]);
  });

  it('DELETE with RETURNING returns deleted rows', async () => {
    const { id } = await seedFactory.contact(alice.supabase, { name: 'todelete' });

    const { data, error } = await alice.supabase.rpc('mutate_sql', {
      query: `delete from contacts where id = '${id}' returning id`,
    });
    expect(error).toBeNull();
    expect(data).toEqual([{ id }]);
  });

  it('rejects SELECT statements', async () => {
    const { error } = await alice.supabase.rpc('mutate_sql', {
      query: 'select * from contacts',
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/INSERT \/ UPDATE \/ DELETE/i);
  });

  it("RLS-scopes: cannot insert with another user's user_id", async () => {
    const bob = await testUserHarness('mutate-sql-bob');
    try {
      const { error } = await alice.supabase.rpc('mutate_sql', {
        query: `insert into contacts (user_id, name) values ('${bob.userId}', 'fake') returning id`,
      });
      // RLS WITH CHECK rejects.
      expect(error).not.toBeNull();
    } finally {
      await bob.cleanup();
    }
  });

  it("RLS-scopes: cannot update another user's rows (no rows affected, no error)", async () => {
    const bob = await testUserHarness('mutate-sql-bob2');
    try {
      const { id } = await seedFactory.contact(bob.supabase, { warmth: 3 });

      const { data, error } = await alice.supabase.rpc('mutate_sql', {
        query: `update contacts set warmth = 1 where id = '${id}' returning id`,
      });
      expect(error).toBeNull();
      expect(data).toEqual([]);

      const { data: stillThree } = await bob.supabase
        .from('contacts')
        .select('warmth')
        .eq('id', id);
      expect(stillThree?.[0]?.warmth).toBe(3);
    } finally {
      await bob.cleanup();
    }
  });
});
