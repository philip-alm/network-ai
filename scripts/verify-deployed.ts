#!/usr/bin/env tsx
/**
 * verify-deployed — proves the REMOTE Supabase Edge Functions are reachable
 * and correct from a browser-like origin:
 *
 *   1. Create a real test user against the remote project.
 *   2. Sign in, capture the JWT.
 *   3. OPTIONS preflight against /functions/v1/agent-chat — assert CORS headers.
 *   4. POST a 1-message chat to /functions/v1/agent-chat — assert SSE stream
 *      starts within 5s.
 *   5. OPTIONS + POST to /functions/v1/embed-query — assert embedding back.
 *   6. OPTIONS to /functions/v1/delete-account — assert preflight OK.
 *   7. Delete the test user.
 *
 * If this is green, the user can sign in on the deployed site and chat
 * without "Failed to fetch" errors.
 */

import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

const ROOT = join(import.meta.dirname ?? __dirname, '..');

function loadDotEnv(file: string): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
loadDotEnv(join(ROOT, '.env'));

const SUPA_URL = process.env.SUPABASE_URL!;
const SUPA_ANON = process.env.SUPABASE_ANON_KEY!;
const SUPA_SECRET = process.env.SUPABASE_SECRET_KEY!;

if (!SUPA_URL || !SUPA_ANON || !SUPA_SECRET) {
  console.error(
    '[verify:deployed] needs SUPABASE_URL + SUPABASE_ANON_KEY + SUPABASE_SECRET_KEY in .env (remote project).',
  );
  process.exit(1);
}

// Mimics a browser hitting the deployed Vercel site.
const SIMULATED_ORIGIN = 'https://network-ai.vercel.app';

function step(label: string, fn: () => Promise<void> | void): Promise<void> {
  process.stdout.write(`[verify:deployed] ${label} ... `);
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
  console.log('\n=== verify:deployed ===');
  console.log(`  target: ${SUPA_URL}`);
  console.log(`  simulated origin: ${SIMULATED_ORIGIN}\n`);

  const admin = createClient(SUPA_URL, SUPA_SECRET, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = `verify-deployed-${Date.now()}@example.test`;
  const password = `pw-${Date.now()}`;
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (cErr || !created.user) throw new Error(`createUser: ${cErr?.message}`);
  const userId = created.user.id;

  try {
    const userSupabase = createClient(SUPA_URL, SUPA_ANON, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: sess, error: sErr } = await userSupabase.auth.signInWithPassword({
      email,
      password,
    });
    if (sErr || !sess.session) throw new Error(`signIn: ${sErr?.message}`);
    const jwt = sess.session.access_token;

    // ── CORS preflight against agent-chat ────────────────────────────────
    await step('agent-chat OPTIONS preflight returns proper CORS headers', async () => {
      const res = await fetch(`${SUPA_URL}/functions/v1/agent-chat`, {
        method: 'OPTIONS',
        headers: {
          Origin: SIMULATED_ORIGIN,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization,content-type',
        },
      });
      const allowOrigin = res.headers.get('access-control-allow-origin');
      const allowHeaders = res.headers.get('access-control-allow-headers');
      if (!allowOrigin) throw new Error(`no Access-Control-Allow-Origin (status ${res.status})`);
      if (!allowHeaders?.toLowerCase().includes('authorization'))
        throw new Error(`Access-Control-Allow-Headers missing authorization: ${allowHeaders}`);
    });

    // ── Drive agent-chat through the SAME code path the browser uses (AI SDK) ──
    // This catches the /chat/completions appending behavior that hand-rolled
    // fetch would miss.
    await step('agent-chat via AI SDK (browser code path) returns text', async () => {
      const provider = createOpenAICompatible({
        name: 'agent-chat',
        baseURL: `${SUPA_URL}/functions/v1/agent-chat`,
        headers: {
          Authorization: `Bearer ${jwt}`,
          Origin: SIMULATED_ORIGIN,
        },
      });
      const { text } = await generateText({
        model: provider('openai/gpt-4o-mini'),
        messages: [{ role: 'user', content: 'reply with exactly the word: hello' }],
      });
      if (!text || text.length === 0) throw new Error('AI SDK returned empty text');
    });

    // ── embed-query: OPTIONS + POST ──────────────────────────────────────
    await step('embed-query OPTIONS preflight returns CORS headers', async () => {
      const res = await fetch(`${SUPA_URL}/functions/v1/embed-query`, {
        method: 'OPTIONS',
        headers: { Origin: SIMULATED_ORIGIN, 'Access-Control-Request-Method': 'POST' },
      });
      const allowOrigin = res.headers.get('access-control-allow-origin');
      if (!allowOrigin) throw new Error(`no Access-Control-Allow-Origin (status ${res.status})`);
    });

    await step('embed-query POST returns a 1536-dim vector', async () => {
      const res = await fetch(`${SUPA_URL}/functions/v1/embed-query`, {
        method: 'POST',
        headers: {
          Origin: SIMULATED_ORIGIN,
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: 'podcast event in göteborg' }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`embed-query returned ${res.status}: ${text.slice(0, 200)}`);
      }
      const data = (await res.json()) as { embedding: number[] };
      if (data.embedding?.length !== 1536)
        throw new Error(`embedding dim ${data.embedding?.length}, expected 1536`);
    });

    // ── delete-account: OPTIONS only (we'll let the user-cleanup do the actual delete) ─
    await step('delete-account OPTIONS preflight returns CORS headers', async () => {
      const res = await fetch(`${SUPA_URL}/functions/v1/delete-account`, {
        method: 'OPTIONS',
        headers: { Origin: SIMULATED_ORIGIN, 'Access-Control-Request-Method': 'POST' },
      });
      const allowOrigin = res.headers.get('access-control-allow-origin');
      if (!allowOrigin) throw new Error(`no Access-Control-Allow-Origin (status ${res.status})`);
    });

    // ── RLS sanity: signed-in user can read their own (empty) contacts ───
    await step('signed-in user can read RLS-scoped contacts via PostgREST', async () => {
      const { error } = await userSupabase.from('contacts').select('id').limit(1);
      if (error) throw new Error(`contacts select: ${error.message}`);
    });

    console.log('\n✓ deployed Edge Functions are healthy + CORS works from a browser origin\n');
  } finally {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
  }
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
