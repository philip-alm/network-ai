'use client';

import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'reknowable:theme';

function readStored(): Theme {
  if (typeof window === 'undefined') return 'system';
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === 'light' || v === 'dark') return v;
  return 'system';
}

function readSystem(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * useTheme — reads/sets the theme preference (light / dark / system).
 * The `system` value follows OS preference. Stored choice persists in
 * localStorage. The layout.tsx bootstrap script applies the stored
 * theme before hydration to avoid flash-of-wrong-theme.
 */
export function useTheme(): {
  theme: Theme;
  resolved: ResolvedTheme;
  setTheme: (t: Theme) => void;
} {
  const [theme, setThemeState] = useState<Theme>('system');
  const [system, setSystem] = useState<ResolvedTheme>('light');

  useEffect(() => {
    setThemeState(readStored());
    setSystem(readSystem());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => setSystem(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      delete root.dataset.theme;
    } else {
      root.dataset.theme = theme;
    }
  }, [theme]);

  const setTheme = useCallback((next: Theme): void => {
    try {
      if (next === 'system') window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage might be unavailable (private window, quotas).
      // The state still updates; persistence is a nice-to-have.
    }
    setThemeState(next);
  }, []);

  const resolved: ResolvedTheme = theme === 'system' ? system : theme;
  return { theme, resolved, setTheme };
}
