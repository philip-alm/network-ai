'use client';

import { AnimatePresence, motion } from 'motion/react';
import { CloudOff } from 'lucide-react';
import { useOnlineStatus } from './useOnlineStatus';

/**
 * OfflineBanner — a quiet, persistent banner at the top of the viewport
 * when the browser reports offline. Disappears the moment connectivity
 * returns. No drop shadows; hairline ring; brand-tinted danger color.
 *
 * Designed to sit OUTSIDE the app's main shell so it overlays cleanly.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  return (
    <AnimatePresence>
      {!online ? (
        <motion.div
          key="offline-banner"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex items-center justify-center px-4 pt-3"
          role="status"
          aria-live="polite"
          data-testid="offline-banner"
        >
          <div className="pointer-events-auto inline-flex items-center gap-2.5 rounded-full bg-surface px-3 py-1.5 text-xs tracking-tight text-fg shadow-[0_0_0_1px_var(--color-border),_0_8px_24px_-16px_oklch(0%_0_0_/_0.6)]">
            <span
              className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-danger/15 text-danger"
              aria-hidden
            >
              <CloudOff size={11} />
            </span>
            <span>
              <span className="font-medium">Offline.</span>{' '}
              <span className="text-muted">Changes will sync when you're back online.</span>
            </span>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
