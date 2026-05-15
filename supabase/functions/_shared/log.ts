// Structured JSONL logger for Edge Functions.
//
// One line per log event, prefixed with `[function]` so the dev:full
// orchestrator can fan multiple functions into one combined log file.
//
// Every request carries a `request_id` (sent by the client or generated)
// that lets us join browser-side logs to Edge Function logs.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = {
  function: string;
  request_id: string;
  user_id?: string;
};

export function makeRequestId(req: Request): string {
  return req.headers.get('x-request-id') ?? crypto.randomUUID();
}

export function log(level: LogLevel, ctx: LogContext, event: string, payload?: unknown): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    function: ctx.function,
    request_id: ctx.request_id,
    user_id: ctx.user_id,
    event,
    ...(payload !== undefined ? { payload } : {}),
  };
  console.log(`[${ctx.function}] ${JSON.stringify(line)}`);
}

/** Helper that times an async operation and logs its duration. */
export async function timed<T>(ctx: LogContext, event: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  log('debug', ctx, `${event}.start`);
  try {
    const result = await fn();
    log('info', ctx, `${event}.ok`, { duration_ms: Math.round(performance.now() - start) });
    return result;
  } catch (err) {
    log('error', ctx, `${event}.fail`, {
      duration_ms: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
