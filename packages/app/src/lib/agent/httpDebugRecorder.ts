/**
 * HttpDebugRecorder — captures byte-exact browser turns by POSTing each
 * event to a localhost-only dev endpoint (`/api/debug/recorder`) that
 * writes to `~/Documents/reknowable-debug/browser-turns/<slug>/` in the
 * exact same layout as `NodeDebugRecorder`.
 *
 * Wire format (one POST per event):
 *   {
 *     slug:    "2026-05-16T10-36-01-abc1",
 *     ts:      "<iso timestamp>",
 *     method:  "startTurn" | "endTurn" | "llmRequest" |
 *              "llmResponseChunk" | "toolCall" | "toolResult" | "timeline",
 *     turn:    <current turn counter>,
 *     payload: <method-specific args>
 *   }
 *
 * The recorder owns a private fetch chain so events arrive at the route
 * in the order they were emitted. `flush()` awaits the chain — call it
 * before returning from `runAgentTurn` so reads from disk are consistent.
 *
 * Best-effort: a POST failure is logged via `console.warn` and the chain
 * continues. The agent loop never observes recorder errors.
 *
 * Dev-only by construction: the route refuses to run when
 * `NODE_ENV !== 'development'`. The wrapper in `browserAgent.ts` is
 * gated on the same flag so this code never instantiates in prod.
 */

import type { DebugRecorder } from './debugRecorder';

export type HttpDebugRecorderOptions = {
  /** Defaults to '/api/debug/recorder' (same-origin in the browser). */
  endpoint?: string;
  /** Optional pre-seeded slug; mostly for tests. */
  slug?: string;
  /** Inject a custom fetch (e.g. for tests). Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
};

function makeSlug(): string {
  const t = new Date().toISOString().replace(/[:.]/g, '-');
  const rand = Math.random().toString(36).slice(2, 6);
  return `${t}-${rand}`;
}

export function createHttpDebugRecorder(opts: HttpDebugRecorderOptions = {}): DebugRecorder {
  const endpoint = opts.endpoint ?? '/api/debug/recorder';
  const slug = opts.slug ?? makeSlug();
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch?.bind(globalThis);

  let turnCounter = 0;
  // Serial chain so events arrive at the route in emission order. Each
  // `post()` awaits the prior chain link, then resolves regardless of
  // network outcome so a single dropped POST never wedges the rest.
  let chain: Promise<void> = Promise.resolve();

  function post(method: string, payload: unknown): void {
    if (!fetchImpl) return;
    const body = JSON.stringify({
      slug,
      ts: new Date().toISOString(),
      method,
      turn: turnCounter,
      payload,
    });
    chain = chain.then(async () => {
      try {
        await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          // Keep-alive lets the POST survive a page unload, which is the
          // exact moment we most want the last events captured.
          keepalive: true,
        });
      } catch (err) {
        // Swallow + log — recorder is best-effort by contract.
        // eslint-disable-next-line no-console
        console.warn(
          `[http-debug-recorder] POST ${endpoint} failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    });
  }

  return {
    path: slug,

    startTurn(meta) {
      turnCounter++;
      post('startTurn', meta);
      return turnCounter;
    },

    endTurn(outcome, detail) {
      post('endTurn', { outcome, detail });
    },

    recordLlmRequest(body) {
      post('llmRequest', body);
    },

    recordLlmResponseChunk(chunk) {
      post('llmResponseChunk', chunk);
    },

    recordToolCall(id, name, args) {
      post('toolCall', { id, name, args });
    },

    recordToolResult(id, result, durationMs) {
      post('toolResult', { id, result, durationMs });
    },

    recordTimeline(event, payload) {
      post('timeline', { event, payload: payload ?? null });
    },

    async flush() {
      await chain;
    },
  };
}
