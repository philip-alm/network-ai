'use client';

/**
 * Wordmark — the Reknowable brand lockup.
 *
 * Title-case "Reknowable" set in Geist Sans, tight tracking. The "Re"
 * prefix carries a touch more weight + accent color, hinting at the
 * product idea (re-knowing / active recall) without becoming
 * decorative. No dot, no separator, no icon — the wordmark IS the
 * logo, the way Linear and Stripe and Vercel use their names.
 *
 * The Wordmark appears in the header, on auth screens, and anywhere
 * Reknowable identifies itself in-product. Never re-style it inline.
 * Never set the mark uppercase. Never wrap it in a badge or box.
 *
 * Sizing is via the `tone` prop, not a custom className. Adding new
 * tones requires updating this file and the BRAND.md wordmark rule.
 */

export type WordmarkTone = 'header' | 'hero';

export type WordmarkProps = {
  tone?: WordmarkTone;
  className?: string;
};

type ToneStyle = {
  /** Tailwind classes for the wrapper span (size + weight). */
  wrap: string;
  /** Tailwind classes for the "Re" prefix. */
  prefix: string;
  /** Tailwind classes for the "knowable" suffix. */
  suffix: string;
};

const TONES: Record<WordmarkTone, ToneStyle> = {
  header: {
    wrap: 'text-[15px] leading-none',
    prefix: 'font-semibold text-accent',
    suffix: 'font-medium text-fg',
  },
  hero: {
    wrap: 'text-3xl leading-none',
    prefix: 'font-semibold text-accent',
    suffix: 'font-medium text-fg',
  },
};

export function Wordmark({ tone = 'header', className }: WordmarkProps) {
  const t = TONES[tone];
  return (
    <span
      data-testid="brand-wordmark"
      aria-label="Reknowable"
      className={`inline-flex items-baseline tracking-[-0.022em] ${t.wrap} ${className ?? ''}`}
    >
      <span className={t.prefix} aria-hidden>
        Re
      </span>
      <span className={t.suffix} aria-hidden>
        knowable
      </span>
    </span>
  );
}
