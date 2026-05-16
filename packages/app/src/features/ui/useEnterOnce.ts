'use client';

import { useEffect, useState } from 'react';

/** Module-level registry of surfaces that have already entered.
 *  Surfaces are coarse — "right pane", "chat empty state", etc.
 *  Stays in memory for the session; resets on full page reload. */
const seenSurfaces = new Set<string>();

// Mirrors the CSS token --dur-settle in globals.css. Surfaces use a
// shorter settle than items (220ms) because they're typically the
// container for a cascade — if both took 220ms, the surface would
// still be settling when its children started arriving.
const FADE_MS = 180; // matches --dur-snap (one tier below --dur-settle)

/**
 * useEnterOnce — one-shot opacity + Y settle + tiny scale for a SURFACE
 * (container, pane, empty state). Plays exactly once per session per
 * `key`, then renders identity styles forever after.
 *
 * Use for surface-level arrivals that should feel composed (pane filling
 * in, empty state appearing). For per-item cascades inside a list, use
 * `useCascadeIn` instead.
 *
 * Browser-driven via the `reknowable-surface-in` keyframe in
 * globals.css — no setState, no transition-property conflicts. Honors
 * prefers-reduced-motion.
 */
export function useEnterOnce(key: string): React.CSSProperties {
  // Lazy-initialized state — locks in the "was this surface seen
  // before THIS mount?" answer at first render, so subsequent
  // re-renders return the same value. Without this, a parent
  // re-render during the surface's settle would flip wasSeen to true
  // (because useEffect added the key) and cancel the running CSS
  // animation. See useCascadeIn for the same fix in detail.
  const [wasSeen] = useState(() => seenSurfaces.has(key));
  useEffect(() => {
    seenSurfaces.add(key);
  }, [key]);

  if (wasSeen) return EMPTY_STYLE;
  if (typeof window !== 'undefined') {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return EMPTY_STYLE;
  }
  return {
    animation: `reknowable-surface-in ${FADE_MS}ms var(--ease-snappy) both`,
    willChange: 'opacity, transform',
  };
}

const EMPTY_STYLE: React.CSSProperties = {};
