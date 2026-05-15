/**
 * seedFactory — factories for inserting realistic test rows.
 *
 * Always go through a user's signed-in client so RLS is exercised:
 *   await seedFactory.contact(testUser.supabase, { warmth: 1, name: 'Anna' })
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type ContactOverrides = {
  name?: string;
  warmth?: number;
  city?: string;
  tags?: string[];
  notes?: string;
};

export type AssetOverrides = {
  name?: string;
  description?: string;
  tags?: string[];
  availability?: string;
  contact_id?: string;
};

let seq = 0;
const next = (): number => ++seq;

export const seedFactory = {
  async contact(
    supabase: SupabaseClient,
    overrides: ContactOverrides = {},
  ): Promise<{ id: string }> {
    const i = next();
    const { data, error } = await supabase
      .from('contacts')
      .insert({
        name: overrides.name ?? `Test Contact ${i}`,
        warmth: overrides.warmth ?? 3,
        city: overrides.city ?? null,
        tags: overrides.tags ?? [],
        notes: overrides.notes ?? '',
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`seedFactory.contact failed: ${error?.message}`);
    return { id: data.id };
  },

  async asset(supabase: SupabaseClient, overrides: AssetOverrides = {}): Promise<{ id: string }> {
    const i = next();
    const { data, error } = await supabase
      .from('assets')
      .insert({
        name: overrides.name ?? `Test Asset ${i}`,
        description: overrides.description ?? '',
        tags: overrides.tags ?? [],
        availability: overrides.availability ?? null,
        contact_id: overrides.contact_id ?? null,
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`seedFactory.asset failed: ${error?.message}`);
    return { id: data.id };
  },

  async thread(
    supabase: SupabaseClient,
    overrides: { title?: string } = {},
  ): Promise<{ id: string }> {
    const i = next();
    const { data, error } = await supabase
      .from('chat_threads')
      .insert({ title: overrides.title ?? `Thread ${i}` })
      .select('id')
      .single();
    if (error || !data) throw new Error(`seedFactory.thread failed: ${error?.message}`);
    return { id: data.id };
  },
};
