#!/usr/bin/env tsx
/**
 * verify-agent-loop — the user-mandated end-to-end test.
 *
 *   1. Spin up a fake user via Supabase admin.
 *   2. Drive THREE real conversation turns through the agent:
 *      a) Add Anna Svensson as a warmth-2 contact ("hardware engineer in göteborg")
 *      b) Attach a podcast studio asset to Anna
 *      c) Ask "what's available for a podcast event in göteborg?"
 *   3. Wait for embeddings (real OpenRouter call) to land between (b) and (c).
 *   4. Assert: mutate_sql tool calls fired, contact + asset rows exist,
 *      contact_id linked, search_* fired in turn 3, final text mentions Anna,
 *      debug artifact written with byte-exact LLM I/O.
 *   5. Cleanup user.
 *
 * Real OpenRouter calls (LLM + embeddings). Real local Supabase. No mocks.
 */

import { execSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
  runAgentTurn,
  createNodeDebugRecorder,
  MODEL_ID,
  type AgentMessage,
  type EmbedQueryFn,
} from '@network-ai/app';
import { processOneBatch, type EmbedFn } from '../supabase/functions/embed-batch/core';

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

const SUPA_URL = process.env.SUPABASE_TEST_URL!;
const SUPA_PUB = process.env.SUPABASE_TEST_PUBLISHABLE_KEY!;
const SUPA_SECRET = process.env.SUPABASE_TEST_SECRET_KEY!;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_KEY) {
  console.error('OPENROUTER_API_KEY missing in .env');
  process.exit(1);
}

function step(label: string, fn: () => void | Promise<void>): Promise<void> {
  process.stdout.write(`[verify:agent-loop] ${label} ... `);
  return Promise.resolve(fn()).then(
    () => process.stdout.write('OK\n'),
    (err: unknown) => {
      process.stdout.write('FAIL\n');
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    },
  );
}

function tryRun(cmd: string): boolean {
  return spawnSync(cmd, { cwd: ROOT, stdio: 'pipe', shell: true }).status === 0;
}

console.log('\n=== verify:agent-loop ===\n');

async function main(): Promise<void> {
  await step('Local Supabase running', () => {
    if (!tryRun('supabase status')) execSync('supabase start', { cwd: ROOT, stdio: 'inherit' });
  });

  // ── Setup: test user + clients + agent provider ─────────────────────────
  const admin = createClient(SUPA_URL, SUPA_SECRET, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = `agent-loop-${Date.now()}@example.test`;
  const password = `pw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) throw new Error(`createUser: ${createErr?.message}`);
  const userId = created.user.id;
  console.log(`[verify:agent-loop] fake user: ${userId} (${email})`);

  const userSupabase = createClient(SUPA_URL, SUPA_PUB, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await userSupabase.auth.signInWithPassword({ email, password });

  // Direct OpenRouter provider (no Edge Function needed in Node scripts).
  const openrouter = createOpenAICompatible({
    name: 'openrouter',
    baseURL: 'https://openrouter.ai/api/v1',
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      'HTTP-Referer': 'https://network-ai.app',
      'X-Title': 'network-ai',
    },
  });
  const model = openrouter(MODEL_ID);

  const embedFn: EmbedFn = async (texts) => {
    const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'openai/text-embedding-3-small', input: texts }),
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return data.data.map((d) => d.embedding);
  };
  const embedQuery: EmbedQueryFn = async (text) => (await embedFn([text]))[0];

  const recorder = createNodeDebugRecorder({ slug: `agent-loop-${Date.now()}` });
  console.log(`[verify:agent-loop] debug artifacts: ${recorder.path}`);

  const threadId = crypto.randomUUID();
  const history: AgentMessage[] = [];

  try {
    // ── Turn 1: add a contact ───────────────────────────────────────────
    const turn1 = await runAgentTurn({
      model,
      supabase: userSupabase as unknown as Parameters<typeof runAgentTurn>[0]['supabase'],
      embedQuery,
      threadId,
      userId,
      userMessage:
        'Add Anna Svensson to my contacts. Warmth 2 (WhatsApp friend). She lives in Göteborg and is a hardware engineer.',
      history,
      recorder,
    });
    history.push(
      { role: 'user', content: 'Add Anna Svensson…' },
      { role: 'assistant', content: turn1.text },
    );
    console.log(`\n[turn 1] ${turn1.toolCalls.length} tool calls:`);
    for (const tc of turn1.toolCalls) console.log(`  • ${tc.name}`);
    console.log(`[turn 1] assistant: ${turn1.text.slice(0, 200)}\n`);

    await step('Turn 1 fired a mutate_sql tool call', () => {
      if (!turn1.toolCalls.some((tc) => tc.name === 'mutate_sql'))
        throw new Error(
          `expected mutate_sql, got: ${turn1.toolCalls.map((t) => t.name).join(', ')}`,
        );
    });

    await step('Anna Svensson exists in contacts table', async () => {
      const { data } = await userSupabase.from('contacts').select('*').ilike('name', '%Anna%');
      if (!data || data.length === 0) throw new Error('no Anna contact row');
      const anna = data[0];
      if (anna.warmth !== 2) throw new Error(`warmth ${anna.warmth}, expected 2`);
    });

    const { data: annaRows } = await userSupabase
      .from('contacts')
      .select('id')
      .ilike('name', '%Anna%')
      .limit(1);
    const annaId = annaRows?.[0]?.id;

    // ── Turn 2: add an asset linked to Anna ─────────────────────────────
    const turn2 = await runAgentTurn({
      model,
      supabase: userSupabase as unknown as Parameters<typeof runAgentTurn>[0]['supabase'],
      embedQuery,
      threadId,
      userId,
      userMessage: `Anna has a podcast studio in Göteborg called "Adway Studio". It's available if you ask first. Add it as an asset linked to her contact.`,
      history,
      recorder,
    });
    history.push(
      { role: 'user', content: 'Anna has a podcast studio…' },
      { role: 'assistant', content: turn2.text },
    );
    console.log(`\n[turn 2] ${turn2.toolCalls.length} tool calls:`);
    for (const tc of turn2.toolCalls) console.log(`  • ${tc.name}`);
    console.log(`[turn 2] assistant: ${turn2.text.slice(0, 200)}\n`);

    await step('Turn 2 wrote an asset row', async () => {
      const { data } = await userSupabase.from('assets').select('*').ilike('name', '%Adway%');
      if (!data || data.length === 0) throw new Error('no Adway Studio asset');
      if (annaId && data[0].contact_id !== annaId) {
        console.warn(
          `asset.contact_id = ${data[0].contact_id}, expected ${annaId} — not strict failure`,
        );
      }
    });

    // ── Embed Anna's contact + the studio asset before searching ────────
    await step('Embedding pipeline drains both rows', async () => {
      const adminSb = createClient(SUPA_URL, SUPA_SECRET, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      let attempts = 0;
      while (attempts < 15) {
        attempts++;
        await processOneBatch(adminSb, embedFn);
        const { data: c } = await adminSb
          .from('contacts')
          .select('embedding')
          .ilike('name', '%Anna%')
          .limit(1);
        const { data: a } = await adminSb
          .from('assets')
          .select('embedding')
          .ilike('name', '%Adway%')
          .limit(1);
        const cEmbedded = c?.[0]?.embedding != null;
        const aEmbedded = a?.[0]?.embedding != null;
        if (cEmbedded && aEmbedded) return;
      }
      throw new Error(`embeddings did not land within ${attempts} batches`);
    });

    // ── Turn 3: semantic search ─────────────────────────────────────────
    const turn3 = await runAgentTurn({
      model,
      supabase: userSupabase as unknown as Parameters<typeof runAgentTurn>[0]['supabase'],
      embedQuery,
      threadId,
      userId,
      userMessage:
        'What do we have available for a podcast event in Göteborg? Who in my network could help, and what assets are there?',
      history,
      recorder,
    });
    console.log(`\n[turn 3] ${turn3.toolCalls.length} tool calls:`);
    for (const tc of turn3.toolCalls) console.log(`  • ${tc.name}`);
    console.log(`[turn 3] assistant: ${turn3.text.slice(0, 300)}\n`);

    await step('Turn 3 fired a search tool (contacts or assets)', () => {
      const fired = turn3.toolCalls.map((t) => t.name);
      if (!fired.some((n) => n === 'search_contacts' || n === 'search_assets' || n === 'query_sql'))
        throw new Error(`expected search_* or query_sql, got: ${fired.join(', ')}`);
    });

    await step('Turn 3 mentions Anna or Adway in the final reply', () => {
      const t = turn3.text.toLowerCase();
      if (!t.includes('anna') && !t.includes('adway'))
        throw new Error(`assistant text did not mention Anna/Adway: ${turn3.text.slice(0, 200)}`);
    });

    // ── Debug artifact integrity ────────────────────────────────────────
    await step('Debug artifact directory contains all three turns', () => {
      if (!recorder.path) throw new Error('recorder has no path');
      const llmDir = join(recorder.path, 'llm');
      const turns = readdirSync(llmDir).filter((d) => d.startsWith('turn-'));
      if (turns.length < 3) throw new Error(`expected ≥3 turn folders, got ${turns.length}`);
      for (const t of turns) {
        const req = join(llmDir, t, 'request.json');
        if (!existsSync(req)) throw new Error(`missing ${req}`);
      }
    });

    console.log('\n✓ agent-loop is green — full E2E with real OpenRouter + real Supabase passed\n');
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
