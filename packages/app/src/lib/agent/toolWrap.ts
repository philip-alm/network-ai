/**
 * toolWrap — wraps a tool handler with Zod validation + PG-error-code hints
 * + structured timeline events on the injected debug recorder.
 *
 * Every tool returns the same `ToolEnvelope` shape so the LLM never sees a
 * thrown error — instead it gets `{ ok: false, error, hint, retriable }`
 * with an actionable hint. This is the "nudges" mechanism the user asked for.
 *
 * The wrap returns a Vercel AI SDK `tool({})` object so callers can plug it
 * into `tools: { query_sql: toolWrap(...), ... }` directly.
 */

import { tool } from 'ai';
import type { z } from 'zod';
import { noopDebugRecorder, type DebugRecorder } from './debugRecorder';

export type ToolEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; hint: string; retriable: boolean };

export type HandlerResult<T> =
  | T
  | {
      __toolError: true;
      error: string;
      hint?: string;
      pgCode?: string;
      retriable?: boolean;
    };

export type HandlerFn<TIn, TOut> = (
  input: TIn,
  ctx: { signal?: AbortSignal },
) => Promise<HandlerResult<TOut>>;

export type ToolWrapOptions = {
  recorder?: DebugRecorder;
};

/** Map of Postgres error codes to actionable hints for the LLM. */
export const PG_HINTS: Record<string, string> = {
  '42P01': 'Table does not exist. Valid tables: contacts, assets, chat_threads, chat_messages.',
  '42703': 'Column does not exist. Check the schema in your system prompt.',
  '42601':
    'SQL syntax error. INSERT needs VALUES + RETURNING; UPDATE needs SET; DELETE needs WHERE.',
  '42P10': 'No UNIQUE constraint matching ON CONFLICT. Use plain INSERT instead.',
  '23505': 'Unique constraint violation — the row already exists. Try UPDATE or query first.',
  '23503': 'Foreign key violation — the referenced row does not exist. INSERT the parent first.',
  '23514': 'Check constraint violation. Warmth must be 1–5; role must be valid.',
  '42501': 'RLS denial. Do NOT pass user_id in INSERTs — the DB defaults it to auth.uid().',
  '22P02':
    'Invalid value for column type (e.g. non-uuid string in a uuid column, or invalid array literal).',
  '57014': 'Query exceeded statement_timeout. Add LIMIT or simplify.',
};

const NO_HINT = 'Re-check your call against the system prompt and schema.';

/** Best-effort Postgres-error-code extraction from a supabase error message. */
export function extractPgCode(message: string): string | undefined {
  // supabase-js surfaces errors like "duplicate key value violates unique
  // constraint \"contacts_pkey\"" without a code in message — but the
  // PostgrestError carries `.code`. We accept either: handler passes `pgCode`
  // explicitly, OR we sniff the message.
  const match = message.match(/code['":\s]+([0-9A-Z]{5})/);
  return match?.[1];
}

/** Turn a Zod issue path into a human-friendly hint. */
export function hintFromZodIssue(issue: z.ZodIssue): string {
  const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
  switch (issue.code) {
    case 'invalid_type':
      return `Argument \`${path}\` must be ${issue.expected}. You provided ${issue.received}.`;
    case 'too_small':
      return `Argument \`${path}\` is too small (${issue.message}).`;
    case 'too_big':
      return `Argument \`${path}\` is too large (${issue.message}).`;
    case 'invalid_enum_value':
      return `Argument \`${path}\` must be one of: ${issue.options.join(', ')}.`;
    default:
      return `Argument \`${path}\`: ${issue.message}`;
  }
}

/**
 * Wraps a handler into a Vercel AI SDK tool with:
 *   - Zod safeParse on input (returns envelope on failure with path-derived hint)
 *   - try/catch around the handler (returns envelope on throw)
 *   - PG-code → hint mapping via PG_HINTS
 *   - recorder timeline events: tool/start, tool/end (with duration_ms)
 *   - Always-envelope return shape so the LLM never sees a raw throw
 */
export function toolWrap<TIn, TOut>(
  name: string,
  description: string,
  inputSchema: z.ZodType<TIn>,
  handler: HandlerFn<TIn, TOut>,
  opts: ToolWrapOptions = {},
) {
  const recorder = opts.recorder ?? noopDebugRecorder;

  return tool({
    description,
    inputSchema: inputSchema as never,
    execute: async (rawInput, runtime): Promise<ToolEnvelope<TOut>> => {
      const callId =
        (runtime as { toolCallId?: string })?.toolCallId ??
        `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const t0 = Date.now();
      recorder.recordToolCall(callId, name, rawInput);
      recorder.recordTimeline('tool/start', { id: callId, name });

      // Zod validation
      const parsed = inputSchema.safeParse(rawInput);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const env: ToolEnvelope<TOut> = {
          ok: false,
          error: `validation failed: ${issue.message}`,
          hint: hintFromZodIssue(issue),
          retriable: false,
        };
        recorder.recordToolResult(callId, env, Date.now() - t0);
        recorder.recordTimeline('tool/end', {
          id: callId,
          name,
          ok: false,
          duration_ms: Date.now() - t0,
        });
        return env;
      }

      // Run the handler
      try {
        const result = await handler(parsed.data, {
          signal: (runtime as { abortSignal?: AbortSignal })?.abortSignal,
        });

        // Detect the handler's "soft error" return convention.
        if (
          result !== null &&
          typeof result === 'object' &&
          (result as { __toolError?: boolean }).__toolError === true
        ) {
          const e = result as {
            error: string;
            hint?: string;
            pgCode?: string;
            retriable?: boolean;
          };
          const code = e.pgCode ?? extractPgCode(e.error);
          const env: ToolEnvelope<TOut> = {
            ok: false,
            error: e.error,
            hint: e.hint ?? (code ? PG_HINTS[code] : undefined) ?? NO_HINT,
            retriable: e.retriable ?? false,
          };
          recorder.recordToolResult(callId, env, Date.now() - t0);
          recorder.recordTimeline('tool/end', {
            id: callId,
            name,
            ok: false,
            duration_ms: Date.now() - t0,
          });
          return env;
        }

        const env: ToolEnvelope<TOut> = { ok: true, data: result as TOut };
        recorder.recordToolResult(callId, env, Date.now() - t0);
        recorder.recordTimeline('tool/end', {
          id: callId,
          name,
          ok: true,
          duration_ms: Date.now() - t0,
        });
        return env;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const code = extractPgCode(msg);
        const env: ToolEnvelope<TOut> = {
          ok: false,
          error: msg,
          hint: code ? PG_HINTS[code] : NO_HINT,
          retriable: false,
        };
        recorder.recordToolResult(callId, env, Date.now() - t0);
        recorder.recordTimeline('tool/end', {
          id: callId,
          name,
          ok: false,
          duration_ms: Date.now() - t0,
        });
        return env;
      }
    },
  });
}

/** Helper for handlers to surface a soft error with optional pgCode + hint. */
export function toolError(opts: {
  error: string;
  hint?: string;
  pgCode?: string;
  retriable?: boolean;
}): HandlerResult<never> {
  return { __toolError: true, ...opts };
}
