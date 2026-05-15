/**
 * Segment — a single ordered chunk of an assistant turn.
 *
 * The agent produces an interleaved sequence of:
 *   - text   ("Let me check who you know in Stockholm.")
 *   - tool   (search_contacts running → succeeded with 3 rows)
 *   - text   ("Got 3 results. Now checking assets…")
 *   - tool   (search_assets …)
 *   - text   ("Based on what I see, …")
 *
 * The UI renders these in arrival order so the user can SEE the agent
 * think, not just a final answer with a header of unrelated badges.
 */

import type { AgentToolInvocation } from './runAgent';

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; id: string; call: AgentToolInvocation };

export function appendTextDelta(segments: Segment[], delta: string): Segment[] {
  if (!delta) return segments;
  const last = segments[segments.length - 1];
  if (last && last.kind === 'text') {
    return [...segments.slice(0, -1), { kind: 'text', text: last.text + delta }];
  }
  return [...segments, { kind: 'text', text: delta }];
}

export function startToolSegment(
  segments: Segment[],
  call: { id: string; name: string; args: unknown },
): Segment[] {
  // Close any in-flight text segment by appending a new tool segment.
  return [
    ...segments,
    {
      kind: 'tool',
      id: call.id,
      call: { name: call.name, args: call.args, result: null, status: 'ok' },
    },
  ];
}

export function finishToolSegment(
  segments: Segment[],
  patch: AgentToolInvocation & { id: string },
): Segment[] {
  return segments.map((s) =>
    s.kind === 'tool' && s.id === patch.id
      ? {
          ...s,
          call: {
            name: patch.name,
            args: patch.args,
            result: patch.result,
            status: patch.status,
            durationMs: patch.durationMs,
          },
        }
      : s,
  );
}

/** Total text length across all text segments — handy for UI tests. */
export function totalTextLength(segments: Segment[]): number {
  return segments
    .filter((s): s is { kind: 'text'; text: string } => s.kind === 'text')
    .reduce((n, s) => n + s.text.length, 0);
}
