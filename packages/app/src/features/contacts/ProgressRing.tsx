'use client';

import { WithTooltip } from '../ui';
import type { LoadingPhase } from '../../lib/store';

const SIZE = 12;
const STROKE = 1.5;
const RADIUS = (SIZE - STROKE) / 2; // leave room for the stroke
const CIRC = 2 * Math.PI * RADIUS;

/**
 * ProgressRing — indeterminate circular progress.
 *
 * A gray ring is always visible (so the slot's size is fixed and the
 * surrounding layout never shifts when activity starts or ends). When
 * `active` is true, an accent-colored arc sweeps + fills around the
 * ring continuously — communicates "background work is happening"
 * without making any specific progress claim.
 *
 * Hidden entirely (opacity 0, but still occupies the slot) when
 * inactive, so neighbors don't reflow on phase transitions.
 */
export function ProgressRing({ phase, className }: { phase: LoadingPhase; className?: string }) {
  const active = phase !== 'idle' && phase !== 'cold';
  const label =
    phase === 'cached'
      ? 'Refreshing from server'
      : phase === 'syncing'
        ? 'Refreshing'
        : phase === 'paginating'
          ? 'Loading more'
          : '';
  const ring = (
    <span
      className={`inline-flex items-center justify-center ${className ?? ''}`}
      style={{
        width: SIZE,
        height: SIZE,
        // Keep the slot reserved even when idle so the title bar never
        // reflows. Opacity transition is cheap and compositor-only.
        opacity: active ? 1 : 0,
        transition: 'opacity 200ms var(--ease-out)',
      }}
      aria-hidden={!active}
      aria-label={active ? label : undefined}
      data-testid="progress-ring"
      data-phase={phase}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none">
        {/* Track */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke="var(--color-border)"
          strokeWidth={STROKE}
        />
        {/* Animated arc: stroke-dashoffset animates the fill around
            the ring continuously. Combined with a slow rotation, the
            arc both sweeps AND grows, reading as "filling in". */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke="var(--color-fg)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC}
          style={{
            transformOrigin: 'center',
            animation: active
              ? 'reknowable-ring-sweep 1400ms cubic-bezier(0.4, 0, 0.4, 1) infinite, reknowable-ring-spin 2200ms linear infinite'
              : undefined,
          }}
        />
      </svg>
    </span>
  );
  if (!active) return ring;
  return <WithTooltip label={label}>{ring}</WithTooltip>;
}
