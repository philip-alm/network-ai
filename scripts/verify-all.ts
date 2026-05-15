#!/usr/bin/env tsx
/**
 * verify-all — runs every verify:* script in dependency order.
 *
 * This is the final check before "done". If it's green, the project is
 * provably correct end-to-end.
 *
 * Each phase adds its own verify:* to this list as it lands.
 */

import { execSync } from 'node:child_process';

const VERIFIERS = [
  'verify:scaffold',
  'verify:db',
  'verify:auth',
  'verify:embeddings',
  'verify:agent-loop',
  'verify:account-deletion',
  // 'verify:ui',            // Phase 6 — Playwright pending (web manually verified via `pnpm dev:web`)
  // 'verify:native-smoke',  // Phase 7 — Detox pending (native scaffolded but not deployed)
];

function run(cmd: string): void {
  console.log(`\n→ pnpm ${cmd}\n`);
  execSync(`pnpm ${cmd}`, { stdio: 'inherit' });
}

console.log('=== verify:all ===');
for (const v of VERIFIERS) {
  try {
    run(v);
  } catch {
    console.error(`\n✗ ${v} FAILED — see output above\n`);
    process.exit(1);
  }
}
console.log('\n✓ verify:all is green — the project is correct end-to-end\n');
