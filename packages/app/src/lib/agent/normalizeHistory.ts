/**
 * normalizeHistory — wire-format defense before every LLM call.
 *
 * The OpenAI-compatible chat-completions protocol requires every assistant
 * message containing `tool_calls` to be IMMEDIATELY followed by `tool`
 * messages whose `tool_call_id` matches each emitted call. Violations cause
 * 400s on some providers and hallucinated continuations on others.
 *
 * Causes of malformed history we've actually hit:
 *  - Cancelled mid-turn leaves an orphan `assistant{tool_calls}` and no result.
 *  - Stale assistant messages with stripped tool_results from earlier sessions.
 *  - Duplicate tool messages (re-run a step manually).
 *
 * Three passes (mirrors Incredible `crates/orchestrator/src/normalize.rs`):
 *   Pass 1: collect every `tool` message by `tool_call_id` (last-one-wins).
 *   Pass 2: re-emit non-tool messages in order; after every
 *           `assistant{tool_calls}`, inline the matching tool result OR
 *           synthesize `{ error: "dropped by runtime" }`.
 *   Pass 3: assert the LAST message is not an orphan `assistant{tool_calls}`.
 *           If it is, throw — we'd 400 the LLM call.
 */

import { MalformedHistoryError } from './errors';

/**
 * Generic shape compatible with Vercel AI SDK's `ModelMessage` and our local
 * `AgentMessage`. We accept the broader shape so callers don't have to cast.
 */
export type NormalizableMessage = {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content?: unknown;
  tool_calls?: Array<{ id: string; type?: string; function?: unknown }>;
  tool_call_id?: string;
  [key: string]: unknown;
};

export type NormalizeOptions = {
  /**
   * When true, an orphan trailing `assistant{tool_calls}` is silently dropped
   * instead of throwing. Useful for callers that just want a best-effort fix.
   * Default false — fail loudly so the bug is investigated.
   */
  dropOrphanTrailing?: boolean;
};

export function normalizeHistory<T extends NormalizableMessage>(
  messages: readonly T[],
  opts: NormalizeOptions = {},
): T[] {
  // Pass 1: build a map of tool messages by tool_call_id (last-one-wins).
  const toolByCallId = new Map<string, T>();
  for (const m of messages) {
    if (m.role === 'tool' && typeof m.tool_call_id === 'string' && m.tool_call_id.length > 0) {
      toolByCallId.set(m.tool_call_id, m);
    }
  }

  // Pass 2: re-emit non-tool messages, inlining tool results after each
  // assistant{tool_calls}.
  const out: T[] = [];
  for (const m of messages) {
    if (m.role === 'tool') continue; // already collected
    out.push(m);

    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      for (const tc of m.tool_calls) {
        const id = tc.id;
        if (typeof id !== 'string' || id.length === 0) continue;
        const found = toolByCallId.get(id);
        if (found) {
          out.push(found);
        } else {
          // Synthesize a graceful placeholder — Incredible's "dropped by
          // runtime" sentinel — so the wire format is satisfied. The LLM
          // sees that the call dropped and self-corrects.
          out.push({
            role: 'tool',
            tool_call_id: id,
            content: JSON.stringify({ error: 'dropped by runtime', retriable: true }),
          } as unknown as T);
        }
      }
    }
  }

  // Pass 3: assert the last message is not an orphan assistant{tool_calls}.
  const last = out[out.length - 1];
  if (
    last &&
    last.role === 'assistant' &&
    Array.isArray(last.tool_calls) &&
    last.tool_calls.length > 0
  ) {
    // After Pass 2 this shouldn't be reachable (we always append tool
    // results), but defend in depth.
    if (opts.dropOrphanTrailing) {
      out.pop();
    } else {
      throw new MalformedHistoryError(
        'history ends with an assistant{tool_calls} that has no matching tool result(s) — ' +
          'this would cause a 400 from the provider.',
      );
    }
  }

  return out;
}
