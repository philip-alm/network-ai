/**
 * Passive observer for the upstream LLM SSE stream.
 *
 * Identity-transform: bytes flow through unchanged so the client gets the
 * raw upstream body. Side-effect only — on end-of-stream we count bytes,
 * extract the final `finish_reason`, and call `onDone`. The transform is
 * best-effort: a thrown callback never breaks the stream.
 *
 * Why this exists: prior to 2026-05-16 the Edge Function only logged
 * `request.received` + `upstream.streaming` — the LLM hop's completion
 * (or hang) left no server-side trace. That gap masked the agent's
 * silent-stop behavior. This observer closes the gap with one structured
 * log line per hop end.
 *
 * Why not `.tee()`: tee couples the two consumers' read rates via
 * backpressure — a slow observer would throttle the client. A passive
 * identity transform has zero buffering cost and never bottlenecks.
 *
 * Client-cancel detection lives in the route handler (signal listener)
 * rather than here — `Transformer.cancel` is non-standard in TypeScript
 * DOM types, and the request's AbortSignal already carries the same
 * information one level up.
 */

export type UpstreamObserverCallbacks = {
  onDone: (info: { bytes: number; finishReason: string | null; durationMs: number }) => void;
};

export function makeUpstreamObserver(
  opts: UpstreamObserverCallbacks,
  // Injectable for tests so we don't depend on `performance.now()` drift.
  now: () => number = () => performance.now(),
): TransformStream<Uint8Array, Uint8Array> {
  const tStart = now();
  let bytes = 0;
  // Rolling 8KB tail keeps the regex cheap while still catching the
  // final `finish_reason` field even on large response bodies. SSE
  // messages are line-delimited; the closing `[DONE]` event always
  // sits at the very end of the stream.
  let tail = '';
  const decoder = new TextDecoder();

  return new TransformStream({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      tail = (tail + decoder.decode(chunk, { stream: true })).slice(-8192);
      controller.enqueue(chunk);
    },
    flush() {
      const matches = [...tail.matchAll(/"finish_reason"\s*:\s*"([^"]+)"/g)];
      const finishReason = matches.length > 0 ? matches[matches.length - 1][1] : null;
      try {
        opts.onDone({
          bytes,
          finishReason,
          durationMs: Math.round(now() - tStart),
        });
      } catch {
        // Observer callbacks are best-effort — never break the stream.
      }
    },
  });
}
