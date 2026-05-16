'use client';

import { useEffect, useRef, useState } from 'react';

export type CountUpProps = {
  /** Target value to animate to. */
  to: number;
  /** Duration in ms. Default 400. */
  durationMs?: number;
  /** className passed to the span. */
  className?: string;
};

const EASE_OUT_QUART = (t: number): number => 1 - Math.pow(1 - t, 4);

/**
 * CountUp — animates a tabular number from 0 → `to` on first appearance.
 * Subsequent changes to `to` snap to the new value without re-animating
 * (don't re-trigger the wow-moment on every realtime tick).
 *
 * Respects prefers-reduced-motion: renders the final value directly.
 */
export function CountUp({ to, durationMs = 400, className }: CountUpProps) {
  const [display, setDisplay] = useState<number>(to);
  const animatedRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Only animate on the FIRST non-zero target. Updates after that
    // are a smooth swap, not a fresh animation.
    if (animatedRef.current) {
      setDisplay(to);
      return;
    }
    if (to <= 0) {
      setDisplay(0);
      return;
    }
    animatedRef.current = true;
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setDisplay(to);
      return;
    }
    const start = performance.now();
    const from = 0;
    const tick = (now: number): void => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = EASE_OUT_QUART(progress);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [to, durationMs]);

  return (
    <span className={`tabular-nums ${className ?? ''}`} aria-label={String(to)}>
      {display.toLocaleString()}
    </span>
  );
}
