'use client';

export type SoftDividerProps = {
  /** Horizontal inset (px) so the line breathes from the panel padding. */
  inset?: number;
};

/**
 * SoftDivider — 1px line that fades at the edges via a gradient.
 * Use under panel headers to separate a header from its content
 * without the "box wall" feel of a hard hairline.
 */
export function SoftDivider({ inset = 0 }: SoftDividerProps) {
  return (
    <div
      aria-hidden
      style={{
        height: 1,
        marginLeft: inset,
        marginRight: inset,
        background:
          'linear-gradient(to right, transparent 0%, var(--color-border) 12%, var(--color-border) 88%, transparent 100%)',
        opacity: 0.7,
      }}
    />
  );
}
