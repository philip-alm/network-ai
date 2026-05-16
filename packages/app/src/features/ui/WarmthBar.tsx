'use client';

export type WarmthBarProps = {
  /** 1 (most distant) to 5 (closest). */
  warmth: number;
};

const WARMTH_LABELS: Record<number, string> = {
  1: 'Met once, vague memory',
  2: 'Would answer an email',
  3: 'Catches up once in a while',
  4: 'Always quick to reply',
  5: 'Would drop everything',
};

/**
 * WarmthBar — 5 segments, fills proportional to warmth.
 * warmth 5 (closest) = 5 segments filled with accent.
 * warmth 1 (most distant) = 1 segment filled.
 * Replaces the decorative warmth dot.
 */
export function WarmthBar({ warmth }: WarmthBarProps) {
  const filled = Math.max(1, Math.min(5, warmth));
  const label = `warmth ${warmth}, ${WARMTH_LABELS[warmth] ?? ''}`.replace(/, $/, '');
  return (
    <span className="inline-flex items-center gap-[2px]" aria-label={label} title={label}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`h-2 w-[3px] rounded-[1px] ${i <= filled ? 'bg-accent' : 'bg-surface-soft'}`}
        />
      ))}
    </span>
  );
}
