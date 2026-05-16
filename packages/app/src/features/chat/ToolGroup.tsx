'use client';

import { Database, Search } from 'lucide-react';
import { parseToolResult } from '../../lib/agent';
import type { AgentToolInvocation } from '../../lib/agent';
import { CardIndicator, CardRow, CardShell, RunningIndicator } from './toolCardShell';

/**
 * ToolGroup — N consecutive same-kind read tools as ONE card.
 *
 * Reads pile up when the agent does parallel lookups (e.g. two finds
 * over different keyword bundles). Showing them as N stacked cards
 * adds noise; rolling them into one summary keeps chat readable.
 * The shell is the SAME shell ToolCallCard uses — no visual fork.
 *
 * Mixed-kind boundaries (find followed by query_sql) split into two
 * groups; that boundary is meaningful and worth a visual break.
 */
export function ToolGroup({ calls }: { calls: AgentToolInvocation[] }) {
  if (calls.length === 1) return null; // caller normally only routes 2+ here

  const allDone = calls.every((c) => c.result != null);
  const kind = readKindFor(calls[0]);
  const Icon = kind === 'search' ? Search : Database;

  // Aggregate the truth count across all sub-calls. For find, prefer
  // the server-reported `total` (the count the agent uses in chat) so
  // the group card and the agent's narration agree.
  let totalFound = 0;
  for (const c of calls) {
    if (c.result == null) continue;
    const parsed = parseToolResult(c.name, c.args, c.result);
    if (!parsed) continue;
    if (parsed.kind === 'find') totalFound += parsed.contactsTotal + parsed.assetsTotal;
    else if (parsed.kind === 'search' || parsed.kind === 'query') totalFound += parsed.count;
  }

  const verb = allDone ? doneVerb(kind) : runningVerb(kind);
  const count =
    allDone && totalFound > 0
      ? `${totalFound.toLocaleString()} ${totalFound === 1 ? 'result' : 'results'} across ${calls.length} ${calls.length === 1 ? 'lookup' : 'lookups'}`
      : `${calls.length} ${calls.length === 1 ? 'lookup' : 'lookups'}`;

  return (
    <CardShell>
      <CardRow
        indicator={
          allDone ? (
            <CardIndicator className="bg-accent-soft text-accent">
              <Icon size={12} aria-hidden />
            </CardIndicator>
          ) : (
            <RunningIndicator />
          )
        }
        headline={
          <span className="text-fg">
            <span className="text-muted">{verb}</span>
            <span className="text-faint"> · {count}</span>
          </span>
        }
      />
    </CardShell>
  );
}

function doneVerb(kind: 'search' | 'query'): string {
  return kind === 'search' ? 'Searched your network' : 'Looked up details';
}

function runningVerb(kind: 'search' | 'query'): string {
  return kind === 'search' ? 'Searching your network…' : 'Looking up details…';
}

function readKindFor(c: AgentToolInvocation): 'search' | 'query' {
  if (c.name === 'find') return 'search';
  return 'query';
}

// ─────────────────────────────────────────────────────────────────
// Grouping logic (pure, unit-tested) — coalesce consecutive read
// kinds into single batches. Action kinds (insert/update/delete) and
// mixed-kind boundaries break the group. Solo reads stay `single`.
// ─────────────────────────────────────────────────────────────────

export type ToolRun =
  | { kind: 'single'; call: AgentToolInvocation }
  | { kind: 'group'; calls: AgentToolInvocation[] };

export function groupReadTools(calls: AgentToolInvocation[]): ToolRun[] {
  const out: ToolRun[] = [];
  let buffer: AgentToolInvocation[] = [];
  let bufferKind: 'search' | 'query' | null = null;

  const flush = (): void => {
    if (buffer.length === 0) return;
    if (buffer.length === 1) {
      out.push({ kind: 'single', call: buffer[0] });
    } else {
      out.push({ kind: 'group', calls: buffer });
    }
    buffer = [];
    bufferKind = null;
  };

  for (const c of calls) {
    const k = readKindOf(c);
    if (k == null) {
      flush();
      out.push({ kind: 'single', call: c });
      continue;
    }
    if (bufferKind == null || bufferKind === k) {
      buffer.push(c);
      bufferKind = k;
    } else {
      flush();
      buffer = [c];
      bufferKind = k;
    }
  }
  flush();
  return out;
}

function readKindOf(c: AgentToolInvocation): 'search' | 'query' | null {
  if (c.name === 'find') return 'search';
  if (c.name === 'query_sql') return 'query';
  return null;
}
