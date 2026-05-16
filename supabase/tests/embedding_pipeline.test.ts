/**
 * Embedding pipeline: triggers enqueue jobs into pgmq when embeddable text
 * changes on contacts/assets. This test verifies the enqueue path; the
 * worker (embed-batch Edge Function) is exercised separately in Phase 3.
 *
 * We count messages scoped to the test user via embedding_queue_depth_for_user
 * so prior test state doesn't pollute our deltas.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { testUserHarness, seedFactory, type TestUser } from '@reknowable/test-utils';

const adminSupabase = createClient(
  process.env.SUPABASE_TEST_URL!,
  process.env.SUPABASE_TEST_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function queueDepthFor(userId: string): Promise<number> {
  const { data, error } = await adminSupabase.rpc('embedding_queue_depth_for_user', {
    p_user_id: userId,
  });
  if (error) throw new Error(`queueDepthFor failed: ${error.message}`);
  return Number(data);
}

describe('embedding pipeline triggers', () => {
  let alice: TestUser;

  beforeEach(async () => {
    alice = await testUserHarness('embed');
  });

  afterEach(async () => {
    await alice.cleanup();
  });

  it('INSERT into contacts enqueues an embedding job', async () => {
    expect(await queueDepthFor(alice.userId)).toBe(0);
    await seedFactory.contact(alice.supabase, { name: 'Anna', notes: 'hardware engineer' });
    expect(await queueDepthFor(alice.userId)).toBe(1);
  });

  it('INSERT into assets enqueues an embedding job', async () => {
    expect(await queueDepthFor(alice.userId)).toBe(0);
    await seedFactory.asset(alice.supabase, { name: 'Studio', description: 'podcast space' });
    expect(await queueDepthFor(alice.userId)).toBe(1);
  });

  it('UPDATE that changes notes enqueues another job', async () => {
    const { id } = await seedFactory.contact(alice.supabase, { name: 'Anna' });
    expect(await queueDepthFor(alice.userId)).toBe(1);

    const { error } = await alice.supabase
      .from('contacts')
      .update({ notes: 'new content' })
      .eq('id', id);
    expect(error).toBeNull();
    expect(await queueDepthFor(alice.userId)).toBe(2);
  });

  it('UPDATE that touches non-embeddable fields does NOT enqueue', async () => {
    const { id } = await seedFactory.contact(alice.supabase, { name: 'Anna', warmth: 3 });
    const baseline = await queueDepthFor(alice.userId);

    const { error } = await alice.supabase.from('contacts').update({ warmth: 1 }).eq('id', id);
    expect(error).toBeNull();
    expect(await queueDepthFor(alice.userId)).toBe(baseline);
  });

  it('UPDATE that changes tags enqueues a job (tags are embedded)', async () => {
    const { id } = await seedFactory.contact(alice.supabase, { tags: [] });
    const baseline = await queueDepthFor(alice.userId);

    const { error } = await alice.supabase
      .from('contacts')
      .update({ tags: ['hardware', 'göteborg'] })
      .eq('id', id);
    expect(error).toBeNull();
    expect(await queueDepthFor(alice.userId)).toBe(baseline + 1);
  });
});
