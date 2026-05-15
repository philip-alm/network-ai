#!/usr/bin/env tsx
/**
 * verify-auth — proves the auth layer is correct end-to-end.
 *
 * Asserts:
 *   1. Local Supabase is running.
 *   2. Auth integration tests pass (sign-up + sign-in + sign-out + RLS).
 *   3. apps/web builds (the auth routes + middleware compile).
 *   4. @network-ai/app component tests pass (SignInScreen / SignUpScreen).
 *
 * Phase 6 will add Playwright E2E that drives the actual browser flow.
 */

import { execSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname ?? __dirname, '..');

function run(cmd: string, cwd = ROOT): void {
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function tryRun(cmd: string, cwd = ROOT): boolean {
  return spawnSync(cmd, { cwd, stdio: 'pipe', shell: true }).status === 0;
}

function step(label: string, fn: () => void): void {
  process.stdout.write(`[verify:auth] ${label} ... `);
  try {
    fn();
    process.stdout.write('OK\n');
  } catch (err) {
    process.stdout.write('FAIL\n');
    if (err instanceof Error) console.error(err.message);
    process.exit(1);
  }
}

console.log('\n=== verify:auth ===\n');

step('Local Supabase running', () => {
  if (!tryRun('supabase status', ROOT)) run('supabase start');
});

step('Auth integration tests pass', () => {
  // Runs the full DB-tests suite (auth.test.ts plus the rest, all colocated
  // because they share the local-Supabase harness). Fast enough to do this
  // every time.
  run('pnpm -F @network-ai/db-tests db:test');
});

step('@network-ai/app component tests pass', () => {
  run('pnpm -F @network-ai/app test');
});

step('apps/web builds with auth wiring', () => {
  run('pnpm -F @network-ai/web build');
});

console.log('\n✓ auth layer is green\n');
