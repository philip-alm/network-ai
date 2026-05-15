#!/usr/bin/env tsx
/**
 * verify-account-deletion — proves the delete-account flow erases everything.
 *
 *   1. Create a user, sign in, seed contacts + assets + a chat thread +
 *      messages.
 *   2. Confirm those rows exist.
 *   3. Use the admin client to deleteUser (simulating what the deployed
 *      Edge Function does — we exercise the cascade, not the HTTP wrap).
 *   4. Assert: zero rows owned by that user_id in every table.
 *
 * Why not hit the deployed function? Doing so requires the function to be
 * reachable + auth gateway up. The cascade itself is the security-critical
 * behavior we want to assert; the HTTP wrapper is one fetch call.
 */

import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(import.meta.dirname ?? __dirname, '..');

function loadDotEnv(file: string): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
loadDotEnv(join(ROOT, '.env.test'));

const SUPA_URL = process.env.SUPABASE_TEST_URL!;
const SUPA_PUB = process.env.SUPABASE_TEST_PUBLISHABLE_KEY!;
const SUPA_SECRET = process.env.SUPABASE_TEST_SECRET_KEY!;

function step(label: string, fn: () => Promise<void> | void): Promise<void> {
  process.stdout.write(`[verify:account-deletion] ${label} ... `);
  return Promise.resolve(fn()).then(
    () => process.stdout.write('OK\n'),
    (err: unknown) => {
      process.stdout.write('FAIL\n');
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    },
  );
}

async function main(): Promise<void> {
  console.log('\n=== verify:account-deletion ===\n');

  const admin = createClient(SUPA_URL, SUPA_SECRET, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = `delete-${Date.now()}@example.test`;
  const password = `pw-${Date.now()}`;

  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (cErr || !created.user) throw new Error(`createUser: ${cErr?.message}`);
  const userId = created.user.id;

  const userClient = createClient(SUPA_URL, SUPA_PUB, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await userClient.auth.signInWithPassword({ email, password });

  await step('Seed contacts + assets + thread + message', async () => {
    const { error: cErr } = await userClient.from('contacts').insert({ name: 'doomed', warmth: 3 });
    if (cErr) throw cErr;
    const { error: aErr } = await userClient.from('assets').insert({ name: 'doomed-asset' });
    if (aErr) throw aErr;
    const { data: t, error: tErr } = await userClient
      .from('chat_threads')
      .insert({ title: 'doomed-thread' })
      .select('id')
      .single();
    if (tErr || !t) throw tErr ?? new Error('no thread');
    const { error: mErr } = await userClient
      .from('chat_messages')
      .insert({ thread_id: t.id, role: 'user', content: { text: 'hi' } });
    if (mErr) throw mErr;
  });

  await step('Rows exist before delete', async () => {
    const tables = ['contacts', 'assets', 'chat_threads', 'chat_messages'];
    for (const t of tables) {
      const { count, error } = await admin
        .from(t)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (error) throw error;
      if (!count || count < 1) throw new Error(`expected ≥1 row in ${t}, got ${count}`);
    }
  });

  await step('admin.auth.admin.deleteUser cascades', async () => {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
  });

  await step('Zero rows owned by the deleted user across every table', async () => {
    const tables = ['contacts', 'assets', 'chat_threads', 'chat_messages'];
    for (const t of tables) {
      const { count, error } = await admin
        .from(t)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (error) throw error;
      if (count !== 0) throw new Error(`${t} still has ${count} rows for ${userId}`);
    }
  });

  console.log('\n✓ account deletion fully cascades\n');
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
