'use client';

/** Renders a colored dot for the warmth scale: 1=green, 2=lightgreen, 3=yellow, 4=orange, 5=grey. */
export function WarmthDot({ warmth }: { warmth: number | null }) {
  const map: Record<number, string> = {
    1: '#0a8f3a',
    2: '#5ab041',
    3: '#d8b836',
    4: '#d97843',
    5: '#999',
  };
  const color = warmth ? (map[warmth] ?? '#ccc') : '#ccc';
  const label = warmth ? `warmth ${warmth}` : 'unknown warmth';
  return (
    <span
      title={label}
      aria-label={label}
      data-testid={`warmth-${warmth ?? 'none'}`}
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: color,
        marginRight: 8,
      }}
    />
  );
}
