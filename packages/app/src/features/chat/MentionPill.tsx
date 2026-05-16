'use client';

import { motion } from 'motion/react';
import { useNetworkStore } from '../../lib/store';

/**
 * MentionPill — an inline reference to a contact or asset that the user
 * can click to scroll-and-highlight the row in the right pane.
 *
 * Authored by the AI as markdown link syntax — chosen because it's
 * natural for an LLM to emit and parses cleanly with react-markdown's
 * link override:
 *
 *     [Viktor Nord](contact:6b0f4f80-…)
 *     [Podcast setup](asset:9c7a1e22-…)
 *
 * The protocol prefix (`contact:` / `asset:`) routes to MentionPill
 * via the Markdown component's `a` override. Plain external links
 * stay external.
 */
export function MentionPill({
  kind,
  id,
  children,
}: {
  kind: 'contact' | 'asset';
  id: string;
  children: React.ReactNode;
}) {
  const jumpTo = useNetworkStore((s) => s.actions.jumpTo);

  return (
    <motion.button
      type="button"
      onClick={() => jumpTo(id)}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.12, ease: [0.23, 1, 0.32, 1] }}
      data-testid={`mention-${kind}-${id}`}
      className="inline rounded-sm bg-accent-soft px-1.5 py-0.5 font-medium text-accent transition-colors duration-[140ms] hover:bg-accent/15 focus-visible:bg-accent/15"
      style={{
        transitionTimingFunction: 'var(--ease-out)',
        WebkitTapHighlightColor: 'transparent',
      }}
      aria-label={`Jump to ${typeof children === 'string' ? children : kind}`}
    >
      {children}
    </motion.button>
  );
}
