#!/usr/bin/env tsx
/**
 * dev:full — single-command local development rig.
 *
 *   1. Ensures local Supabase is running (`supabase start` if not).
 *   2. Starts `supabase functions serve` with supabase/.env loaded.
 *   3. Starts Next.js dev server (apps/web) pointing at LOCAL Supabase.
 *   4. Pipes ALL three streams into ~/Documents/reknowable-debug/dev-<ts>/all.log
 *      with `[layer] [time]` prefixes. The same content also streams to stdout
 *      with color-coded prefixes so you can watch live.
 *
 * Press Ctrl-C to tear all three down cleanly.
 *
 * What you get vs `pnpm dev:web` alone:
 *   - Edge Functions run locally so the browser hits localhost (no CORS skew
 *     between local + remote).
 *   - One log file you can grep: every request flowing through every layer.
 *   - Request IDs end-to-end: browser → Edge Function → upstream.
 */

import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, createWriteStream } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname ?? __dirname, '..');

const ts = new Date().toISOString().replace(/[:.]/g, '-');
const debugDir = join(homedir(), 'Documents', 'reknowable-debug', `dev-${ts}`);
mkdirSync(debugDir, { recursive: true });
const allLog = createWriteStream(join(debugDir, 'all.log'), { flags: 'a' });

console.log(`\n=== dev:full ===`);
console.log(`  logs: ${join(debugDir, 'all.log')}`);
console.log();

const COLORS: Record<string, string> = {
  supabase: '\x1b[36m', // cyan
  functions: '\x1b[35m', // magenta
  web: '\x1b[32m', // green
  reset: '\x1b[0m',
};

function pipe(child: ChildProcess, layer: string): void {
  const color = COLORS[layer] ?? '';
  const reset = COLORS.reset;
  const prefix = `[${layer}]`;
  const onChunk = (chunk: Buffer) => {
    const text = chunk.toString();
    for (const line of text.split('\n')) {
      if (!line) continue;
      const stamped = `${new Date().toISOString()} ${prefix} ${line}`;
      allLog.write(stamped + '\n');
      process.stdout.write(`${color}${prefix}${reset} ${line}\n`);
    }
  };
  child.stdout?.on('data', onChunk);
  child.stderr?.on('data', onChunk);
  child.on('exit', (code) => {
    const msg = `${prefix} exited with code ${code}`;
    allLog.write(`${new Date().toISOString()} ${msg}\n`);
    console.log(`${COLORS.reset}${msg}`);
  });
}

// 0. Sanity-check: Docker is reachable.
try {
  execSync('docker info', { stdio: 'pipe' });
} catch {
  console.error('\n[dev:full] Docker daemon is not reachable.');
  console.error('         Open Docker Desktop, wait until the menu-bar whale icon');
  console.error('         is steady, then re-run `pnpm dev:full`.\n');
  process.exit(1);
}

// 1. Ensure local Supabase is up.
try {
  execSync('supabase status', { cwd: ROOT, stdio: 'pipe' });
  console.log('[dev:full] local Supabase already running');
} catch {
  console.log('[dev:full] starting local Supabase ...');
  try {
    execSync('supabase start', { cwd: ROOT, stdio: 'inherit' });
  } catch {
    console.error('\n[dev:full] `supabase start` failed. See the lines above for the cause.\n');
    process.exit(1);
  }
}

// 2. supabase functions serve — loads supabase/.env automatically.
console.log('[dev:full] starting supabase functions serve ...');
const functions = spawn('supabase', ['functions', 'serve', '--env-file', 'supabase/.env'], {
  cwd: ROOT,
  env: process.env,
});
pipe(functions, 'functions');

// 3. Next.js dev server.
console.log('[dev:full] starting next dev (apps/web) ...');
const web = spawn('pnpm', ['-F', '@reknowable/web', 'dev'], { cwd: ROOT, env: process.env });
pipe(web, 'web');

// Graceful shutdown.
function shutdown(): void {
  console.log('\n[dev:full] shutting down ...');
  functions.kill('SIGTERM');
  web.kill('SIGTERM');
  allLog.end();
  setTimeout(() => process.exit(0), 1500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Keep process alive.
setInterval(() => {}, 60_000);
