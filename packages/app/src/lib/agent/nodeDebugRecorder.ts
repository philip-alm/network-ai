/**
 * NodeDebugRecorder — writes debug artifacts to
 * ~/Documents/reknowable-debug/<timestamp>-<slug>/
 *
 * Best-effort: write failures are caught and surfaced via console.error
 * but never thrown back into the agent loop (per CLAUDE.md §8 contract).
 *
 * Node-only. The browser uses a no-op or IndexedDB-backed recorder.
 */

import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { DebugRecorder } from './debugRecorder';

function slug(): string {
  const t = new Date().toISOString().replace(/[:.]/g, '-');
  const rand = Math.random().toString(36).slice(2, 6);
  return `${t}-${rand}`;
}

export function createNodeDebugRecorder(
  opts: { rootDir?: string; slug?: string } = {},
): DebugRecorder {
  const root = opts.rootDir ?? join(homedir(), 'Documents', 'reknowable-debug');
  const id = opts.slug ?? slug();
  const dir = join(root, id);

  function safe(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      console.error(`[debug-recorder] write failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  safe(() => mkdirSync(dir, { recursive: true }));
  safe(() => mkdirSync(join(dir, 'llm'), { recursive: true }));
  safe(() => mkdirSync(join(dir, 'tool_calls'), { recursive: true }));

  const timelinePath = join(dir, 'timeline.jsonl');
  const metadataPath = join(dir, 'metadata.json');

  function appendTimeline(event: string, payload?: unknown): void {
    safe(() =>
      appendFileSync(
        timelinePath,
        JSON.stringify({ ts: new Date().toISOString(), event, payload: payload ?? null }) + '\n',
      ),
    );
  }

  let metadata: { threadId: string; userId: string; userMessage: string } | null = null;
  let turnCounter = 0;

  function turnDir(): string {
    return join(dir, 'llm', `turn-${String(turnCounter).padStart(2, '0')}`);
  }

  return {
    path: dir,

    startTurn(meta) {
      turnCounter++;
      metadata = meta;
      const turnPath = turnDir();
      safe(() => mkdirSync(turnPath, { recursive: true }));
      safe(() =>
        writeFileSync(
          metadataPath,
          JSON.stringify(
            { ...meta, turn: turnCounter, startedAt: new Date().toISOString() },
            null,
            2,
          ),
        ),
      );
      appendTimeline('startTurn', { ...meta, turn: turnCounter });
      return turnCounter;
    },

    endTurn(outcome, detail) {
      appendTimeline('endTurn', { outcome, detail, turn: turnCounter });
      safe(() =>
        writeFileSync(
          metadataPath,
          JSON.stringify(
            {
              ...metadata,
              lastTurn: turnCounter,
              endedAt: new Date().toISOString(),
              outcome,
              detail,
            },
            null,
            2,
          ),
        ),
      );
    },

    recordLlmRequest(body) {
      const turnPath = turnDir();
      safe(() => mkdirSync(turnPath, { recursive: true }));
      safe(() => writeFileSync(join(turnPath, 'request.json'), JSON.stringify(body, null, 2)));
      appendTimeline('llmRequest', { turn: turnCounter });
    },

    recordLlmResponseChunk(chunk) {
      const turnPath = turnDir();
      safe(() => mkdirSync(turnPath, { recursive: true }));
      safe(() => appendFileSync(join(turnPath, 'response.sse'), chunk));
    },

    recordToolCall(id, name, args) {
      safe(() =>
        writeFileSync(
          join(dir, 'tool_calls', `${id}.json`),
          JSON.stringify({ id, name, args, startedAt: new Date().toISOString() }, null, 2),
        ),
      );
      appendTimeline('toolCall', { id, name });
    },

    recordToolResult(id, result, durationMs) {
      safe(() =>
        appendFileSync(
          join(dir, 'tool_calls', `${id}.json`),
          '\n' +
            JSON.stringify({ id, result, durationMs, endedAt: new Date().toISOString() }, null, 2),
        ),
      );
      appendTimeline('toolResult', { id, durationMs });
    },

    recordTimeline(event, payload) {
      appendTimeline(event, payload);
    },
  };
}
