'use client';

import { motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';

/**
 * toolCardShell — the visual primitives shared by `ToolCallCard` (single)
 * and `ToolGroup` (multiple consecutive reads). Extracting them here
 * keeps the two card kinds visually identical: shell, indicator slot,
 * headline-row layout, chevron. Diverging visuals would teach the user
 * to read each kind separately, which is exactly what the redesign
 * brief said we won't do.
 */

export function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
      className="rounded-md bg-surface-soft px-3 py-2 text-sm shadow-hairline-soft"
    >
      {children}
    </motion.div>
  );
}

export function CardRow({
  indicator,
  headline,
  subline,
  tail,
  action,
  chevron,
}: {
  indicator: React.ReactNode;
  headline: React.ReactNode;
  subline?: React.ReactNode;
  tail?: React.ReactNode;
  action?: React.ReactNode;
  chevron?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2.5">
        {indicator}
        <span className="min-w-0 flex-1 truncate text-sm">{headline}</span>
        {tail ? <span className="shrink-0 text-[11px] text-faint">{tail}</span> : null}
        {action}
        {chevron}
      </div>
      {subline ? <div className="pl-[34px] text-xs leading-relaxed">{subline}</div> : null}
    </div>
  );
}

/**
 * Indicator pill — the leading 24×24 icon container. The `className`
 * controls the background + text color and is the binary that tells
 * the user at a glance whether this card is a READ (accent-soft) or
 * a WRITE (solid Brand Amber, the "the agent did this" signature).
 */
export function CardIndicator({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${className}`}
    >
      {children}
    </span>
  );
}

export function RunningIndicator() {
  return (
    <CardIndicator className="bg-accent-soft">
      <span className="relative inline-flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
      </span>
    </CardIndicator>
  );
}

export function ExpandToggle({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={expanded ? 'Hide details' : 'Show details'}
      data-testid="tool-expand-toggle"
      className="-mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-faint transition-all duration-[140ms] hover:bg-bg hover:text-muted focus-visible:bg-bg focus-visible:text-muted active:scale-[0.9]"
      style={{
        transitionTimingFunction: 'var(--ease-out)',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <ChevronDown
        size={12}
        className={`transition-transform duration-200 ease-out ${expanded ? 'rotate-180' : ''}`}
        aria-hidden
      />
    </button>
  );
}
