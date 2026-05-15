/**
 * hybrid_search_contacts / hybrid_search_assets: RRF over FTS + pgvector.
 *
 * For embeddings: we pass a hand-crafted vector for deterministic ordering.
 * The 1536-dim vector is mostly zeros with a single 1 at a chosen position
 * so cosine distance is predictable.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testUserHarness, seedFactory, type TestUser } from '@network-ai/test-utils';

const DIM = 1536;

function unitVector(position: number): string {
  // Halfvec accepts the standard pgvector text format: [v1,v2,...].
  const arr = new Array<number>(DIM).fill(0);
  arr[position] = 1;
  return `[${arr.join(',')}]`;
}

async function setEmbedding(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  table: 'contacts' | 'assets',
  id: string,
  vector: string,
): Promise<void> {
  const { error } = await supabase
    .from(table)
    .update({
      embedding: vector,
      embedding_model: 'test',
      embedding_generated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(`setEmbedding failed: ${error.message}`);
}

describe('hybrid_search_contacts', () => {
  let alice: TestUser;

  beforeEach(async () => {
    alice = await testUserHarness('search');
  });

  afterEach(async () => {
    await alice.cleanup();
  });

  it('returns FTS-matching contacts when no embeddings exist yet', async () => {
    await seedFactory.contact(alice.supabase, {
      name: 'Anna',
      notes: 'lives in göteborg, does hardware',
    });
    await seedFactory.contact(alice.supabase, { name: 'Bo', notes: 'software in stockholm' });

    const { data, error } = await alice.supabase.rpc('hybrid_search_contacts', {
      query_text: 'göteborg hardware',
      query_embedding: unitVector(0),
      match_count: 10,
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.name).toBe('Anna');
  });

  it('combines FTS + semantic via RRF: a semantic-only match still surfaces', async () => {
    const c1 = await seedFactory.contact(alice.supabase, {
      name: 'Anna',
      notes: 'hardware in göteborg',
    });
    const c2 = await seedFactory.contact(alice.supabase, { name: 'Bo', notes: 'unrelated text' });

    await setEmbedding(alice.supabase, 'contacts', c1.id, unitVector(0));
    await setEmbedding(alice.supabase, 'contacts', c2.id, unitVector(5));

    const { data, error } = await alice.supabase.rpc('hybrid_search_contacts', {
      query_text: 'nothing matches by keywords here',
      query_embedding: unitVector(0),
      match_count: 10,
    });
    expect(error).toBeNull();
    // Semantic match on c1 (vec at position 0 matches the query vec at position 0).
    expect(data?.[0]?.id).toBe(c1.id);
  });

  it('applies min_warmth filter inside both CTEs', async () => {
    const c1 = await seedFactory.contact(alice.supabase, {
      name: 'Anna',
      warmth: 1,
      notes: 'great',
    });
    await seedFactory.contact(alice.supabase, { name: 'Cold', warmth: 5, notes: 'great too' });

    await setEmbedding(alice.supabase, 'contacts', c1.id, unitVector(0));

    const { data, error } = await alice.supabase.rpc('hybrid_search_contacts', {
      query_text: 'great',
      query_embedding: unitVector(0),
      match_count: 10,
      min_warmth: 2,
    });
    expect(error).toBeNull();
    expect(data?.map((r: { name: string }) => r.name)).toEqual(['Anna']);
  });

  it('applies required_tags filter', async () => {
    await seedFactory.contact(alice.supabase, {
      name: 'Tagged',
      tags: ['founder', 'sweden'],
      notes: 'pitch deck',
    });
    await seedFactory.contact(alice.supabase, {
      name: 'NotTagged',
      tags: ['employee'],
      notes: 'pitch deck',
    });

    const { data, error } = await alice.supabase.rpc('hybrid_search_contacts', {
      query_text: 'pitch',
      query_embedding: unitVector(0),
      match_count: 10,
      required_tags: ['founder'],
    });
    expect(error).toBeNull();
    expect(data?.map((r: { name: string }) => r.name)).toEqual(['Tagged']);
  });

  it("RLS-scopes: other users' rows are invisible", async () => {
    const bob = await testUserHarness('search-bob');
    try {
      await seedFactory.contact(bob.supabase, { name: 'Bob-only', notes: 'pitch deck' });

      const { data, error } = await alice.supabase.rpc('hybrid_search_contacts', {
        query_text: 'pitch',
        query_embedding: unitVector(0),
        match_count: 10,
      });
      expect(error).toBeNull();
      expect(data).toEqual([]);
    } finally {
      await bob.cleanup();
    }
  });
});

describe('hybrid_search_assets', () => {
  let alice: TestUser;

  beforeEach(async () => {
    alice = await testUserHarness('search-assets');
  });

  afterEach(async () => {
    await alice.cleanup();
  });

  it('returns FTS matches over name + description + availability + tags', async () => {
    await seedFactory.asset(alice.supabase, {
      name: 'Studio',
      description: 'Podcast recording space, soundproofed',
      availability: 'ask first',
    });
    await seedFactory.asset(alice.supabase, { name: 'Camera', description: 'old DSLR' });

    const { data, error } = await alice.supabase.rpc('hybrid_search_assets', {
      query_text: 'podcast',
      query_embedding: unitVector(0),
      match_count: 10,
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.name).toBe('Studio');
  });
});
