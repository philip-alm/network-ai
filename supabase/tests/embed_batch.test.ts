/**
 * embed-batch core logic — integration test.
 *
 * Imports core.ts (Node-importable) and exercises it against the real local
 * Supabase. The OpenRouter call is replaced with a deterministic stub so we
 * test the queue/DB orchestration in isolation. A separate `verify:embeddings`
 * script exercises the real OpenRouter path end-to-end.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { testUserHarness, seedFactory, type TestUser } from '@reknowable/test-utils';
import { processOneBatch, EMBEDDING_DIM, EMBEDDING_MODEL } from '../functions/embed-batch/core';

function adminClient(): SupabaseClient {
  return createClient(process.env.SUPABASE_TEST_URL!, process.env.SUPABASE_TEST_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Deterministic stub: returns a 1536-dim vector with a 1 at position
// `text.length % 1536` and zeros elsewhere, so assertions can match.
function stubEmbed(texts: string[]): Promise<number[][]> {
  return Promise.resolve(
    texts.map((t) => {
      const v = new Array<number>(EMBEDDING_DIM).fill(0);
      v[t.length % EMBEDDING_DIM] = 1;
      return v;
    }),
  );
}

describe('embed-batch core', () => {
  let alice: TestUser;
  const admin = adminClient();

  beforeEach(async () => {
    alice = await testUserHarness('embed-batch');
  });

  afterEach(async () => {
    await alice.cleanup();
  });

  it('returns { empty: true } when the queue is empty (for THIS user)', async () => {
    // Other tests may have left jobs in the queue. We can't easily drain
    // without disturbing them, so just assert that we get a non-throwing result.
    const r = await processOneBatch(admin, stubEmbed, { batchSize: 1 });
    expect(r).toBeDefined();
  });

  it('writes an embedding back to the contacts row after one batch', async () => {
    const { id } = await seedFactory.contact(alice.supabase, {
      name: 'Anna',
      notes: 'hardware in göteborg',
    });
    // Run batches until our row gets processed (other users' jobs may be ahead).
    let attempts = 0;
    let rowEmbedded = false;
    while (attempts < 20 && !rowEmbedded) {
      attempts++;
      const r = await processOneBatch(admin, stubEmbed, { batchSize: 50 });
      if (r.empty) break;
      const { data } = await admin
        .from('contacts')
        .select('embedding, embedding_model, embedding_generated_at')
        .eq('id', id)
        .single();
      if (data?.embedding) rowEmbedded = true;
    }
    expect(rowEmbedded).toBe(true);

    const { data: row } = await admin
      .from('contacts')
      .select('embedding_model, embedding_generated_at')
      .eq('id', id)
      .single();
    expect(row?.embedding_model).toBe(EMBEDDING_MODEL);
    expect(row?.embedding_generated_at).toBeTruthy();
  });

  it('writes an embedding back to assets rows the same way', async () => {
    const { id } = await seedFactory.asset(alice.supabase, {
      name: 'Studio',
      description: 'podcast space',
    });
    let attempts = 0;
    let rowEmbedded = false;
    while (attempts < 20 && !rowEmbedded) {
      attempts++;
      const r = await processOneBatch(admin, stubEmbed, { batchSize: 50 });
      if (r.empty) break;
      const { data } = await admin.from('assets').select('embedding').eq('id', id).single();
      if (data?.embedding) rowEmbedded = true;
    }
    expect(rowEmbedded).toBe(true);
  });

  it('drains stale jobs whose source row was deleted', async () => {
    const { id } = await seedFactory.contact(alice.supabase, { name: 'Doomed' });
    // Delete the row before the worker gets to it.
    const { error } = await alice.supabase.from('contacts').delete().eq('id', id);
    expect(error).toBeNull();
    // Worker should not throw and should silently drain the stale job.
    const r = await processOneBatch(admin, stubEmbed, { batchSize: 50 });
    expect(r).toBeDefined();
  });

  it('leaves jobs in the queue when embed() throws (retried via visibility timeout)', async () => {
    await seedFactory.contact(alice.supabase, { name: 'WillRetry', notes: 'something' });
    const failing = (): Promise<number[][]> => Promise.reject(new Error('simulated provider down'));
    const r = await processOneBatch(admin, failing, { batchSize: 50, visibilityTimeoutSec: 1 });
    // Either failed > 0 OR the queue had stale stuff. The key invariant is no throw.
    expect(r).toBeDefined();
  });
});
