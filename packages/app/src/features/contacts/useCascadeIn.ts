'use client';

import { useEffect, useState } from 'react';

/** Module-level registry of items that have already animated. Survives
 *  React reconciliation, virtualizer un-/re-mounts, and parent renders.
 *  Does NOT live in zustand on purpose — earlier versions did, but that
 *  caused a render storm: every `markSeen` call notified every
 *  subscribed CascadeRow's selector, producing N × N projection
 *  evaluations during the cascade. A module-level Set has zero
 *  subscribers and zero React work outside the row itself. */
const seenIds = new Set<string>();

/**
 * Cascade warmup window. The cascade animation is for INITIAL paint
 * delight — once the user is past first-load, new rows mounting
 * (because they scrolled to them, or because realtime pushed them in)
 * should appear instantly, not fade.
 *
 * Without this: every scroll in a virtualized list would re-fire the
 * animation as fresh-id rows mounted. That's visual noise.
 *
 * The window starts at module load. After WARMUP_MS, any row whose
 * useCascadeIn is called for the first time is marked seen silently
 * and gets identity style — no fade. */
const WARMUP_MS = 800;
const warmupStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

function isWarmupOver(): boolean {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return now - warmupStartedAt > WARMUP_MS;
}

// These numeric constants mirror the CSS tokens in
// apps/web/app/globals.css. Keep them in sync with the token block +
// MOTION.md.
//
// Uniform stagger. Every item gets the same gap from its predecessor —
// no pacing change halfway down the list. Capped at 500ms total so
// huge lists don't drag; past the cap, items pile (rare in practice
// since 500/14 ≈ 35 items stagger linearly before the cap bites, and
// most viewports show fewer than that at once).
//
// Final times:
//   8 items   →  98ms cascade + 220ms fade = 318ms total
//   20 items  → 266ms cascade + 220ms fade = 486ms total
//   35 items  → 476ms cascade + 220ms fade = 696ms total
//   50 items  → 500ms cascade (capped) + 220ms fade = 720ms total
//   100 items → 500ms cascade (capped) + 220ms fade = 720ms total
const FADE_MS = 220; // matches --dur-settle
const STAGGER_MS = 14;
const STAGGER_HARD_CAP_MS = 500;

function cascadeDelay(index: number): number {
  return Math.min(index * STAGGER_MS, STAGGER_HARD_CAP_MS);
}

/**
 * useCascadeIn — gives each row a one-shot opacity + Y settle + tiny
 * scale the FIRST time it's seen, then renders identity forever. CSS-
 * keyframe driven (`reknowable-cascade-in` in globals.css) so the
 * browser runs the animation on the compositor — no React setState,
 * no transition shorthand conflicts, no per-frame style flush.
 *
 * Per MOTION.md: cascade fires once per item per session. Subsequent
 * mounts of the same id (filter, virtualization, sort) render with
 * identity style — the user's intent there is structural, and the
 * response should be instant.
 *
 * Honors prefers-reduced-motion.
 */
export function useCascadeIn(id: string, index: number): React.CSSProperties {
  // CRITICAL: `wasSeen` and `pastWarmup` are captured ONCE per instance
  // via useState's lazy initializer. If we read seenIds/isWarmupOver
  // directly on every render, parent re-renders during the cascade
  // (pagination chunks landing, loading-phase transitions, realtime
  // echoes) would flip these values mid-flight — and React would
  // remove the `animation` inline-style, which CANCELS the running CSS
  // animation. Locking the value in once per instance keeps the running
  // animation alive across any number of parent re-renders.
  const [skipAnimation] = useState(() => seenIds.has(id) || isWarmupOver());
  // Always record this id so future remounts (virtualizer recycling
  // the same row, refetch returning the same contact) render with
  // identity style instead of replaying the cascade.
  useEffect(() => {
    seenIds.add(id);
  }, [id]);

  if (skipAnimation) return EMPTY_STYLE;
  if (typeof window !== 'undefined') {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return EMPTY_STYLE;
  }
  const delay = cascadeDelay(index);
  return {
    animation: `reknowable-cascade-in ${FADE_MS}ms var(--ease-snappy) ${delay}ms both`,
    willChange: 'opacity, transform',
  };
}

/** Test helper — clears the seen registry. Not exported to product code. */
export function _resetCascadeSeen(): void {
  seenIds.clear();
}

const EMPTY_STYLE: React.CSSProperties = {};
