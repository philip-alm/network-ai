/**
 * browserEmbedQuery — calls the embed-query Edge Function so the OpenRouter
 * API key never reaches the browser. Used by the search_* tools when running
 * in a browser/native client.
 *
 * Returns the 1536-dim vector for a single text input.
 */

import { getBrowserSupabase } from '../supabase';
import { env } from '../env';
import type { EmbedQueryFn } from './tools';

export const browserEmbedQuery: EmbedQueryFn = async (text) => {
  const session = (await getBrowserSupabase().auth.getSession()).data.session;
  if (!session) throw new Error('embed-query: not signed in');

  const res = await fetch(`${env.supabaseUrl}/functions/v1/embed-query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw new Error(`embed-query failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { embedding: number[] };
  return data.embedding;
};
