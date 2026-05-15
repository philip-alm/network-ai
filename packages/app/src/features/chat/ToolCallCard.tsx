'use client';

import { motion } from 'motion/react';
import {
  CheckCircle2,
  AlertCircle,
  UserPlus,
  UserMinus,
  Edit3,
  Briefcase,
  Search,
  Database,
  ArrowUpRight,
} from 'lucide-react';
import { parseToolResult, type ToolCardKind } from '../../lib/agent';
import { useNetworkStore } from '../../lib/store';
import type { AgentToolInvocation } from '../../lib/agent';

/**
 * ToolCallCard — renders a single tool invocation as a structured card.
 *
 * Three shapes:
 *  - Running: pulsing accent dot + humanized "Searching 'X'…" text.
 *    Reads `args` so the user sees what the agent is actually doing,
 *    not a bare tool identifier.
 *  - Read (query / search): subtle inline pill with query + row count.
 *  - Action (added / updated / deleted): card with icon + verb + entity
 *    name + optional timing tail + "Jump to ↗" button.
 *  - Error: danger-tinted with the hint.
 */
export function ToolCallCard({ call }: { call: AgentToolInvocation }) {
  const jumpTo = useNetworkStore((s) => s.actions.jumpTo);
  const isRunning = call.result == null;
  const parsed = !isRunning ? parseToolResult(call.name, call.args, call.result) : null;

  if (isRunning) {
    return (
      <motion.div
        layout="position"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
        className="inline-flex items-center gap-2 rounded-md bg-surface-soft px-2.5 py-1 text-xs"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-50" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
        <span className="text-muted">{runningCopy(call.name, call.args)}</span>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <CardContent parsed={parsed} call={call} jumpTo={jumpTo} />
    </motion.div>
  );
}

function CardContent({
  parsed,
  call,
  jumpTo,
}: {
  parsed: ToolCardKind | null;
  call: AgentToolInvocation;
  jumpTo: (id: string) => void;
}) {
  const timing = call.durationMs != null ? `${call.durationMs}ms` : null;

  if (!parsed) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md bg-surface-soft px-2.5 py-1 text-xs">
        <CheckCircle2 size={12} className="text-muted" aria-hidden />
        <span className="mono text-muted">{call.name}</span>
        {timing ? <span className="mono text-faint">· {timing}</span> : null}
      </div>
    );
  }

  if (parsed.kind === 'error') {
    return (
      <div className="flex items-start gap-2.5 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-xs">
        <AlertCircle size={14} className="mt-0.5 shrink-0 text-danger" aria-hidden />
        <div className="space-y-0.5">
          <div className="font-medium text-danger">{call.name} failed</div>
          <div className="text-fg/80">{parsed.error}</div>
          {parsed.hint ? <div className="text-muted">{parsed.hint}</div> : null}
        </div>
      </div>
    );
  }

  if (parsed.kind === 'query' || parsed.kind === 'search') {
    const Icon = parsed.kind === 'search' ? Search : Database;
    const queryText = readQueryText(call.name, call.args);
    return (
      <div className="inline-flex max-w-full items-center gap-2 rounded-md bg-surface-soft px-2.5 py-1 text-xs">
        <Icon size={12} className="shrink-0 text-muted" aria-hidden />
        <span className="text-muted">
          {parsed.kind === 'search' ? 'Searched' : 'Queried'}
          {queryText ? (
            <>
              {' '}
              <span className="text-fg/90">&ldquo;{queryText}&rdquo;</span>
            </>
          ) : null}{' '}
          ·{' '}
          <span className="mono text-fg">
            {parsed.count} {parsed.count === 1 ? 'row' : 'rows'}
          </span>
        </span>
        {timing ? <span className="mono text-faint">· {timing}</span> : null}
      </div>
    );
  }

  // Action cards (contact / asset added / updated / deleted)
  const action = actionFor(parsed);
  return (
    <div className="flex items-center gap-3 rounded-md bg-surface-soft px-3 py-2 text-sm shadow-hairline-soft">
      <action.Icon size={14} className={`shrink-0 ${action.iconClass}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="truncate text-fg">
          <span className="text-muted">{action.verb}</span>{' '}
          <span className="font-medium">{action.name}</span>
          {action.detail ? <span className="text-muted"> · {action.detail}</span> : null}
        </div>
      </div>
      {timing ? <span className="mono text-xs text-faint">{timing}</span> : null}
      {action.jumpId ? (
        <button
          type="button"
          onClick={() => jumpTo(action.jumpId!)}
          className="inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs text-muted transition-colors hover:bg-bg hover:text-accent"
        >
          Jump to
          <ArrowUpRight size={11} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Humanize a running tool call into "Searching 'foo'…" / "Writing…" style.
 *
 * For search_* we pluck the `query` arg; for mutate_sql we read the first
 * verb of the SQL to disambiguate insert / update / delete (so the user
 * doesn't see `mutate_sql` flashing through).
 */
function runningCopy(name: string, args: unknown): string {
  if (name === 'search_contacts' || name === 'search_assets') {
    const q = (args as { query?: string } | undefined)?.query;
    return q ? `Searching “${truncate(q, 50)}”…` : 'Searching…';
  }
  if (name === 'query_sql') return 'Reading database…';
  if (name === 'mutate_sql') {
    const sql = ((args as { sql?: string } | undefined)?.sql ?? '').trim().toLowerCase();
    if (sql.startsWith('insert')) return 'Writing new row…';
    if (sql.startsWith('update') && sql.includes('deleted_at')) return 'Removing row…';
    if (sql.startsWith('update')) return 'Updating row…';
    if (sql.startsWith('delete')) return 'Removing row…';
    return 'Writing…';
  }
  return `${name}…`;
}

function readQueryText(name: string, args: unknown): string | null {
  if (name === 'search_contacts' || name === 'search_assets') {
    const q = (args as { query?: string } | undefined)?.query;
    return q ? truncate(q, 40) : null;
  }
  return null;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function actionFor(parsed: ToolCardKind) {
  switch (parsed.kind) {
    case 'contact_added':
      return {
        Icon: UserPlus,
        iconClass: 'text-accent',
        verb: 'Added',
        name: parsed.contact.name,
        detail: warmthDetail(parsed.contact.warmth, parsed.contact.city),
        jumpId: parsed.contact.id,
      };
    case 'contact_updated':
      return {
        Icon: Edit3,
        iconClass: 'text-muted',
        verb: 'Updated',
        name: parsed.contact.name,
        detail: parsed.fields.length > 0 ? parsed.fields.join(', ') : 'fields',
        jumpId: parsed.contact.id,
      };
    case 'contact_deleted':
      return {
        Icon: UserMinus,
        iconClass: 'text-danger',
        verb: 'Deleted',
        name: parsed.contact.name,
        detail: '',
        jumpId: undefined,
      };
    case 'asset_added':
      return {
        Icon: Briefcase,
        iconClass: 'text-accent',
        verb: 'Added asset',
        name: parsed.asset.name,
        detail: parsed.asset.availability ?? '',
        jumpId: parsed.asset.contact_id ?? undefined,
      };
    case 'asset_updated':
      return {
        Icon: Edit3,
        iconClass: 'text-muted',
        verb: 'Updated asset',
        name: parsed.asset.name,
        detail: parsed.fields.length > 0 ? parsed.fields.join(', ') : 'fields',
        jumpId: parsed.asset.contact_id ?? undefined,
      };
    case 'asset_deleted':
      return {
        Icon: UserMinus,
        iconClass: 'text-danger',
        verb: 'Deleted asset',
        name: parsed.asset.name,
        detail: '',
        jumpId: undefined,
      };
    default:
      return {
        Icon: CheckCircle2,
        iconClass: 'text-muted',
        verb: '',
        name: '',
        detail: '',
        jumpId: undefined,
      };
  }
}

function warmthDetail(warmth: number | null, city: string | null): string {
  const parts: string[] = [];
  if (warmth != null) parts.push(`warmth ${warmth}`);
  if (city) parts.push(city);
  return parts.join(' · ');
}
