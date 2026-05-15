import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

/**
 * network-ai Tailwind config.
 *
 * Design tokens (see also `.impeccable.md`):
 *   - Light-only theme
 *   - Monochromatic + one emerald accent (warmth-1 + AI-action confirmation)
 *   - Hairline borders, generous whitespace, Geist Sans + Mono
 *   - All semantic tokens defined as CSS variables in app/globals.css so
 *     they can be overridden per-route if we ever need to.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    '../../packages/app/src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-soft': 'var(--color-surface-soft)',
        fg: 'var(--color-fg)',
        muted: 'var(--color-muted)',
        faint: 'var(--color-faint)',
        border: 'var(--color-border)',
        'border-soft': 'var(--color-border-soft)',
        accent: 'var(--color-accent)',
        'accent-soft': 'var(--color-accent-soft)',
        danger: 'var(--color-danger)',
        warning: 'var(--color-warning)',
        warmth: {
          1: 'var(--color-warmth-1)',
          2: 'var(--color-warmth-2)',
          3: 'var(--color-warmth-3)',
          4: 'var(--color-warmth-4)',
          5: 'var(--color-warmth-5)',
        },
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
      },
      fontSize: {
        // Modular scale; clamp for fluid sizing on the big surfaces.
        xs: ['0.75rem', { lineHeight: '1.5' }],
        sm: ['0.8125rem', { lineHeight: '1.55' }],
        base: ['0.9375rem', { lineHeight: '1.6' }],
        md: ['1rem', { lineHeight: '1.55' }],
        lg: ['1.125rem', { lineHeight: '1.5' }],
        xl: ['1.375rem', { lineHeight: '1.4' }],
        '2xl': ['1.75rem', { lineHeight: '1.3' }],
      },
      letterSpacing: {
        tight: '-0.011em',
        tighter: '-0.022em',
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '10px',
        xl: '14px',
      },
      boxShadow: {
        hairline: 'inset 0 0 0 1px var(--color-border)',
        'hairline-soft': 'inset 0 0 0 1px var(--color-border-soft)',
        lift: '0 1px 0 0 var(--color-border), 0 6px 16px -8px rgb(0 0 0 / 0.06)',
        focus: '0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-accent)',
      },
      spacing: {
        '4.5': '1.125rem',
        '5.5': '1.375rem',
        '13': '3.25rem',
      },
      transitionTimingFunction: {
        'ease-out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)',
        'ease-out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      animation: {
        'cursor-blink': 'blink 1.05s steps(2) infinite',
        'highlight-pulse': 'highlightPulse 1.2s ease-out 1',
      },
      keyframes: {
        blink: {
          '0%, 50%': { opacity: '1' },
          '50.01%, 100%': { opacity: '0.15' },
        },
        highlightPulse: {
          '0%': { backgroundColor: 'var(--color-accent-soft)' },
          '100%': { backgroundColor: 'transparent' },
        },
      },
    },
  },
  plugins: [typography],
};

export default config;
