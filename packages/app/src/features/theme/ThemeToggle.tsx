'use client';

import { Sun, Moon } from 'lucide-react';
import { useTheme } from './useTheme';
import { WithTooltip } from '../ui';

/**
 * ThemeToggle — single-button light/dark switcher. Click toggles the
 * resolved theme; long-press could open a System / Light / Dark menu
 * later. The icon shows the theme you'd switch TO (Sun = light to go,
 * Moon = dark to go).
 */
export function ThemeToggle() {
  const { resolved, setTheme } = useTheme();
  const next = resolved === 'dark' ? 'light' : 'dark';
  const Icon = resolved === 'dark' ? Sun : Moon;
  const label = resolved === 'dark' ? 'Switch to light' : 'Switch to dark';

  return (
    <WithTooltip label={label}>
      <button
        type="button"
        onClick={() => setTheme(next)}
        data-testid="theme-toggle"
        aria-label={label}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-all duration-[160ms] hover:bg-surface-soft hover:text-fg focus-visible:bg-surface-soft focus-visible:text-fg active:scale-[0.95]"
        style={{
          transitionTimingFunction: 'var(--ease-out)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <Icon size={14} aria-hidden />
      </button>
    </WithTooltip>
  );
}
