'use client';

const WARMTH_LABELS: Record<number, string> = {
  1: 'closest — would do anything',
  2: 'WhatsApp, no problem',
  3: 'solid professional contact',
  4: 'would respond if I asked',
  5: 'might respond',
};

const WARMTH_CLASSES: Record<number, string> = {
  1: 'bg-warmth-1',
  2: 'bg-warmth-2',
  3: 'bg-warmth-3',
  4: 'bg-warmth-4',
  5: 'bg-warmth-5',
};

export function WarmthDot({ warmth, size = 9 }: { warmth: number | null; size?: number }) {
  if (warmth == null) {
    return (
      <span
        aria-label="warmth unknown"
        data-testid="warmth-none"
        className="inline-block rounded-full bg-faint/40"
        style={{ width: size, height: size }}
      />
    );
  }
  const tone = WARMTH_CLASSES[warmth] ?? 'bg-faint';
  return (
    <span
      aria-label={`warmth ${warmth} — ${WARMTH_LABELS[warmth] ?? ''}`}
      title={`warmth ${warmth} — ${WARMTH_LABELS[warmth] ?? ''}`}
      data-testid={`warmth-${warmth}`}
      className={`inline-block rounded-full ${tone}`}
      style={{ width: size, height: size }}
    />
  );
}
