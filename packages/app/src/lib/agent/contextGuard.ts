/**
 * contextGuard — keep the message array under a hard character budget
 * by dropping OLDEST conversation turns. No summarization, no field
 * stripping, no compaction. If the total character count of the
 * message payload exceeds CHAR_BUDGET, we drop the oldest user-led
 * pair (a `user` message plus any immediately following assistant +
 * tool messages until the next `user`) and re-check. Repeat until
 * we fit, OR we've dropped everything except the current user prompt.
 *
 * Why pairs, not individual messages: the OpenAI-compatible wire
 * format requires every `assistant{tool_calls}` to be immediately
 * followed by matching `tool` messages. Dropping in pair units keeps
 * that contract intact.
 *
 * The current user prompt (last `user` message) is NEVER dropped —
 * dropping it would mean the agent has no question to answer.
 */

import type { NormalizableMessage } from './normalizeHistory';

/** Hard character budget for the entire chat history we ship to the
 *  LLM. Counts every message's role + content + tool_calls + tool_call_id
 *  serialized. 400 k chars ≈ 130 k tokens at our worst-case chars/token,
 *  matches the smallest provider window (Cerebras 131 k) with headroom
 *  for the system prompt, tool schemas, and the assistant's output. */
const CHAR_BUDGET = 400_000;

export type ContextGuardResult<T extends NormalizableMessage> = {
  /** The messages to send to the LLM after truncation. */
  messages: T[];
  /** What the guard did, in order, so callers can log/recorder it. */
  actions: ContextGuardAction[];
  /** Final estimated character count of the returned messages. */
  estimatedChars: number;
};

export type ContextGuardAction = {
  kind: 'dropped_oldest_pairs';
  count: number;
};

/**
 * Apply the guard to a normalized message array. Returns a possibly-
 * truncated copy safe to send to the LLM.
 *
 * Always defensive — never throws on weird shapes; just leaves them
 * alone.
 */
export function applyContextGuard<T extends NormalizableMessage>(
  messages: readonly T[],
  options?: { charBudget?: number },
): ContextGuardResult<T> {
  const budget = options?.charBudget ?? CHAR_BUDGET;
  let working: T[] = messages.slice();
  let chars = countChars(working);

  if (chars <= budget) {
    return { messages: working, actions: [], estimatedChars: chars };
  }

  let droppedPairs = 0;
  while (chars > budget) {
    const lastUser = lastUserIndex(working);
    if (lastUser <= 0) break; // only the current prompt left → nothing safe to drop
    const dropIdx = firstDroppablePairIndex(working, lastUser);
    if (dropIdx === -1) break;
    // Drop the pair: the user message at dropIdx + everything until the
    // next user message (its assistant reply + any tool results).
    let end = dropIdx + 1;
    while (end < working.length && working[end].role !== 'user') end++;
    working = [...working.slice(0, dropIdx), ...working.slice(end)];
    droppedPairs++;
    chars = countChars(working);
  }

  const actions: ContextGuardAction[] =
    droppedPairs > 0 ? [{ kind: 'dropped_oldest_pairs', count: droppedPairs }] : [];

  return { messages: working, actions, estimatedChars: chars };
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Total character count across all messages — role + content (string
 *  or stringified object) + tool_calls + tool_call_id + a small envelope
 *  overhead per message. */
export function countChars<T extends NormalizableMessage>(messages: readonly T[]): number {
  let n = 0;
  for (const m of messages) n += charsOf(m);
  return n;
}

function charsOf(m: NormalizableMessage): number {
  let n = (m.role?.length ?? 0) + 8; // role + JSON envelope overhead
  if (typeof m.content === 'string') {
    n += m.content.length;
  } else if (m.content != null) {
    n += safeStringify(m.content).length;
  }
  if (m.tool_calls && Array.isArray(m.tool_calls)) {
    n += safeStringify(m.tool_calls).length;
  }
  if (typeof m.tool_call_id === 'string') n += m.tool_call_id.length + 16;
  return n;
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return '[unserializable]';
  }
}

/** Index of the most recent (rightmost) user message. -1 if none. */
function lastUserIndex(messages: readonly NormalizableMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return i;
  }
  return -1;
}

/** Find the index of the OLDEST user message that's safe to drop —
 *  anything before the last user message (the current prompt).
 *  Returns -1 if nothing is droppable. */
function firstDroppablePairIndex(
  messages: readonly NormalizableMessage[],
  lastUserIdx: number,
): number {
  for (let i = 0; i < lastUserIdx; i++) {
    if (messages[i].role === 'user') return i;
  }
  return -1;
}
