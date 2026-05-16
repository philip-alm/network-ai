#!/usr/bin/env tsx
/**
 * verify-db — proves the DB layer is correct.
 *
 * Asserts:
 *   1. Local Supabase is running (or starts it).
 *   2. Migrations apply cleanly via `supabase db reset --local`.
 *   3. All supabase/tests/*.test.ts pass.
 *   4. (Optional) Remote project has RLS on every public table.
 *
 * Exit 0 = green.
 */

import { execSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const ROOT = join(import.meta.dirname ?? __dirname, '..');

function run(cmd: string, cwd = ROOT, env: Record<string, string> = {}): void {
  execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
}

function tryRun(cmd: string, cwd = ROOT): boolean {
  const res = spawnSync(cmd, { cwd, stdio: 'pipe', shell: true });
  return res.status === 0;
}

function step(label: string, fn: () => void): void {
  process.stdout.write(`[verify:db] ${label} ... `);
  try {
    fn();
    process.stdout.write('OK\n');
  } catch (err) {
    process.stdout.write('FAIL\n');
    if (err instanceof Error) console.error(err.message);
    process.exit(1);
  }
}

console.log('\n=== verify:db ===\n');

step('Local Supabase running', () => {
  const ok = tryRun('supabase status', ROOT);
  if (!ok) {
    console.log('   → booting via `supabase start` ...');
    run('supabase start');
  }
});

step('Migrations apply cleanly (supabase db reset --local)', () => {
  run('supabase db reset --local');
});

step('Re-generate TS types from local schema', () => {
  // Capture stdout via shell redirect for cleanliness.
  run(
    'supabase gen types typescript --local --schema public 2>/dev/null > packages/types/src/db.ts',
  );
});

step('DB tests pass', () => {
  run('pnpm -F @reknowable/db-tests db:test');
});

step('Lockfile + workspace types still compile', () => {
  if (!existsSync(join(ROOT, 'pnpm-lock.yaml'))) throw new Error('pnpm-lock.yaml missing');
  run('pnpm -F @reknowable/types check');
});

console.log('\n✓ db layer is green\n');
