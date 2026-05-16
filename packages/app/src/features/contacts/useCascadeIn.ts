'use client';

import { useEffect, useState } from 'react';
import { useNetworkStore } from '../../lib/store';

const STAGGER_MS = 10;
const FADE_MS = 220;

/**
 * useCascadeIn — gives each row a one-shot opacity cascade the FIRST
 * time it's seen by the UI, then never animates that row again. After
 * the initial cascade settles, scrolling and reorders have zero motion
 * overhead — the row simply renders with opacity:1 / transform:none.
 *
 * Implementation:
 *   - The store's `seenIds: Set<string>` is the persistent "I've
 *     already animated" record.
 *   - On mount, if `id` is unseen, we render with a brief opacity
 *     transition (delay staggered by `index`) and then mark seen.
 *   - If `id` is already seen, render style is identity → no work.
 *
 * The cascade uses CSS transitions (not Motion) so it never has to
 * measure layout. Pure opacity = compositor only.
 */
export function useCascadeIn(id: string, index: number): React.CSSProperties {
  const seen = useNetworkStore((s) => s.seenIds.has(id));
  const markSeen = useNetworkStore((s) => s.actions.markSeen);
  // `mounted` flips one frame after first render so the transition has
  // a starting state to interpolate from. Without this, opacity goes
  // 0 → 1 in the same frame and the browser skips the transition.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (seen) return;
    // Two RAFs — first frame paints with opacity:0; second frame
    // mounts:true → opacity:1 with transition. Skipping the second
    // RAF makes Chrome occasionally drop the animation.
    const r1 = requestAnimationFrame(() => {
      const r2 = requestAnimationFrame(() => {
        setMounted(true);
        // Mark seen so the next mount of this id (e.g. after a
        // virtualizer un-mount + re-mount during scroll) is identity.
        markSeen(id);
      });
      return () => cancelAnimationFrame(r2);
    });
    return () => cancelAnimationFrame(r1);
  }, [id, seen, markSeen]);

  if (seen) return EMPTY_STYLE;
  const delay = Math.min(index * STAGGER_MS, 250);
  return {
    opacity: mounted ? 1 : 0,
    transition: `opacity ${FADE_MS}ms var(--ease-out) ${delay}ms`,
    willChange: mounted ? undefined : 'opacity',
  };
}

const EMPTY_STYLE: React.CSSProperties = {};
