'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertCircle,
  ArrowUpRight,
  Briefcase,
  Database,
  Edit3,
  Eraser,
  Layers,
  Pin,
  Search,
  SlidersHorizontal,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { parseToolResult, type ToolCardKind } from '../../lib/agent';
import { useNavigateToRow } from '../contacts/useNavigateToRow';
import { MentionPill } from './MentionPill';
import type { AgentToolInvocation } from '../../lib/agent';
import { ToolCardExpanded } from './ToolCardExpanded';
import { CardIndicator, CardRow, CardShell, ExpandToggle, RunningIndicator } from './toolCardShell';
import {
  closedHeadline,
  formatDuration,
  paneSubActionsWithSort,
  runningCopy,
  type Headline,
} from './toolCardCopy';

/**
 * ToolCallCard — one tool invocation as a structured chat card.
 *
 * Visual model (from the shape brief, 2026-05-16):
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ [ind]  Verb phrase · qualifier · count           [v]    │  ← closed shell
 *   │        [Mention pill], [Mention pill], …                 │
 *   ╞══════════════════════════════════════════════════════════╡  ← hairline (when expanded)
 *   │        WHAT THE AGENT ASKED                             │
 *   │        keywords / intent / filters (or SQL)             │
 *   │                                                          │
 *   │        RESULT                                            │
 *   │        top rows, count, pane summary                    │
 *   │                                                          │
 *   │        [Undo this change]  ← pane mutations only        │
 *   └──────────────────────────────────────────────────────────┘
 *
 *   Indicator slot:
 *     - READ (find, query_sql): outline icon in accent-soft pill.
 *     - WRITE (set_panel, clear_panel, mutate_sql write): solid
 *       Brand Amber pill ("the agent did this"). Rare per moment —
 *       only fires when the agent authored a change to your world.
 *     - RUNNING: pulsing amber dot replaces the icon, no chevron.
 *     - ERROR: warning-tinted pill, no chevron, no expand.
 *     - DELETE: danger-tinted pill (only context where danger fires).
 *
 * The closed state is the receipt; the expanded state is the audit
 * trail + the rewind. Both are designed to add real value to a
 * founder reading the chat to understand what the AI did.
 */
export function ToolCallCard({ call }: { call: AgentToolInvocation }) {
  const isRunning = call.result == null;
  if (isRunning) return <RunningCard call={call} />;
  const parsed = parseToolResult(call.name, call.args, call.result);
  if (!parsed) return null;
  return <ResolvedCard call={call} parsed={parsed} />;
}

// ─────────────────────────────────────────────────────────────────
// Card variants — running vs resolved. Shell + row primitives live
// in `toolCardShell.tsx` so `ToolGroup` shares them.
// ─────────────────────────────────────────────────────────────────

function RunningCard({ call }: { call: AgentToolInvocation }) {
  return (
    <CardShell>
      <CardRow
        indicator={<RunningIndicator />}
        headline={<span className="text-muted">{runningCopy(call.name, call.args)}</span>}
      />
    </CardShell>
  );
}

function ResolvedCard({ call, parsed }: { call: AgentToolInvocation; parsed: ToolCardKind }) {
  const expandable = parsed.kind !== 'error';
  const [expanded, setExpanded] = useState(false);
  const indicator = indicatorFor(parsed);
  const headline = closedHeadline(parsed);
  const samples = sampleMentionsFor(parsed);
  const timing = call.durationMs != null ? formatDuration(call.durationMs) : null;
  const jump = jumpButtonFor(parsed);

  return (
    <CardShell>
      <CardRow
        indicator={indicator}
        headline={<HeadlineText h={headline} parsed={parsed} call={call} />}
        subline={samples.length > 0 ? <SampleRow samples={samples} /> : null}
        tail={timing}
        action={jump}
        chevron={
          expandable ? (
            <ExpandToggle expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
          ) : null
        }
      />

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
            <ToolCardExpanded call={call} parsed={parsed} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </CardShell>
  );
}

// ─────────────────────────────────────────────────────────────────
// Indicator: icon pill or amber-dot pill
// ─────────────────────────────────────────────────────────────────

type IndicatorKind = 'read' | 'write' | 'delete' | 'error';

function indicatorFor(parsed: ToolCardKind): React.ReactNode {
  const kind: IndicatorKind = indicatorKindFor(parsed);
  const Icon = iconFor(parsed);
  return (
    <CardIndicator className={pillClassFor(kind)}>
      <Icon size={12} aria-hidden />
    </CardIndicator>
  );
}

function indicatorKindFor(parsed: ToolCardKind): IndicatorKind {
  if (parsed.kind === 'error') return 'error';
  if (parsed.kind === 'contact_deleted' || parsed.kind === 'asset_deleted') return 'delete';
  // Write kinds (the agent authored a change to user-visible state).
  if (
    parsed.kind === 'panel_set' ||
    parsed.kind === 'panel_cleared' ||
    parsed.kind === 'contact_added' ||
    parsed.kind === 'asset_added' ||
    parsed.kind === 'contact_updated' ||
    parsed.kind === 'asset_updated'
  ) {
    return 'write';
  }
  return 'read';
}

function iconFor(parsed: ToolCardKind): LucideIcon {
  switch (parsed.kind) {
    case 'find':
      return Search;
    case 'query':
    case 'search':
      return Database;
    case 'panel_set':
      return panelSetIconFor(parsed);
    case 'panel_cleared':
      return Eraser;
    case 'contact_added':
      return UserPlus;
    case 'contact_updated':
    case 'asset_updated':
      return Edit3;
    case 'contact_deleted':
      return UserMinus;
    case 'asset_added':
      return Briefcase;
    case 'asset_deleted':
      return Briefcase;
    case 'error':
      return AlertCircle;
    default:
      return Database;
  }
}

function panelSetIconFor(p: Extract<ToolCardKind, { kind: 'panel_set' }>): LucideIcon {
  const pinnedOnly =
    p.pinnedContactIds.length + p.pinnedAssetIds.length > 0 &&
    p.facets.length === 0 &&
    !p.search &&
    !p.view;
  if (pinnedOnly) return Pin;
  const viewOnly =
    !!p.view &&
    p.facets.length === 0 &&
    !p.search &&
    p.pinnedContactIds.length + p.pinnedAssetIds.length === 0;
  if (viewOnly) return Layers;
  return SlidersHorizontal;
}

function pillClassFor(kind: IndicatorKind): string {
  // Write = solid Brand Amber pill (the rarity-per-moment rule applies:
  // amber lights up SPECIFICALLY when the system says "the agent did
  // this to your world"). Read = soft accent (background detail).
  // Delete = danger-soft (only place danger fires). Error = warning.
  switch (kind) {
    case 'write':
      return 'bg-accent text-bg';
    case 'delete':
      return 'bg-danger/10 text-danger';
    case 'error':
      return 'bg-warning/15 text-warning';
    case 'read':
    default:
      return 'bg-accent-soft text-accent';
  }
}

// ─────────────────────────────────────────────────────────────────
// Headline text composition
// ─────────────────────────────────────────────────────────────────

function HeadlineText({
  h,
  parsed,
  call,
}: {
  h: Headline;
  parsed: ToolCardKind;
  call: AgentToolInvocation;
}) {
  // For compound panel_set calls we want the sub-actions row to live
  // INSIDE the headline when there's no other better place for them.
  const detail = panelSetDetail(parsed, call) || h.detail;
  if (parsed.kind === 'error') {
    return (
      <span className="text-fg">
        <span className="font-medium text-warning">{h.verb}</span>
        {detail ? <span className="text-muted"> {detail}</span> : null}
      </span>
    );
  }
  return (
    <span className="text-fg">
      <span className="text-muted">{h.verb}</span>
      {h.subject ? <span className="ml-1 font-medium">{h.subject}</span> : null}
      {detail ? <span className="text-muted"> · {detail}</span> : null}
      {h.count ? <span className="text-faint"> · {h.count}</span> : null}
    </span>
  );
}

function panelSetDetail(parsed: ToolCardKind, call: AgentToolInvocation): string {
  if (parsed.kind !== 'panel_set') return '';
  const args = (call.args ?? {}) as { contactSort?: string; assetSort?: string };
  const actions = paneSubActionsWithSort(parsed, args.contactSort, args.assetSort);
  // Only show the sub-actions detail when we're rendering the compound
  // headline (`Updated the pane.` with no subject). Single-action set_panel
  // calls already say what they did in the verb itself.
  if (actions.length <= 1) return '';
  return actions.join(', ');
}

// ─────────────────────────────────────────────────────────────────
// Mention pills row (samples)
// ─────────────────────────────────────────────────────────────────

type Sample = { kind: 'contact' | 'asset'; id: string; name: string };

function sampleMentionsFor(parsed: ToolCardKind): Sample[] {
  if (parsed.kind === 'find') {
    return [
      ...parsed.contactSamples.slice(0, 4).map((s) => ({ kind: 'contact' as const, ...s })),
      ...parsed.assetSamples.slice(0, 4).map((s) => ({ kind: 'asset' as const, ...s })),
    ].slice(0, 5);
  }
  if (parsed.kind === 'panel_set' && parsed.sample) {
    return [
      ...parsed.sample.contacts.slice(0, 4).map((s) => ({ kind: 'contact' as const, ...s })),
      ...parsed.sample.assets.slice(0, 4).map((s) => ({ kind: 'asset' as const, ...s })),
    ].slice(0, 5);
  }
  return [];
}

function SampleRow({ samples }: { samples: Sample[] }) {
  return (
    <span className="inline">
      {samples.map((s, i) => (
        <span key={`${s.kind}-${s.id}`}>
          <MentionPill kind={s.kind} id={s.id}>
            {s.name}
          </MentionPill>
          {i < samples.length - 1 ? <span className="text-faint">, </span> : null}
        </span>
      ))}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────
// "Jump to" button for single-target mutation cards
// ─────────────────────────────────────────────────────────────────

function jumpButtonFor(parsed: ToolCardKind): React.ReactNode {
  const id = singleJumpId(parsed);
  if (!id) return null;
  return <JumpButton id={id} />;
}

function singleJumpId(parsed: ToolCardKind): string | null {
  if (parsed.kind === 'contact_added' || parsed.kind === 'contact_updated') {
    return parsed.contact.id;
  }
  if (parsed.kind === 'asset_added' || parsed.kind === 'asset_updated') {
    // For assets, jumping to the owning contact is more useful than the asset row.
    return parsed.asset.contact_id ?? null;
  }
  return null;
}

function JumpButton({ id }: { id: string }) {
  // singleJumpId always resolves to a CONTACT id (assets route to their
  // owning contact for "Jump to" — that's the row the user wants to see).
  const navigate = useNavigateToRow();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void navigate('contact', id);
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded-sm px-2 py-0.5 text-xs text-muted transition-all duration-[140ms] hover:bg-bg hover:text-accent focus-visible:bg-bg focus-visible:text-accent active:scale-[0.96]"
      style={{
        transitionTimingFunction: 'var(--ease-out)',
        WebkitTapHighlightColor: 'transparent',
      }}
      data-testid="tool-card-jump"
    >
      Jump to
      <ArrowUpRight size={11} aria-hidden />
    </button>
  );
}
