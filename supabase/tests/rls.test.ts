/**
 * RLS contract: every owner-scoped table must reject reads/writes from other users.
 * If any of these fail, the agent's SECURITY INVOKER full-SQL tools become a data leak.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testUserHarness, seedFactory, type TestUser } from '@network-ai/test-utils';

describe('RLS — cross-user isolation', () => {
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    alice = await testUserHarness('alice');
    bob = await testUserHarness('bob');
  });

  afterEach(async () => {
    await alice.cleanup();
    await bob.cleanup();
  });

  it("contacts: bob cannot select alice's rows", async () => {
    await seedFactory.contact(alice.supabase, { name: 'Anna' });

    const { data } = await bob.supabase.from('contacts').select('*');
    expect(data).toEqual([]);
  });

  it("contacts: bob cannot update alice's rows", async () => {
    const { id } = await seedFactory.contact(alice.supabase, { name: 'Anna', warmth: 2 });

    const { data, error } = await bob.supabase
      .from('contacts')
      .update({ warmth: 5 })
      .eq('id', id)
      .select();

    // RLS makes the row invisible — UPDATE returns no rows, but does not error.
    expect(error).toBeNull();
    expect(data).toEqual([]);

    // Alice still sees warmth=2
    const { data: aliceRows } = await alice.supabase.from('contacts').select('warmth').eq('id', id);
    expect(aliceRows?.[0]?.warmth).toBe(2);
  });

  it("contacts: bob cannot insert with alice's user_id", async () => {
    const { error } = await bob.supabase
      .from('contacts')
      .insert({ name: 'Hijacked', user_id: alice.userId } as never);

    // RLS WITH CHECK clause rejects: alice.userId ≠ bob.userId
    expect(error).not.toBeNull();
  });

  it('assets: cross-user isolation', async () => {
    await seedFactory.asset(alice.supabase, { name: 'Studio' });
    const { data } = await bob.supabase.from('assets').select('*');
    expect(data).toEqual([]);
  });

  it('chat_threads + chat_messages: cross-user isolation', async () => {
    const { id: threadId } = await seedFactory.thread(alice.supabase, { title: 'private' });
    await alice.supabase.from('chat_messages').insert({
      thread_id: threadId,
      user_id: alice.userId,
      role: 'user',
      content: { text: 'hello' },
    });

    const { data: bobThreads } = await bob.supabase.from('chat_threads').select('*');
    const { data: bobMessages } = await bob.supabase.from('chat_messages').select('*');
    expect(bobThreads).toEqual([]);
    expect(bobMessages).toEqual([]);
  });

  it('owner can do everything within their own scope', async () => {
    const { id } = await seedFactory.contact(alice.supabase, { name: 'Anna', warmth: 3 });

    const { error: updErr } = await alice.supabase
      .from('contacts')
      .update({ warmth: 1 })
      .eq('id', id);
    expect(updErr).toBeNull();

    const { data: rows } = await alice.supabase.from('contacts').select('warmth').eq('id', id);
    expect(rows?.[0]?.warmth).toBe(1);

    const { error: delErr } = await alice.supabase.from('contacts').delete().eq('id', id);
    expect(delErr).toBeNull();
  });
});
