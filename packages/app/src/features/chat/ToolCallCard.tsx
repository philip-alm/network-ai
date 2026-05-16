'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  ChevronDown,
} from 'lucide-react';
import { parseToolResult, type ToolCardKind } from '../../lib/agent';
import { useNetworkStore } from '../../lib/store';
import type { AgentToolInvocation } from '../../lib/agent';

/**
 * ToolCallCard — renders a single tool invocation as a structured card.
 *
 * Two layers:
 *  - **Header**: compact, glanceable pill (the existing card shapes)
 *  - **Details panel**: click to expand — shows the actual args, the
 *    SQL or query terms, and a structured rendering of the result rows.
 *    The pills alone are too opaque; the details panel is what makes
 *    the chat trustworthy + auditable.
 *
 * Header shapes:
 *  - Running: pulsing accent dot + humanized "Searching 'X'…" text.
 *  - Read (query / search / find): subtle inline pill with summary.
 *  - Action (added / updated / deleted): card with icon + verb + name
 *    + optional timing tail + "Jump to ↗" button.
 *  - Error: danger-tinted with the hint (NOT expandable — already verbose).
 */
export function ToolCallCard({ call }: { call: AgentToolInvocation }) {
  const jumpTo = useNetworkStore((s) => s.actions.jumpTo);
  const [expanded, setExpanded] = useState(false);
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

  const expandable = parsed != null && parsed.kind !== 'error';

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-1"
    >
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <CardContent parsed={parsed} call={call} jumpTo={jumpTo} />
        </div>
        {expandable ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Hide details' : 'Show details'}
            data-testid="tool-expand-toggle"
            className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-faint transition-colors hover:bg-surface-soft hover:text-muted"
          >
            <ChevronDown
              size={12}
              className={`transition-transform duration-200 ease-out ${expanded ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {expanded && expandable ? (
          <motion.div
            key="details"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
            className="overflow-hidden"
          >
            <ToolDetails call={call} parsed={parsed} />
          </motion.div>
        ) : null}
      </AnimatePresence>
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
    return (
      <div className="inline-flex max-w-full items-center gap-2 rounded-md bg-surface-soft px-2.5 py-1 text-xs">
        <Icon size={12} className="shrink-0 text-muted" aria-hidden />
        <span className="text-muted">
          {parsed.kind === 'search' ? 'Searched' : 'Queried'} ·{' '}
          <span className="mono text-fg">
            {parsed.count} {parsed.count === 1 ? 'row' : 'rows'}
          </span>
        </span>
        {timing ? <span className="mono text-faint">· {timing}</span> : null}
      </div>
    );
  }

  if (parsed.kind === 'find') {
    const total = parsed.contactsCount + parsed.assetsCount;
    const previews = [...parsed.contactPreviews, ...parsed.assetPreviews];
    return (
      <div className="inline-flex max-w-full items-center gap-2 rounded-md bg-surface-soft px-2.5 py-1 text-xs">
        <Search size={12} className="shrink-0 text-muted" aria-hidden />
        <span className="min-w-0 truncate text-muted">
          <span className="text-fg/85">Found</span>{' '}
          <span className="mono text-fg">
            {parsed.contactsCount} {parsed.contactsCount === 1 ? 'contact' : 'contacts'}
            {parsed.assetsCount > 0 ? (
              <>
                {', '}
                {parsed.assetsCount} {parsed.assetsCount === 1 ? 'asset' : 'assets'}
              </>
            ) : null}
          </span>
          {total === 0 ? (
            <span className="text-faint"> — nothing matched</span>
          ) : previews.length > 0 ? (
            <>
              {' '}
              <span className="text-fg/85">
                {previews.slice(0, 3).join(', ')}
                {previews.length < total ? (
                  <span className="text-faint"> +{total - previews.length} more</span>
                ) : null}
              </span>
            </>
          ) : null}
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
          onClick={(e) => {
            e.stopPropagation();
            jumpTo(action.jumpId!);
          }}
          className="inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs text-muted transition-colors hover:bg-bg hover:text-accent"
        >
          Jump to
          <ArrowUpRight size={11} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Expanded details panel: per-kind renderer for the auditable view
// ─────────────────────────────────────────────────────────────────

function ToolDetails({ call, parsed }: { call: AgentToolInvocation; parsed: ToolCardKind | null }) {
  return (
    <div className="mt-1 space-y-3 rounded-md border border-border-soft bg-bg/40 p-3 text-xs">
      <ArgsBlock name={call.name} args={call.args} />
      <ResultBlock name={call.name} result={call.result} parsed={parsed} />
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[10px] font-mono uppercase tracking-wider text-faint">
      {children}
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mono overflow-x-auto rounded-sm bg-surface-soft px-2.5 py-1.5 text-[11px] leading-relaxed text-fg/85">
      {children}
    </pre>
  );
}

function ArgsBlock({ name, args }: { name: string; args: unknown }) {
  if (name === 'query_sql' || name === 'mutate_sql') {
    const sql = ((args as { sql?: string } | undefined)?.sql ?? '').trim();
    return (
      <div>
        <SectionLabel>SQL</SectionLabel>
        <CodeBlock>{sql}</CodeBlock>
      </div>
    );
  }
  if (name === 'find') {
    const a = (args ?? {}) as {
      queries?: string[];
      contains?: string;
      regex?: string;
      table?: string;
      required_tags?: string[];
      any_tags?: string[];
      min_warmth?: number;
      max_warmth?: number;
      city?: string;
      has_assets?: boolean;
      recent_days?: number;
      limit?: number;
    };
    const filterChips: Array<[string, string]> = [];
    if (a.table) filterChips.push(['table', a.table]);
    if (a.required_tags?.length) filterChips.push(['required_tags', a.required_tags.join(',')]);
    if (a.any_tags?.length) filterChips.push(['any_tags', a.any_tags.join(',')]);
    if (a.min_warmth != null) filterChips.push(['min_warmth', String(a.min_warmth)]);
    if (a.max_warmth != null) filterChips.push(['max_warmth', String(a.max_warmth)]);
    if (a.city) filterChips.push(['city', a.city]);
    if (a.has_assets != null) filterChips.push(['has_assets', String(a.has_assets)]);
    if (a.recent_days != null) filterChips.push(['recent_days', `${a.recent_days}d`]);
    if (a.limit != null) filterChips.push(['limit', String(a.limit)]);

    return (
      <div className="space-y-2">
        {a.queries?.length ? (
          <div>
            <SectionLabel>queries</SectionLabel>
            <div className="flex flex-wrap gap-1">
              {a.queries.map((q, i) => (
                <span
                  key={i}
                  className="mono rounded-sm bg-surface-soft px-1.5 py-0.5 text-[11px] text-fg/85"
                >
                  {q}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {a.contains ? (
          <div>
            <SectionLabel>contains</SectionLabel>
            <CodeBlock>{a.contains}</CodeBlock>
          </div>
        ) : null}
        {a.regex ? (
          <div>
            <SectionLabel>regex</SectionLabel>
            <CodeBlock>{a.regex}</CodeBlock>
          </div>
        ) : null}
        {filterChips.length > 0 ? (
          <div>
            <SectionLabel>filters</SectionLabel>
            <div className="flex flex-wrap gap-1">
              {filterChips.map(([k, v]) => (
                <span
                  key={k}
                  className="mono inline-flex items-baseline gap-1 rounded-sm bg-surface-soft px-1.5 py-0.5 text-[11px]"
                >
                  <span className="text-faint">{k}:</span>
                  <span className="text-fg/85">{v}</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }
  return null;
}

function ResultBlock({
  result,
  parsed,
}: {
  name: string;
  result: unknown;
  parsed: ToolCardKind | null;
}) {
  if (!parsed) return null;

  if (parsed.kind === 'find') {
    const data = (
      result as { data?: { contacts?: ContactHit[]; assets?: AssetHit[]; debug?: unknown } } | null
    )?.data;
    return (
      <div className="space-y-3">
        {data?.contacts && data.contacts.length > 0 ? (
          <div>
            <SectionLabel>contacts · {data.contacts.length}</SectionLabel>
            <ul className="space-y-0.5">
              {data.contacts.map((c) => (
                <HitRow
                  key={c.id}
                  name={c.name}
                  meta={[c.warmth != null ? `warmth ${c.warmth}` : null, c.city]}
                  matched={c._matched}
                  score={c._score}
                />
              ))}
            </ul>
          </div>
        ) : null}
        {data?.assets && data.assets.length > 0 ? (
          <div>
            <SectionLabel>assets · {data.assets.length}</SectionLabel>
            <ul className="space-y-0.5">
              {data.assets.map((a) => (
                <HitRow
                  key={a.id}
                  name={a.name}
                  meta={[a.availability ?? null, a._contact_name ? `→ ${a._contact_name}` : null]}
                  matched={a._matched}
                  score={a._score}
                />
              ))}
            </ul>
          </div>
        ) : null}
        {data?.debug ? (
          <div>
            <SectionLabel>debug</SectionLabel>
            <CodeBlock>{JSON.stringify(data.debug, null, 2)}</CodeBlock>
          </div>
        ) : null}
      </div>
    );
  }

  if (parsed.kind === 'query' || parsed.kind === 'search') {
    const data = (result as { data?: { rows?: unknown } } | null)?.data;
    const rows = Array.isArray(data)
      ? data
      : ((data as { rows?: unknown[] } | undefined)?.rows ?? []);
    return (
      <div>
        <SectionLabel>rows · {Array.isArray(rows) ? rows.length : 0}</SectionLabel>
        <CodeBlock>{JSON.stringify(rows, null, 2)}</CodeBlock>
      </div>
    );
  }

  // Action cards: just show the affected row dump as JSON
  if (
    parsed.kind === 'contact_added' ||
    parsed.kind === 'contact_updated' ||
    parsed.kind === 'contact_deleted'
  ) {
    return (
      <div>
        <SectionLabel>row</SectionLabel>
        <CodeBlock>{JSON.stringify(parsed.contact, null, 2)}</CodeBlock>
      </div>
    );
  }
  if (
    parsed.kind === 'asset_added' ||
    parsed.kind === 'asset_updated' ||
    parsed.kind === 'asset_deleted'
  ) {
    return (
      <div>
        <SectionLabel>row</SectionLabel>
        <CodeBlock>{JSON.stringify(parsed.asset, null, 2)}</CodeBlock>
      </div>
    );
  }

  return null;
}

function HitRow({
  name,
  meta,
  matched,
  score,
}: {
  name: string;
  meta: Array<string | null>;
  matched?: string[];
  score?: number;
}) {
  const metaText = meta.filter(Boolean).join(' · ');
  return (
    <li className="flex items-baseline gap-2 truncate text-fg/90">
      <span className="font-medium">{name}</span>
      {metaText ? <span className="truncate text-muted">{metaText}</span> : null}
      {matched && matched.length > 0 ? (
        <span className="mono shrink-0 text-faint">[{matched.join(',')}]</span>
      ) : null}
      {score != null ? (
        <span className="mono ml-auto shrink-0 text-faint">{score.toFixed(2)}</span>
      ) : null}
    </li>
  );
}

type ContactHit = {
  id: string;
  name: string;
  warmth: number | null;
  city: string | null;
  _score?: number;
  _matched?: string[];
};

type AssetHit = {
  id: string;
  name: string;
  availability: string | null;
  _contact_name?: string;
  _score?: number;
  _matched?: string[];
};

/**
 * Humanize a running tool call into "Searching 'foo'…" / "Writing…" style.
 *
 * For find we pluck the candidate terms; for mutate_sql we read the first
 * verb of the SQL to disambiguate insert / update / delete.
 */
function runningCopy(name: string, args: unknown): string {
  if (name === 'find') {
    const a = (args ?? {}) as {
      queries?: string[];
      contains?: string;
      regex?: string;
      table?: string;
      city?: string;
      any_tags?: string[];
    };
    const qs = a.queries?.filter(Boolean) ?? [];
    const hint =
      (qs.length > 0 ? `“${truncate(qs.join(', '), 40)}”` : '') ||
      (a.contains ? `“${truncate(a.contains, 40)}”` : '') ||
      (a.regex ? `/${truncate(a.regex, 32)}/` : '') ||
      (a.city ? `in ${a.city}` : '') ||
      (a.any_tags?.length ? `tags: ${a.any_tags.slice(0, 2).join(', ')}` : '');
    return hint ? `Searching ${hint}…` : 'Searching network…';
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
