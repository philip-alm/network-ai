'use client';

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { AgentToolInvocation, ToolCardKind } from '../../lib/agent';
import { useNetworkStore } from '../../lib/store';
import { friendlyFindCount, friendlyPaneCount, paneSubActionsWithSort } from './toolCardCopy';

/**
 * ToolCardExpanded — the audit drawer that opens beneath a resolved
 * tool card. Lives ONLY when expanded; the parent uses
 * `<AnimatePresence>` to slide it in/out. Renders three layered
 * sections:
 *
 *   1. "What the agent asked" — the actual call args, in human form.
 *      For `find` we show queries + intent + filters; for `set_panel`
 *      we restate each sub-action plainly; for SQL we show the SQL.
 *   2. "Result" — top rows with name + meta (no JSON dumps); for
 *      mutations, the row that changed.
 *   3. Optional **Undo** button — for pane mutations only. Restores
 *      the prior panel snapshot the store captured before the agent's
 *      change.
 *
 * Design rule honored from the brief: nothing in here SHAPE-SHIFTS the
 * shell. The drawer sits inside the same surface; visual hierarchy is
 * carried by type weight + a single content-column hairline divider,
 * never by nested cards or borders on every section.
 */
export function ToolCardExpanded({
  call,
  parsed,
}: {
  call: AgentToolInvocation;
  parsed: ToolCardKind;
}) {
  return (
    <div className="mt-2 space-y-3 border-t border-border-soft pt-2.5 pl-[34px]">
      <AgentAsked call={call} parsed={parsed} />
      <ResultSummary call={call} parsed={parsed} />
      <UndoSlot parsed={parsed} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// 1. "What the agent asked" — per-kind agent-args renderer.
// ─────────────────────────────────────────────────────────────────

function AgentAsked({ call, parsed }: { call: AgentToolInvocation; parsed: ToolCardKind }) {
  if (parsed.kind === 'find') return <FindArgs args={call.args} />;
  if (parsed.kind === 'panel_set') return <PanelSetArgs call={call} parsed={parsed} />;
  if (parsed.kind === 'panel_cleared') return null; // no args to show
  if (parsed.kind === 'query' || parsed.kind === 'search') return <SqlArgs args={call.args} />;
  if (
    parsed.kind === 'contact_added' ||
    parsed.kind === 'contact_updated' ||
    parsed.kind === 'contact_deleted' ||
    parsed.kind === 'asset_added' ||
    parsed.kind === 'asset_updated' ||
    parsed.kind === 'asset_deleted'
  ) {
    return <SqlArgs args={call.args} />;
  }
  return null;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.06em] text-faint">
      {children}
    </div>
  );
}

function FindArgs({ args }: { args: unknown }) {
  const a = (args ?? {}) as {
    queries?: string[];
    intent?: string;
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
  const filterChips: string[] = [];
  if (a.table && a.table !== 'both') filterChips.push(a.table);
  if (a.city) filterChips.push(`in ${a.city}`);
  if (a.required_tags?.length) filterChips.push(...a.required_tags.map((t) => `+${t}`));
  if (a.any_tags?.length) filterChips.push(...a.any_tags.map((t) => `${t}?`));
  if (a.min_warmth != null) filterChips.push(`warmth ≥ ${a.min_warmth}`);
  if (a.max_warmth != null) filterChips.push(`warmth ≤ ${a.max_warmth}`);
  if (a.has_assets === true) filterChips.push('has assets');
  if (a.has_assets === false) filterChips.push('no assets');
  if (a.recent_days != null) filterChips.push(`last ${a.recent_days}d`);

  return (
    <div className="space-y-2">
      {a.queries?.length ? (
        <div>
          <SectionLabel>Keywords</SectionLabel>
          <div className="flex flex-wrap gap-1">
            {a.queries.map((q, i) => (
              <span
                key={i}
                className="inline-flex items-center rounded-sm bg-bg/40 px-1.5 py-0.5 text-[11px] text-fg"
              >
                {q}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {a.intent ? (
        <div>
          <SectionLabel>Looking for</SectionLabel>
          <p className="text-[12px] leading-relaxed text-fg">“{a.intent}”</p>
        </div>
      ) : null}
      {filterChips.length > 0 ? (
        <div>
          <SectionLabel>Limited to</SectionLabel>
          <div className="flex flex-wrap gap-1">
            {filterChips.map((c) => (
              <span
                key={c}
                className="inline-flex items-center rounded-sm bg-bg/40 px-1.5 py-0.5 text-[11px] text-muted"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PanelSetArgs({
  call,
  parsed,
}: {
  call: AgentToolInvocation;
  parsed: Extract<ToolCardKind, { kind: 'panel_set' }>;
}) {
  const args = (call.args ?? {}) as { contactSort?: string; assetSort?: string };
  const actions = paneSubActionsWithSort(parsed, args.contactSort, args.assetSort);
  if (actions.length === 0) return null;
  return (
    <div>
      <SectionLabel>What changed</SectionLabel>
      <ul className="space-y-0.5 text-[12px] leading-relaxed text-fg">
        {actions.map((label) => (
          <li key={label} className="flex items-baseline gap-2">
            <span aria-hidden className="text-faint">
              ·
            </span>
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SqlArgs({ args }: { args: unknown }) {
  const sql = ((args as { sql?: string } | undefined)?.sql ?? '').trim();
  if (!sql) return null;
  return (
    <div>
      <SectionLabel>SQL</SectionLabel>
      <pre className="mono overflow-x-auto whitespace-pre-wrap break-words rounded-sm bg-bg/40 px-2.5 py-1.5 text-[11px] leading-relaxed text-fg">
        {sql}
      </pre>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// 2. Result summary — per-kind result preview.
// ─────────────────────────────────────────────────────────────────

function ResultSummary({ call, parsed }: { call: AgentToolInvocation; parsed: ToolCardKind }) {
  if (parsed.kind === 'find') return <FindResult call={call} parsed={parsed} />;
  if (parsed.kind === 'panel_set') return <PanelSetResult parsed={parsed} />;
  if (parsed.kind === 'panel_cleared') return <PanelClearedResult parsed={parsed} />;
  if (parsed.kind === 'query' || parsed.kind === 'search') {
    return <QueryResult call={call} parsed={parsed} />;
  }
  if (
    parsed.kind === 'contact_added' ||
    parsed.kind === 'contact_updated' ||
    parsed.kind === 'contact_deleted'
  ) {
    return <ContactResult parsed={parsed} />;
  }
  if (
    parsed.kind === 'asset_added' ||
    parsed.kind === 'asset_updated' ||
    parsed.kind === 'asset_deleted'
  ) {
    return <AssetResult parsed={parsed} />;
  }
  return null;
}

type FindContact = {
  id: string;
  name: string;
  warmth?: number | null;
  city?: string | null;
  _score?: number;
  _matched?: string[];
};
type FindAsset = {
  id: string;
  name: string;
  availability?: string | null;
  _contact_name?: string;
  _score?: number;
  _matched?: string[];
};
type FindResultData = {
  contacts?: FindContact[];
  assets?: FindAsset[];
  total?: { contacts?: number; assets?: number };
};

function FindResult({
  call,
  parsed,
}: {
  call: AgentToolInvocation;
  parsed: Extract<ToolCardKind, { kind: 'find' }>;
}) {
  const data = ((call.result as { data?: FindResultData } | null)?.data ?? {}) as FindResultData;
  const contacts = data.contacts ?? [];
  const assets = data.assets ?? [];
  const summary = friendlyFindCount(parsed);
  return (
    <div className="space-y-2">
      <div>
        <SectionLabel>Result</SectionLabel>
        <p className="text-[12px] text-muted">{summary || 'Nothing matched.'}</p>
      </div>
      {contacts.length > 0 ? (
        <HitList kind="contacts" rows={contacts.slice(0, 8)} more={contacts.length - 8} />
      ) : null}
      {assets.length > 0 ? (
        <HitList kind="assets" rows={assets.slice(0, 8)} more={assets.length - 8} />
      ) : null}
    </div>
  );
}

function HitList({
  kind,
  rows,
  more,
}: {
  kind: 'contacts' | 'assets';
  rows: Array<FindContact | FindAsset>;
  more: number;
}) {
  return (
    <div>
      <SectionLabel>
        Top {rows.length} {kind}
      </SectionLabel>
      <ul className="space-y-0.5">
        {rows.map((r, i) => (
          <HitRow key={`${r.id}-${i}`} row={r} kind={kind} />
        ))}
      </ul>
      {more > 0 ? (
        <p className="mt-1 text-[11px] text-faint">+ {more.toLocaleString()} more not shown</p>
      ) : null}
    </div>
  );
}

function HitRow({ row, kind }: { row: FindContact | FindAsset; kind: 'contacts' | 'assets' }) {
  const meta: string[] = [];
  if (kind === 'contacts') {
    const c = row as FindContact;
    if (c.warmth != null) meta.push(`warmth ${c.warmth}`);
    if (c.city) meta.push(c.city);
  } else {
    const a = row as FindAsset;
    if (a.availability) meta.push(a.availability);
    if (a._contact_name) meta.push(`→ ${a._contact_name}`);
  }
  return (
    <li className="flex items-baseline gap-2 truncate text-[12px] text-fg">
      <span className="truncate font-medium">{row.name}</span>
      {meta.length > 0 ? <span className="truncate text-muted">{meta.join(', ')}</span> : null}
    </li>
  );
}

function PanelSetResult({ parsed }: { parsed: Extract<ToolCardKind, { kind: 'panel_set' }> }) {
  if (!parsed.count) return null;
  return (
    <div>
      <SectionLabel>Pane now shows</SectionLabel>
      <p className="text-[12px] text-fg">{friendlyPaneCount(parsed.count) || 'an empty pane.'}</p>
    </div>
  );
}

function PanelClearedResult({
  parsed,
}: {
  parsed: Extract<ToolCardKind, { kind: 'panel_cleared' }>;
}) {
  if (!parsed.count) return null;
  return (
    <div>
      <SectionLabel>Back to</SectionLabel>
      <p className="text-[12px] text-fg">{friendlyPaneCount(parsed.count)}</p>
    </div>
  );
}

function QueryResult({
  call,
  parsed,
}: {
  call: AgentToolInvocation;
  parsed: Extract<ToolCardKind, { kind: 'query' | 'search' }>;
}) {
  const data = (call.result as { data?: { rows?: unknown } } | null)?.data;
  const rows = Array.isArray(data)
    ? (data as unknown[])
    : ((data as { rows?: unknown[] } | undefined)?.rows ?? []);
  const sample = Array.isArray(rows) ? (rows as Array<Record<string, unknown>>).slice(0, 5) : [];
  return (
    <div>
      <SectionLabel>
        {parsed.count.toLocaleString()} {parsed.count === 1 ? 'row' : 'rows'} returned
      </SectionLabel>
      {sample.length > 0 ? (
        <ul className="space-y-0.5">
          {sample.map((r, i) => (
            <li key={i} className="truncate text-[12px] text-fg">
              {summarizeRow(r)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-muted">No rows.</p>
      )}
      {parsed.count > sample.length ? (
        <p className="mt-1 text-[11px] text-faint">
          + {(parsed.count - sample.length).toLocaleString()} more not shown
        </p>
      ) : null}
    </div>
  );
}

function summarizeRow(row: Record<string, unknown>): string {
  // Prefer name + a short distinguishing field if present.
  const name = typeof row.name === 'string' ? row.name : null;
  if (name) {
    const extras: string[] = [];
    if (typeof row.warmth === 'number') extras.push(`warmth ${row.warmth}`);
    if (typeof row.city === 'string') extras.push(row.city);
    if (typeof row.availability === 'string' && row.availability) extras.push(row.availability);
    return extras.length > 0 ? `${name} · ${extras.join(', ')}` : name;
  }
  // Fall back to id + a count of fields so it's not a noise dump.
  const id = typeof row.id === 'string' ? row.id.slice(0, 8) : '(no id)';
  const fields = Object.keys(row).length;
  return `${id} · ${fields} fields`;
}

function ContactResult({
  parsed,
}: {
  parsed: Extract<ToolCardKind, { kind: 'contact_added' | 'contact_updated' | 'contact_deleted' }>;
}) {
  const c = parsed.contact;
  return (
    <div>
      <SectionLabel>Row</SectionLabel>
      <p className="text-[12px] text-fg">
        <span className="font-medium">{c.name}</span>
        {c.warmth != null ? <span className="text-muted">, warmth {c.warmth}</span> : null}
        {c.city ? <span className="text-muted">, {c.city}</span> : null}
        {c.tags && c.tags.length > 0 ? (
          <span className="text-muted">, tags: {c.tags.slice(0, 4).join(', ')}</span>
        ) : null}
      </p>
    </div>
  );
}

function AssetResult({
  parsed,
}: {
  parsed: Extract<ToolCardKind, { kind: 'asset_added' | 'asset_updated' | 'asset_deleted' }>;
}) {
  const a = parsed.asset;
  return (
    <div>
      <SectionLabel>Row</SectionLabel>
      <p className="text-[12px] text-fg">
        <span className="font-medium">{a.name}</span>
        {a.availability ? <span className="text-muted">, {a.availability}</span> : null}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// 3. Undo button (pane mutations only).
// ─────────────────────────────────────────────────────────────────

function UndoSlot({ parsed }: { parsed: ToolCardKind }) {
  const undoSnapshot = useNetworkStore((s) => s.panelUndoSnapshot);
  const restorePanelState = useNetworkStore((s) => s.actions.restorePanelState);
  const [undone, setUndone] = useState(false);

  // Only pane mutations are reversible via the snapshot. Mutations to
  // contacts/assets are reversible by undoing the soft-delete itself,
  // which lives in the contact undo banner — not here.
  const isPaneWrite = parsed.kind === 'panel_set' || parsed.kind === 'panel_cleared';
  if (!isPaneWrite) return null;
  if (undone) {
    return (
      <p className="text-right text-[11px] text-faint">Undone. The pane is back to where it was.</p>
    );
  }
  // Only show Undo when there's a snapshot to restore (the snapshot is
  // cleared after a user-driven panel change, which means the user has
  // already taken authorship).
  if (!undoSnapshot) {
    return (
      <p className="text-right text-[11px] text-faint">
        You’ve since changed the pane yourself — undo no longer applies.
      </p>
    );
  }
  return (
    <div className="flex items-center justify-end">
      <button
        type="button"
        onClick={() => {
          restorePanelState(undoSnapshot);
          setUndone(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-[11px] font-medium text-muted transition-all duration-[140ms] hover:bg-bg hover:text-fg focus-visible:bg-bg focus-visible:text-fg active:scale-[0.97]"
        style={{
          transitionTimingFunction: 'var(--ease-out)',
          WebkitTapHighlightColor: 'transparent',
        }}
        data-testid="tool-card-undo"
      >
        <RotateCcw size={11} aria-hidden />
        Undo this change
      </button>
    </div>
  );
}
