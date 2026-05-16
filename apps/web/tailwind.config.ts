import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

/**
 * Reknowable Tailwind config.
 *
 * Design tokens (see DESIGN.md + PRODUCT.md + BRAND.md at the repo root):
 *   - Operator's Study (deep navy + amber), dark-only by design intent.
 *   - Navy surfaces, warm cream ink, brand amber accent. Palette taken
 *     directly from the Reknowable logo. Warmth ramp tuned for navy.
 *   - Hairline borders, generous whitespace, Geist Sans + Mono.
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
        // Every token is wired through its RGB-channel mirror so that
        // Tailwind's opacity modifier (`bg-X/Y`, `border-X/Y`) composes
        // correctly. Without this, opacity silently fails and Tailwind
        // falls back to currentColor — produces white borders on dark.
        bg: 'rgb(var(--color-bg-rgb) / <alpha-value>)',
        surface: 'rgb(var(--color-surface-rgb) / <alpha-value>)',
        'surface-soft': 'rgb(var(--color-surface-soft-rgb) / <alpha-value>)',
        fg: 'rgb(var(--color-fg-rgb) / <alpha-value>)',
        muted: 'rgb(var(--color-muted-rgb) / <alpha-value>)',
        faint: 'rgb(var(--color-faint-rgb) / <alpha-value>)',
        border: 'rgb(var(--color-border-rgb) / <alpha-value>)',
        'border-soft': 'rgb(var(--color-border-soft-rgb) / <alpha-value>)',
        accent: 'rgb(var(--color-accent-rgb) / <alpha-value>)',
        'accent-soft': 'rgb(var(--color-accent-soft-rgb) / <alpha-value>)',
        danger: 'rgb(var(--color-danger-rgb) / <alpha-value>)',
        warning: 'rgb(var(--color-warning-rgb) / <alpha-value>)',
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
        lift: '0 0 0 1px var(--color-border), 0 8px 24px -16px oklch(0% 0 0 / 0.5), 0 0 0 1px oklch(100% 0 0 / 0.02)',
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
        'ease-out-quint': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      transitionDuration: {
        fast: '120ms',
        base: '180ms',
        slow: '220ms',
      },
      animation: {
        'cursor-blink': 'blink 1.05s steps(2) infinite',
        'highlight-pulse': 'highlightPulse 1.2s ease-out 1',
        'fade-in': 'fadeIn 180ms cubic-bezier(0.25, 1, 0.5, 1)',
        'scale-in': 'scaleIn 180ms cubic-bezier(0.22, 1, 0.36, 1)',
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
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [typography],
};

export default config;
