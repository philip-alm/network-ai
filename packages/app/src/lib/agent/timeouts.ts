/**
 * Two-budget timeout wrapper for streaming LLM calls.
 *
 *   - firstChunkMs: deadline for "any progress at all" (first token, first
 *     tool call). If no signal within this budget, abort + reject. Mirrors
 *     Incredible `crates/orchestrator/src/lib.rs:23` ORCHESTRATOR_TURN_FIRST_CHUNK_TIMEOUT.
 *   - stallMs: deadline between consecutive events. Caught the Cerebras
 *     2026-05-03 incident (provider held HTTP 200 + inline error for 60s
 *     before `[DONE]`). Mirrors ORCHESTRATOR_TURN_STALL_TIMEOUT.
 *
 * Callers signal progress by invoking the returned `tick()` function. Each
 * tick resets the stall timer. `dispose()` clears all timers (call on success
 * + on failure to avoid leaks).
 */

import { FirstChunkTimeoutError, StalledTimeoutError } from './errors';

export type TimeoutController = {
  /** AbortSignal to thread into fetch / generateText. */
  readonly signal: AbortSignal;
  /** Indicates a progress event happened — resets the stall timer. */
  tick: () => void;
  /** Stops all timers. Idempotent. */
  dispose: () => void;
  /** Resolves with the timeout error if either budget fires before dispose(). */
  readonly tripped: Promise<never>;
};

export function makeTimeoutController(opts: {
  firstChunkMs: number;
  stallMs: number;
  externalSignal?: AbortSignal;
}): TimeoutController {
  const controller = new AbortController();
  // If a caller passes an external signal, propagate aborts in.
  opts.externalSignal?.addEventListener('abort', () => controller.abort(), { once: true });

  let firstChunkSeen = false;
  let disposed = false;

  let firstChunkTimer: ReturnType<typeof setTimeout> | undefined;
  let stallTimer: ReturnType<typeof setTimeout> | undefined;

  let reject: (err: Error) => void = () => {};
  const tripped = new Promise<never>((_, rej) => {
    reject = rej;
  });

  function clearTimers(): void {
    if (firstChunkTimer) clearTimeout(firstChunkTimer);
    if (stallTimer) clearTimeout(stallTimer);
    firstChunkTimer = undefined;
    stallTimer = undefined;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    clearTimers();
  }

  firstChunkTimer = setTimeout(() => {
    if (disposed || firstChunkSeen) return;
    controller.abort();
    reject(new FirstChunkTimeoutError(opts.firstChunkMs / 1000));
    dispose();
  }, opts.firstChunkMs);

  function tick(): void {
    if (disposed) return;
    if (!firstChunkSeen) {
      firstChunkSeen = true;
      if (firstChunkTimer) clearTimeout(firstChunkTimer);
      firstChunkTimer = undefined;
    }
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      if (disposed) return;
      controller.abort();
      reject(new StalledTimeoutError(opts.stallMs / 1000));
      dispose();
    }, opts.stallMs);
  }

  return {
    signal: controller.signal,
    tick,
    dispose,
    tripped,
  };
}
