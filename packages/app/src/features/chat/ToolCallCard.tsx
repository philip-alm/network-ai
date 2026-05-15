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
 * Three shapes based on the parsed result:
 *  - Action card (contact/asset added / updated / deleted): icon + verb +
 *    entity name + "Jump to ↗" button that scrolls + highlights the row.
 *  - Read card (query_sql / search_*): subtle row count.
 *  - Error card: red-tinted with the hint readable.
 *  - Falls back to a tiny mono pill if we can't parse anything useful.
 */
export function ToolCallCard({ call }: { call: AgentToolInvocation }) {
  const jumpTo = useNetworkStore((s) => s.actions.jumpTo);
  const parsed = call.result != null ? parseToolResult(call.name, call.args, call.result) : null;

  const isRunning = call.result === null;

  if (isRunning) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
        className="mb-2 inline-flex items-center gap-2 rounded-md bg-surface-soft px-2.5 py-1 text-xs"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-50" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
        <span className="mono text-muted">{call.name}</span>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="mb-2"
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
  if (!parsed) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md bg-surface-soft px-2.5 py-1 text-xs">
        <CheckCircle2 size={12} className="text-muted" aria-hidden />
        <span className="mono text-muted">{call.name}</span>
        {call.durationMs !== undefined ? (
          <span className="mono text-faint">· {call.durationMs}ms</span>
        ) : null}
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
    return (
      <div className="inline-flex items-center gap-2 rounded-md bg-surface-soft px-2.5 py-1 text-xs">
        <Icon size={12} className="text-muted" aria-hidden />
        <span className="text-muted">
          {parsed.kind === 'search' ? 'Searched' : 'Queried'} ·{' '}
          <span className="mono text-fg">
            {parsed.count} row{parsed.count === 1 ? '' : 's'}
          </span>
        </span>
      </div>
    );
  }

  // Action cards (contact / asset added / updated / deleted)
  const action = actionFor(parsed);
  return (
    <div className="flex items-center gap-3 rounded-md bg-surface-soft px-3 py-2 text-sm shadow-hairline-soft">
      <action.Icon size={14} className={action.iconClass} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-fg">
          <span className="text-muted">{action.verb}</span>{' '}
          <span className="font-medium">{action.name}</span>
          {action.detail ? <span className="text-muted"> · {action.detail}</span> : null}
        </div>
      </div>
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
