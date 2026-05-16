/**
 * /api/debug/recorder — dev-only endpoint that mirrors browser agent
 * turns to `~/Documents/reknowable-debug/browser-turns/<slug>/` in the
 * SAME shape as `NodeDebugRecorder`. Refuses in any non-development env.
 *
 * Wire format: one POST per recorder event, each shaped as:
 *   { slug, ts, method, turn, payload }
 * (see packages/app/src/lib/agent/httpDebugRecorder.ts for the producer).
 *
 * On each event we:
 *   - append a JSONL line to `<slug>/timeline.jsonl`
 *   - on `startTurn`, write `<slug>/metadata.json` + add a "running"
 *     entry to `browser-turns/index.jsonl`
 *   - on `endTurn`, update `metadata.json` outcome + finalize the
 *     `index.jsonl` entry (atomic per-line rewrite — last-write-wins)
 *   - on `llmRequest`, write `<slug>/llm/turn-NN/request.json`
 *   - on `llmResponseChunk`, append to `<slug>/llm/turn-NN/response.sse`
 *   - on `toolCall` / `toolResult`, write/append `<slug>/tool_calls/<id>.json`
 *
 * Reads (`pnpm last-turn`, manual `cat`) walk this exact layout.
 */

import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';

// Default: ~/Documents/reknowable-debug/browser-turns/. Overridable via
// REKNOWABLE_DEBUG_ROOT so tests can write to a tmpdir and so an
// operator can point at a network share if they want centralized traces.
function rootDir(): string {
  return (
    process.env.REKNOWABLE_DEBUG_ROOT ??
    join(homedir(), 'Documents', 'reknowable-debug', 'browser-turns')
  );
}
function indexPath(): string {
  return join(rootDir(), 'index.jsonl');
}

// Slugs are recorder-generated ISO timestamps + 4 random chars. Anything
// outside that alphabet is a sign of tampering — reject before touching
// the filesystem so a malicious slug can't escape ROOT via `..`.
const SLUG_RE = /^[A-Za-z0-9\-_]+$/;

type RecorderEvent = {
  slug: string;
  ts: string;
  method:
    | 'startTurn'
    | 'endTurn'
    | 'llmRequest'
    | 'llmResponseChunk'
    | 'toolCall'
    | 'toolResult'
    | 'timeline';
  turn: number;
  payload: unknown;
};

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

function turnDir(slugDir: string, turn: number): string {
  return join(slugDir, 'llm', `turn-${String(turn).padStart(2, '0')}`);
}

async function appendIndexEntry(entry: IndexEntry): Promise<void> {
  await fs.mkdir(rootDir(), { recursive: true });
  await fs.appendFile(indexPath(), JSON.stringify(entry) + '\n');
}

/**
 * Finalize the index entry for a slug. The index is append-only, so we
 * append a NEW line carrying the final state. `pnpm last-turn` reads the
 * LATEST line per slug to get the current view.
 */
async function finalizeIndexEntry(slug: string, patch: Partial<IndexEntry>): Promise<void> {
  await appendIndexEntry({ slug, startedAt: '', ...patch });
}

export async function POST(req: Request): Promise<Response> {
  // Refuse in production only. Dev + test + anything-else is fine; the
  // route's only side effect is writing to a local debug directory.
  if (process.env.NODE_ENV === 'production') {
    return new Response('debug recorder unavailable in production', { status: 404 });
  }

  let event: RecorderEvent;
  try {
    event = (await req.json()) as RecorderEvent;
  } catch {
    return new Response('invalid json', { status: 400 });
  }
  if (!event?.slug || !SLUG_RE.test(event.slug)) {
    return new Response('bad slug', { status: 400 });
  }

  const slugDir = join(rootDir(), event.slug);
  try {
    await fs.mkdir(slugDir, { recursive: true });
    await fs.mkdir(join(slugDir, 'tool_calls'), { recursive: true });
    await fs.mkdir(join(slugDir, 'llm'), { recursive: true });

    // Every event lands in the timeline.
    await fs.appendFile(
      join(slugDir, 'timeline.jsonl'),
      JSON.stringify({ ts: event.ts, method: event.method, payload: event.payload }) + '\n',
    );

    switch (event.method) {
      case 'startTurn': {
        const meta = event.payload as {
          threadId: string;
          userId: string;
          userMessage: string;
        };
        await fs.writeFile(
          join(slugDir, 'metadata.json'),
          JSON.stringify(
            { ...meta, slug: event.slug, startedAt: event.ts, turn: event.turn },
            null,
            2,
          ),
        );
        await appendIndexEntry({
          slug: event.slug,
          startedAt: event.ts,
          userMessage: meta.userMessage,
          threadId: meta.threadId,
          userId: meta.userId,
          outcome: 'running',
        });
        break;
      }

      case 'endTurn': {
        const { outcome, detail } = event.payload as {
          outcome: 'ok' | 'error';
          detail?: string;
        };
        // Re-read metadata.json so we don't clobber threadId/userId/etc.
        let prior: Record<string, unknown> = {};
        try {
          prior = JSON.parse(await fs.readFile(join(slugDir, 'metadata.json'), 'utf8')) as Record<
            string,
            unknown
          >;
        } catch {
          // First write — leave prior empty.
        }
        const startedAtStr = typeof prior.startedAt === 'string' ? prior.startedAt : undefined;
        const durationMs = startedAtStr
          ? new Date(event.ts).getTime() - new Date(startedAtStr).getTime()
          : undefined;
        await fs.writeFile(
          join(slugDir, 'metadata.json'),
          JSON.stringify({ ...prior, endedAt: event.ts, outcome, detail, durationMs }, null, 2),
        );
        await finalizeIndexEntry(event.slug, {
          startedAt: startedAtStr ?? event.ts,
          endedAt: event.ts,
          outcome,
          detail,
          durationMs,
        });
        break;
      }

      case 'llmRequest': {
        const dir = turnDir(slugDir, event.turn);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(join(dir, 'request.json'), JSON.stringify(event.payload, null, 2));
        break;
      }

      case 'llmResponseChunk': {
        const dir = turnDir(slugDir, event.turn);
        await fs.mkdir(dir, { recursive: true });
        // Chunks are raw strings, written verbatim for byte-exactness.
        const chunk = typeof event.payload === 'string' ? event.payload : '';
        await fs.appendFile(join(dir, 'response.sse'), chunk);
        break;
      }

      case 'toolCall': {
        const { id, name, args } = event.payload as { id: string; name: string; args: unknown };
        if (!id || !/^[A-Za-z0-9\-_]+$/.test(id)) break;
        await fs.writeFile(
          join(slugDir, 'tool_calls', `${id}.json`),
          JSON.stringify({ id, name, args, startedAt: event.ts }, null, 2),
        );
        break;
      }

      case 'toolResult': {
        const { id, result, durationMs } = event.payload as {
          id: string;
          result: unknown;
          durationMs?: number;
        };
        if (!id || !/^[A-Za-z0-9\-_]+$/.test(id)) break;
        await fs.appendFile(
          join(slugDir, 'tool_calls', `${id}.json`),
          '\n' + JSON.stringify({ id, result, durationMs, endedAt: event.ts }, null, 2),
        );
        break;
      }

      case 'timeline': {
        // Already appended to timeline.jsonl above. If this is the
        // post-stream summary, lift finishReason / textLength /
        // toolCallCount into the index so `pnpm last-turn` can show
        // them without reading the full timeline.
        const p = event.payload as { event?: string; payload?: unknown } | null;
        if (p && p.event === 'llm/finished' && p.payload && typeof p.payload === 'object') {
          const summary = p.payload as {
            finish_reason?: string;
            text_length?: number;
            tool_calls?: number;
          };
          await finalizeIndexEntry(event.slug, {
            startedAt: '',
            finishReason: summary.finish_reason,
            textLength: summary.text_length,
            toolCallCount: summary.tool_calls,
          });
        }
        break;
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[debug-recorder route] write failed: ${err instanceof Error ? err.message : err}`,
    );
    return new Response('write failed', { status: 500 });
  }

  return new Response('ok', { status: 200 });
}
