#!/usr/bin/env tsx
/**
 * verify-scaffold — proves the monorepo skeleton is intact.
 *
 * Asserts (in order):
 *   1. pnpm-lock.yaml exists (deps installed)
 *   2. `pnpm check` is green across the workspace (typecheck + lint)
 *   3. `pnpm test` is green across the workspace
 *   4. `next build` succeeds for apps/web (shared package imports resolve)
 *
 * Exit 0 = green. Any non-zero = red, with the failing step printed.
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname ?? __dirname, '..');

type Step = { name: string; run: () => void };

function run(cmd: string, cwd = ROOT): void {
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function check(label: string, fn: () => boolean | void, errorHint?: string): void {
  process.stdout.write(`[verify:scaffold] ${label} ... `);
  try {
    const ok = fn() ?? true;
    if (!ok) throw new Error(errorHint ?? 'check returned false');
    process.stdout.write('OK\n');
  } catch (err) {
    process.stdout.write('FAIL\n');
    if (err instanceof Error) console.error(err.message);
    if (errorHint) console.error('hint:', errorHint);
    process.exit(1);
  }
}

const steps: Step[] = [
  {
    name: 'lockfile present',
    run: () =>
      check(
        'pnpm-lock.yaml exists',
        () => existsSync(join(ROOT, 'pnpm-lock.yaml')),
        'Run `pnpm install` at the workspace root.',
      ),
  },
  {
    name: 'workspace check (typecheck + lint)',
    run: () =>
      check('pnpm check', () => {
        run('pnpm check');
      }),
  },
  {
    name: 'workspace tests',
    run: () =>
      check('pnpm test', () => {
        run('pnpm test');
      }),
  },
  {
    name: 'web build',
    run: () =>
      check('apps/web build', () => {
        run('pnpm -F @reknowable/web build');
      }),
  },
];

console.log('\n=== verify:scaffold ===\n');
for (const step of steps) step.run();
console.log('\n✓ scaffold is green\n');
