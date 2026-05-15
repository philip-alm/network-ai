#!/usr/bin/env tsx
/**
 * verify:browser — drives the REAL user flow through a real Chromium against
 * a fully-local stack (Supabase + Edge Functions served + Next.js).
 *
 * If this is green, the deployed Vercel version will work too — the only
 * difference is where the Supabase URL points.
 *
 *   1. Boot local Supabase (if not running).
 *   2. Start `supabase functions serve` with OPENROUTER_API_KEY (background).
 *   3. Start `next dev` in apps/web (background), pointed at LOCAL Supabase.
 *   4. Wait for both to be reachable.
 *   5. Run Playwright golden-path.spec.ts.
 *   6. Tear everything down cleanly.
 *   7. Print the Playwright report path + the unified log path.
 */

import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { createWriteStream, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname ?? __dirname, '..');

function loadDotEnv(file: string): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
loadDotEnv(join(ROOT, '.env'));
loadDotEnv(join(ROOT, '.env.test'));

const ts = new Date().toISOString().replace(/[:.]/g, '-');
const debugDir = join(homedir(), 'Documents', 'network-ai-debug', `browser-${ts}`);
mkdirSync(debugDir, { recursive: true });
const allLogPath = join(debugDir, 'all.log');
const allLog = createWriteStream(allLogPath, { flags: 'a' });

console.log(`\n=== verify:browser ===`);
console.log(`  logs: ${allLogPath}\n`);

function fanout(child: ChildProcess, layer: string): void {
  const prefix = `[${layer}]`;
  const write = (chunk: Buffer) => {
    const text = chunk.toString();
    for (const line of text.split('\n')) {
      if (!line) continue;
      allLog.write(`${new Date().toISOString()} ${prefix} ${line}\n`);
    }
  };
  child.stdout?.on('data', write);
  child.stderr?.on('data', write);
}

async function waitForUrl(url: string, timeoutMs: number, label: string): Promise<void> {
  const t0 = Date.now();
  let lastErr: unknown = null;
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) {
        console.log(`[verify:browser] ${label} ready (HTTP ${res.status})`);
        return;
      }
      lastErr = `HTTP ${res.status}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label} did not respond at ${url} within ${timeoutMs}ms (last: ${lastErr})`);
}

async function main(): Promise<void> {
  // 0. Docker reachable?
  try {
    execSync('docker info', { stdio: 'pipe' });
  } catch {
    console.error(
      '\n[verify:browser] Docker daemon is not reachable. Open Docker Desktop,\n' +
        '         wait until the menu-bar whale icon is steady, then re-run.\n',
    );
    process.exit(1);
  }

  // 1. Local Supabase.
  try {
    execSync('supabase status', { cwd: ROOT, stdio: 'pipe' });
    console.log('[verify:browser] local Supabase already running');
  } catch {
    console.log('[verify:browser] starting local Supabase ...');
    try {
      execSync('supabase start', { cwd: ROOT, stdio: 'inherit' });
    } catch {
      console.error(
        '\n[verify:browser] `supabase start` failed. See the lines above for the cause.\n',
      );
      process.exit(1);
    }
  }

  // 2. supabase functions serve.
  console.log('[verify:browser] starting supabase functions serve ...');
  const functions = spawn('supabase', ['functions', 'serve', '--env-file', 'supabase/.env'], {
    cwd: ROOT,
    env: process.env,
  });
  fanout(functions, 'functions');

  // 3. Next.js dev.
  console.log('[verify:browser] starting next dev ...');
  const web = spawn('pnpm', ['-F', '@network-ai/web', 'dev'], { cwd: ROOT, env: process.env });
  fanout(web, 'web');

  const cleanup = (): void => {
    functions.kill('SIGTERM');
    web.kill('SIGTERM');
    allLog.end();
  };

  try {
    // 4. Wait for both to come up.
    await waitForUrl('http://127.0.0.1:54321/functions/v1/agent-chat/health', 60_000, 'functions');
    await waitForUrl('http://localhost:3000/sign-in', 90_000, 'web');

    // 5. Run Playwright.
    console.log('\n[verify:browser] running Playwright golden-path.spec.ts ...\n');
    execSync('pnpm -F @network-ai/web exec playwright test golden-path.spec.ts', {
      cwd: ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        FORCE_COLOR: '1',
        // Pass local-Supabase credentials to the Playwright runner so the test
        // can admin-create + clean up its user.
        SUPABASE_TEST_URL: process.env.SUPABASE_TEST_URL ?? 'http://127.0.0.1:54321',
        SUPABASE_TEST_PUBLISHABLE_KEY: process.env.SUPABASE_TEST_PUBLISHABLE_KEY ?? '',
        SUPABASE_TEST_SECRET_KEY: process.env.SUPABASE_TEST_SECRET_KEY ?? '',
      },
    });

    console.log(`\n✓ golden path verified end-to-end in a real browser`);
    console.log(`  unified log: ${allLogPath}\n`);
  } finally {
    cleanup();
    setTimeout(() => process.exit(0), 1500);
  }
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
