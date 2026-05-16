'use client';

import { motion } from 'motion/react';
import { User, Briefcase, ArrowUpRight } from 'lucide-react';
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
  const Icon = kind === 'contact' ? User : Briefcase;

  return (
    <motion.button
      type="button"
      onClick={() => jumpTo(id)}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.12, ease: [0.25, 1, 0.5, 1] }}
      data-testid={`mention-${kind}-${id}`}
      className="group inline-flex items-baseline gap-1 rounded-sm border border-border-soft bg-bg px-1.5 py-0 align-baseline text-fg/95 transition-colors hover:border-accent/40 hover:bg-accent-soft/30"
      aria-label={`Jump to ${typeof children === 'string' ? children : kind}`}
    >
      <Icon
        size={10}
        className="self-center text-muted transition-colors group-hover:text-accent"
        aria-hidden
      />
      <span className="font-medium leading-tight">{children}</span>
      <ArrowUpRight
        size={9}
        className="self-center text-faint opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
    </motion.button>
  );
}
