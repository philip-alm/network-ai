'use client';

export type TagKind = 'neutral' | 'brand' | 'blue' | 'green' | 'amber';

export type TagProps = {
  kind?: TagKind;
  /** Set when the Tag sits inside a panel whose bg matches the neutral
   *  tag's bg (e.g. the open-contact panel uses `bg-surface-soft`).
   *  In that case neutral tags would disappear; this prop swaps the
   *  neutral bg to `--color-bg` so it has contrast in that context. */
  onPanel?: boolean;
  children: React.ReactNode;
};

/**
 * Tag — small colored label pill. Five sanctioned kinds. Colors come
 * from CSS vars so they auto-adapt to light/dark theme.
 */
export function Tag({ kind = 'neutral', onPanel = false, children }: TagProps) {
  const background =
    onPanel && kind === 'neutral' ? 'var(--color-bg)' : `var(--color-tag-${kind}-bg)`;
  return (
    <span
      className="inline-flex items-center rounded-[4px] px-1.5 py-px text-[11px] font-medium"
      style={{
        background,
        color: `var(--color-tag-${kind}-fg)`,
        letterSpacing: '-0.005em',
      }}
    >
      {children}
    </span>
  );
}
