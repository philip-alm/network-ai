#!/usr/bin/env tsx
/**
 * pnpm last-turn [--failed] [--json] [N]
 *
 * Print a 5-second triage of the most recent browser agent turn (or the
 * most recent FAILURE with --failed). Reads
 * `~/Documents/reknowable-debug/browser-turns/` — written by
 * HttpDebugRecorder via /api/debug/recorder (see
 * packages/app/src/lib/agent/httpDebugRecorder.ts).
 *
 * Output shape (default, human-readable):
 *
 *   • <slug>                          (2026-05-16T10-36-01-abc1)
 *     → "user message verbatim"
 *     started 12:36:01, ended 12:36:04  (3.2s)  outcome: ok
 *     finish_reason: stop · text: 0 chars · tool_calls: 2
 *     last_event: turn ended without text after last tool result (SILENT STOP)
 *     trace: /Users/philip/Documents/reknowable-debug/browser-turns/<slug>/
 *
 * `--json` prints the raw index entry for piping into jq.
 * Optional positional N selects the Nth-most-recent (default 1 = latest).
 */

import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ROOT =
  process.env.REKNOWABLE_DEBUG_ROOT ??
  join(homedir(), 'Documents', 'reknowable-debug', 'browser-turns');
const INDEX_PATH = join(ROOT, 'index.jsonl');

type IndexEntry = {
  slug: string;
  startedAt: string;
  endedAt?: string;
  userMessage?: string;
  threadId?: string;
  userId?: string;
  outcome?: 'ok' | 'error' | 'running';
  detail?: string;
  finishReason?: string;
  textLength?: number;
  toolCallCount?: number;
  durationMs?: number;
};

type TimelineLine = {
  ts: string;
  method: string;
  payload: unknown;
};

function parseArgs(argv: string[]): { failedOnly: boolean; asJson: boolean; nth: number } {
  let failedOnly = false;
  let asJson = false;
  let nth = 1;
  for (const a of argv) {
    if (a === '--failed') failedOnly = true;
    else if (a === '--json') asJson = true;
    else if (/^\d+$/.test(a)) nth = Math.max(1, parseInt(a, 10));
  }
  return { failedOnly, asJson, nth };
}

async function readIndex(): Promise<IndexEntry[]> {
  let raw: string;
  try {
    raw = await fs.readFile(INDEX_PATH, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  // Each turn may have MULTIPLE entries (startTurn, endTurn, llm/finished
  // summary). Latest-wins per slug, but only overwrite fields the latter
  // entry actually has — so startedAt/userMessage from startTurn don't
  // get wiped by a partial summary that omits them.
  const merged = new Map<string, IndexEntry>();
  for (const line of lines) {
    try {
      const e = JSON.parse(line) as IndexEntry;
      if (!e.slug) continue;
      const prior = merged.get(e.slug) ?? { slug: e.slug, startedAt: '' };
      merged.set(e.slug, mergePreservingPrior(prior, e));
    } catch {
      // Skip malformed line — better to print partial data than crash.
    }
  }
  return [...merged.values()];
}

function mergePreservingPrior(a: IndexEntry, b: IndexEntry): IndexEntry {
  const out: IndexEntry = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v !== undefined && v !== null && v !== '') {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

async function readTimeline(slug: string): Promise<TimelineLine[]> {
  const path = join(ROOT, slug, 'timeline.jsonl');
  try {
    const raw = await fs.readFile(path, 'utf8');
    return raw
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as TimelineLine);
  } catch {
    return [];
  }
}

/**
 * Synthesize a one-line summary of how this turn ended — the FIRST place
 * to look when the user says "it broke." Maps the recorded events to a
 * known failure mode where one exists.
 */
function summarizeLastEvent(entry: IndexEntry, timeline: TimelineLine[]): string {
  if (entry.outcome === 'error') {
    return `errored: ${entry.detail ?? '(no detail)'}`;
  }
  if (entry.outcome === 'running') {
    return `still running (no endTurn event recorded — did the page close mid-turn?)`;
  }
  // Look for the final `llm/finished` timeline event to read the segment summary.
  for (let i = timeline.length - 1; i >= 0; i--) {
    const t = timeline[i];
    if (t.method !== 'timeline') continue;
    const p = t.payload as { event?: string; payload?: Record<string, unknown> } | null;
    if (p?.event === 'llm/finished') {
      const summary = p.payload as {
        finish_reason?: string;
        text_length?: number;
        segments_summary?: string[];
      };
      const segs = summary.segments_summary ?? [];
      const last = segs[segs.length - 1];
      const fr = summary.finish_reason ?? 'unknown';
      const textLen = summary.text_length ?? 0;
      if (textLen === 0 && last?.startsWith('tool:')) {
        return `SILENT STOP — finish_reason=${fr}, turn ended after ${last} with no text response`;
      }
      if (textLen === 0 && segs.length === 0) {
        return `EMPTY TURN — finish_reason=${fr}, model produced no output`;
      }
      return `clean exit, finish_reason=${fr}, last segment ${last ?? '(none)'}`;
    }
  }
  return 'no llm/finished event found in timeline';
}

function fmtTime(ts?: string): string {
  if (!ts) return '?';
  try {
    return new Date(ts).toLocaleTimeString('en-GB', { hour12: false });
  } catch {
    return ts;
  }
}

function fmtDuration(ms?: number): string {
  if (ms == null) return '?';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

async function main(): Promise<void> {
  const { failedOnly, asJson, nth } = parseArgs(process.argv.slice(2));
  const entries = await readIndex();
  if (entries.length === 0) {
    console.error(`No browser turns found at ${ROOT}.`);
    console.error(`Make sure NODE_ENV=development and the dev server is running.`);
    process.exit(1);
  }

  // Newest first — entries are written in arrival order, latest at the end.
  const sorted = [...entries].sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
  const filtered = failedOnly
    ? sorted.filter((e) => e.outcome === 'error' || e.outcome === 'running')
    : sorted;

  if (filtered.length === 0) {
    console.error(failedOnly ? 'No failed turns recorded.' : 'No turns recorded.');
    process.exit(1);
  }
  if (nth > filtered.length) {
    console.error(
      `Requested entry #${nth}, but only ${filtered.length} matching turn(s) recorded.`,
    );
    process.exit(1);
  }
  const entry = filtered[nth - 1];

  if (asJson) {
    console.log(JSON.stringify(entry, null, 2));
    return;
  }

  const timeline = await readTimeline(entry.slug);
  const lastEvent = summarizeLastEvent(entry, timeline);

  console.log(`• ${entry.slug}`);
  console.log(`  → ${JSON.stringify(entry.userMessage ?? '(no user message recorded)')}`);
  console.log(
    `  started ${fmtTime(entry.startedAt)}, ended ${fmtTime(entry.endedAt)}  (${fmtDuration(entry.durationMs)})  outcome: ${entry.outcome ?? '?'}`,
  );
  console.log(
    `  finish_reason: ${entry.finishReason ?? '?'} · text: ${entry.textLength ?? '?'} chars · tool_calls: ${entry.toolCallCount ?? '?'}`,
  );
  console.log(`  last_event: ${lastEvent}`);
  console.log(`  trace: ${join(ROOT, entry.slug)}/`);
}

void main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
