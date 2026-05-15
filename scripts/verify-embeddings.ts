#!/usr/bin/env tsx
/**
 * verify-embeddings — proves the real OpenRouter embedding path works end-to-end.
 *
 *   1. Boots local Supabase if needed.
 *   2. Creates a fresh test user.
 *   3. Inserts a contact → trigger enqueues a job in pgmq.
 *   4. Calls processOneBatch with the REAL OpenRouter embed function.
 *   5. Polls until the row has an embedding.
 *   6. Asserts: dim = 1536, model = 'openai/text-embedding-3-small'.
 *   7. Cleans up.
 *
 * Requires OPENROUTER_API_KEY in env (.env).
 */

import { execSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import {
  processOneBatch,
  EMBEDDING_MODEL,
  EMBEDDING_DIM,
  type EmbedFn,
} from '../supabase/functions/embed-batch/core';

const ROOT = join(import.meta.dirname ?? __dirname, '..');

function loadDotEnv(file: string): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

loadDotEnv(join(ROOT, '.env.test'));
loadDotEnv(join(ROOT, '.env'));

const SUPA_URL = process.env.SUPABASE_TEST_URL ?? 'http://127.0.0.1:54321';
const SUPA_SECRET = process.env.SUPABASE_TEST_SECRET_KEY!;
const SUPA_PUB = process.env.SUPABASE_TEST_PUBLISHABLE_KEY!;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_KEY) {
  console.error('[verify:embeddings] OPENROUTER_API_KEY missing — set it in .env');
  process.exit(1);
}

function step(label: string, fn: () => void): void {
  process.stdout.write(`[verify:embeddings] ${label} ... `);
  try {
    fn();
    process.stdout.write('OK\n');
  } catch (err) {
    process.stdout.write('FAIL\n');
    if (err instanceof Error) console.error(err.message);
    process.exit(1);
  }
}

function tryRun(cmd: string): boolean {
  return spawnSync(cmd, { cwd: ROOT, stdio: 'pipe', shell: true }).status === 0;
}

console.log('\n=== verify:embeddings ===\n');

step('Local Supabase running', () => {
  if (!tryRun('supabase status')) execSync('supabase start', { cwd: ROOT, stdio: 'inherit' });
});

async function main(): Promise<void> {
  const admin = createClient(SUPA_URL, SUPA_SECRET, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Create a test user via admin API.
  const email = `embed-real-${Date.now()}@example.test`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: 'pw-' + Date.now(),
    email_confirm: true,
  });
  if (createErr || !created.user) throw new Error(`createUser: ${createErr?.message}`);
  const userId = created.user.id;
  console.log(`[verify:embeddings] test user: ${userId} (${email})`);

  try {
    // Sign in as the user to insert through RLS.
    const userClient = createClient(SUPA_URL, SUPA_PUB, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await userClient.auth.signInWithPassword({ email, password: 'pw-' + Date.now() });
    // Actually use password used above:
    const password = `verify-pw-${userId}`;
    await admin.auth.admin.updateUserById(userId, { password });
    await userClient.auth.signInWithPassword({ email, password });

    const { data: inserted, error: insErr } = await userClient
      .from('contacts')
      .insert({
        name: 'Anna Embed',
        notes: 'Hardware engineer in Göteborg, podcast enthusiast',
        warmth: 2,
      })
      .select('id')
      .single();
    if (insErr || !inserted) throw new Error(`insert contact: ${insErr?.message}`);
    const contactId = inserted.id;
    console.log(`[verify:embeddings] inserted contact ${contactId}`);

    // Run processOneBatch with REAL OpenRouter.
    const embed: EmbedFn = async (texts) => {
      const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENROUTER_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://network-ai.app',
          'X-Title': 'network-ai',
        },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
      });
      if (!res.ok) {
        throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
      return data.data.map((d) => d.embedding);
    };

    // Drain batches up to 20 times until our contact has an embedding.
    let attempts = 0;
    let row: {
      embedding: unknown;
      embedding_model: string | null;
      embedding_generated_at: string | null;
    } | null = null;
    while (attempts < 20) {
      attempts++;
      await processOneBatch(admin, embed, { batchSize: 50 });
      const { data, error } = await admin
        .from('contacts')
        .select('embedding, embedding_model, embedding_generated_at')
        .eq('id', contactId)
        .single();
      if (error) throw new Error(`fetch contact: ${error.message}`);
      if (data?.embedding) {
        row = data;
        break;
      }
    }
    if (!row)
      throw new Error(`contact ${contactId} never got an embedding after ${attempts} attempts`);

    step(`Embedding present after ${attempts} batches`, () => {});
    step('Embedding model matches', () => {
      if (row.embedding_model !== EMBEDDING_MODEL)
        throw new Error(`got model ${row.embedding_model}, expected ${EMBEDDING_MODEL}`);
    });
    step('Embedding has correct dimension', () => {
      // pgvector returns the embedding as a string like "[0.1,0.2,...]"
      const s = row.embedding as string;
      const nums = s.replace(/^\[|\]$/g, '').split(',');
      if (nums.length !== EMBEDDING_DIM)
        throw new Error(`got dim ${nums.length}, expected ${EMBEDDING_DIM}`);
    });
    step('Generated_at is recent', () => {
      const gen = new Date(row.embedding_generated_at!).getTime();
      if (Date.now() - gen > 60_000) throw new Error('embedding_generated_at older than 60s');
    });

    console.log('\n✓ embeddings pipeline is green (real OpenRouter call)\n');
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
