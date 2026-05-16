'use client';

import { useEffect } from 'react';

/**
 * Global keyboard shortcuts for Reknowable.
 *
 * The top-level shell wires this with handlers that open the command
 * palette, the cheatsheet, and trigger composer focus. Per-surface
 * handlers (Esc inside an editor, J/K in the contacts list) live in
 * those surfaces; this hook owns only the truly global keys.
 *
 * Shortcuts respect input/textarea focus: if the user is typing into a
 * field, only `Escape` and explicit modifier-key shortcuts (⌘K, ⌘/) fire.
 */
export type GlobalShortcutHandlers = {
  onOpenPalette: () => void;
  onOpenCheatsheet: () => void;
  onSignOut?: () => void;
};

export function useGlobalShortcuts(handlers: GlobalShortcutHandlers): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      const inField = !!(
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          (target instanceof HTMLElement && target.isContentEditable))
      );

      const cmd = e.metaKey || e.ctrlKey;

      if (cmd && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        handlers.onOpenPalette();
        return;
      }
      if (cmd && e.key === '/') {
        e.preventDefault();
        handlers.onOpenCheatsheet();
        return;
      }
      if (inField) return;
      if (e.key === '?') {
        e.preventDefault();
        handlers.onOpenCheatsheet();
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handlers]);
}
