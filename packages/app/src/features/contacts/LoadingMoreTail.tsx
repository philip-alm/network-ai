'use client';

import { motion, AnimatePresence } from 'motion/react';

/**
 * LoadingMoreTail — quiet "Loading more…" stub at the bottom of the
 * list during scroll-prefetch. Drives off a `visible` boolean so it
 * can be wired to either a loading phase or an `isLoadingMore` flag.
 */
export function LoadingMoreTail({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="loading-more"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
          className="px-4 py-3 text-center"
          data-testid="loading-more-tail"
        >
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-faint">
            <span
              aria-hidden
              className="inline-flex h-1.5 w-1.5 rounded-full bg-accent"
              style={{ animation: 'reknowable-pulse 1400ms ease-in-out infinite' }}
            />
            Loading more…
          </span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
