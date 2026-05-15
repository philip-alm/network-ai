/**
 * Agent error taxonomy + teach-and-retry constants.
 *
 * Mirrors Incredible's `LlmTurnError` (`crates/sub-agent-core/src/llm_turn.rs`).
 * The classification matters because it gates whether the agent loop retries
 * with a teaching message or surfaces the failure to the user.
 */

export const MAX_TEACH_RETRIES = 2;

export const TEACHING_MESSAGE =
  'Your last response was cut short or malformed. Common causes: tool arguments ' +
  'too large, stream stalled, or provider hiccup. Please retry. Tips:\n' +
  '- For SQL reads: include `LIMIT 50` or smaller.\n' +
  '- Keep tool arguments under ~4KB.\n' +
  '- One tool call per step (no parallel).\n' +
  '- If a previous tool returned `{ ok: false, hint: ... }`, read the hint and ' +
  'adjust — do not repeat the same failing call.';

export type AgentError =
  | { kind: 'recoverable_stream_stalled'; detail: string; secs: number }
  | { kind: 'recoverable_stream_errored'; detail: string; status?: number }
  | { kind: 'recoverable_truncated'; toolName: string; parseError: string }
  | { kind: 'recoverable_rate_limited'; detail: string; retryAfterMs?: number }
  | { kind: 'fatal_auth'; detail: string }
  | { kind: 'fatal_malformed_history'; detail: string }
  | { kind: 'fatal_provider'; detail: string };

export function isRecoverable(err: AgentError): boolean {
  return err.kind.startsWith('recoverable_');
}

/** Get a human-readable detail string from any AgentError variant. */
export function errorDetail(err: AgentError): string {
  if (err.kind === 'recoverable_truncated') return err.parseError;
  return err.detail;
}

/**
 * Best-effort classification of a thrown error from generateText / streamText.
 * Falls back to `fatal_provider` if nothing matches — better to surface than
 * to silently retry on a logic bug.
 */
export function classifyError(err: unknown): AgentError {
  if (err instanceof StalledTimeoutError) {
    return { kind: 'recoverable_stream_stalled', detail: err.message, secs: err.secs };
  }
  if (err instanceof FirstChunkTimeoutError) {
    return { kind: 'recoverable_stream_stalled', detail: err.message, secs: err.secs };
  }
  const msg = err instanceof Error ? err.message : String(err);
  const lc = msg.toLowerCase();

  if (lc.includes('malformedhistory') || lc.includes('malformed history')) {
    return { kind: 'fatal_malformed_history', detail: msg };
  }
  if (lc.includes('401') || lc.includes('unauthorized') || lc.includes('invalid_api_key')) {
    return { kind: 'fatal_auth', detail: msg };
  }
  if (lc.includes('429') || lc.includes('rate limit') || lc.includes('too many requests')) {
    return { kind: 'recoverable_rate_limited', detail: msg };
  }
  if (lc.includes('500') || lc.includes('502') || lc.includes('503') || lc.includes('504')) {
    return { kind: 'recoverable_stream_errored', detail: msg };
  }
  if (
    lc.includes('json') &&
    (lc.includes('parse') || lc.includes('truncat') || lc.includes('unexpected'))
  ) {
    return { kind: 'recoverable_truncated', toolName: 'unknown', parseError: msg };
  }
  if (lc.includes('aborted') || lc.includes('abort')) {
    // User-initiated abort isn't an "error" we'd retry; treat as fatal.
    return { kind: 'fatal_provider', detail: msg };
  }
  return { kind: 'fatal_provider', detail: msg };
}

export class FirstChunkTimeoutError extends Error {
  readonly secs: number;
  constructor(secs: number) {
    super(`First-chunk timeout after ${secs}s`);
    this.name = 'FirstChunkTimeoutError';
    this.secs = secs;
  }
}

export class StalledTimeoutError extends Error {
  readonly secs: number;
  constructor(secs: number) {
    super(`Stream stalled for ${secs}s`);
    this.name = 'StalledTimeoutError';
    this.secs = secs;
  }
}

export class MalformedHistoryError extends Error {
  constructor(detail: string) {
    super(`MalformedHistory: ${detail}`);
    this.name = 'MalformedHistoryError';
  }
}
