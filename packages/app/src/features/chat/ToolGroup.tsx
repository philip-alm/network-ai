'use client';

import { motion } from 'motion/react';
import { Search, Database } from 'lucide-react';
import { parseToolResult } from '../../lib/agent';
import type { AgentToolInvocation } from '../../lib/agent';

/**
 * ToolGroup — renders N consecutive read tool calls (search_*, query_sql)
 * as a single compact line so a parallel five-name lookup doesn't render
 * as five identical "Searched · 0 rows" pills stacked vertically.
 *
 * Mixed kinds are kept separate by the caller (see groupReadTools below);
 * this component receives a uniform-kind batch.
 */
export function ToolGroup({ calls }: { calls: AgentToolInvocation[] }) {
  const allDone = calls.every((c) => c.result != null);

  if (calls.length === 1) {
    // Defer to the regular ToolCallCard. Caller normally only routes 2+
    // through ToolGroup, but be safe.
    return null;
  }

  const kind = readKindFor(calls[0]);
  const Icon = kind === 'search' ? Search : Database;

  const totalRows = calls.reduce((acc, c) => {
    const parsed = c.result != null ? parseToolResult(c.name, c.args, c.result) : null;
    if (parsed && (parsed.kind === 'search' || parsed.kind === 'query')) {
      return acc + parsed.count;
    }
    return acc;
  }, 0);

  const queries = calls.map((c) => readQuery(c.name, c.args)).filter((q): q is string => !!q);

  const verb = kind === 'search' ? 'Searched' : 'Queried';

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
      className="inline-flex max-w-full items-center gap-2 rounded-md bg-surface-soft px-2.5 py-1 text-xs"
    >
      {allDone ? (
        <Icon size={12} className="shrink-0 text-muted" aria-hidden />
      ) : (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-50" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
      )}
      <span className="min-w-0 truncate text-muted">
        {allDone ? verb : verb.replace(/ed$/, 'ing')}{' '}
        {queries.length > 0 ? (
          <>
            <span className="text-fg/90">{summarizeQueries(queries)}</span>{' '}
          </>
        ) : null}
        <span className="mono text-faint">
          ·{' '}
          <span className="text-fg/85">
            {calls.length} {calls.length === 1 ? 'call' : 'calls'}
          </span>
          {allDone ? (
            <>
              {' · '}
              <span className="text-fg">
                {totalRows} {totalRows === 1 ? 'row' : 'rows'}
              </span>
            </>
          ) : null}
        </span>
      </span>
    </motion.div>
  );
}

function readKindFor(c: AgentToolInvocation): 'search' | 'query' {
  if (c.name === 'find') return 'search';
  return 'query';
}

function readQuery(name: string, args: unknown): string | null {
  if (name === 'find') {
    const a = (args ?? {}) as { queries?: string[]; contains?: string };
    const qs = a.queries?.filter(Boolean) ?? [];
    if (qs.length > 0) return qs.slice(0, 3).join(', ');
    if (a.contains) return a.contains;
    return null;
  }
  return null;
}

function summarizeQueries(qs: string[]): string {
  if (qs.length <= 2) return qs.map((q) => `“${trunc(q, 30)}”`).join(', ');
  const head = qs.slice(0, 2).map((q) => `“${trunc(q, 26)}”`);
  return `${head.join(', ')}, +${qs.length - 2} more`;
}

function trunc(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Walk a tool-invocation list and group consecutive read-only kinds into
 * single batches. Action kinds (insert/update/delete) and mixed-kind
 * boundaries break the group.
 *
 * Returns a list of { kind: 'single' | 'group', items }.
 */
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
