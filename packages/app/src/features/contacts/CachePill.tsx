'use client';

import { motion, AnimatePresence } from 'motion/react';
import type { LoadingPhase } from '../../lib/store';

export type CachePillProps = {
  phase: LoadingPhase;
};

/**
 * CachePill — a quiet status badge at the top of the network pane:
 *
 *   phase = 'cached'      → "Cached · refreshing" (the user is seeing
 *                            local cache; fresh data is in flight)
 *   phase = 'syncing'     → "Refreshing…"
 *   phase = 'paginating'  → "Loading more…"
 *   otherwise             → hidden
 *
 * Mono, very small, fade-only animation. Never moves the layout —
 * always sits in its own row, height collapses when not visible.
 */
export function CachePill({ phase }: CachePillProps) {
  const label =
    phase === 'cached'
      ? 'Cached · refreshing'
      : phase === 'syncing'
        ? 'Refreshing…'
        : phase === 'paginating'
          ? 'Loading more…'
          : null;
  return (
    <AnimatePresence>
      {label ? (
        <motion.div
          key={label}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
          className="px-4 pt-2"
          data-testid="cache-pill"
        >
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-surface-soft px-1.5 py-0.5 font-mono text-[10px] text-faint">
            <span
              aria-hidden
              className="inline-flex h-1.5 w-1.5 rounded-full bg-accent"
              style={{
                animation: 'reknowable-pulse 1400ms ease-in-out infinite',
              }}
            />
            {label}
          </span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
