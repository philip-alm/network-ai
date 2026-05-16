'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { Kbd } from '../ui';

export type KeyboardCheatsheetProps = {
  open: boolean;
  onClose: () => void;
};

type Shortcut = {
  keys: string[];
  label: string;
};

type Section = {
  title: string;
  shortcuts: Shortcut[];
};

const SECTIONS: Section[] = [
  {
    title: 'Anywhere',
    shortcuts: [
      { keys: ['cmd', 'K'], label: 'Open command palette' },
      { keys: ['cmd', 'shift', 'O'], label: 'New conversation' },
      { keys: ['cmd', 'B'], label: 'Toggle sidebar' },
      { keys: ['cmd', ','], label: 'Open settings' },
      { keys: ['cmd', 'Z'], label: 'Undo a contact delete (within 5s)' },
      { keys: ['?'], label: 'Show this cheatsheet' },
      { keys: ['esc'], label: 'Close any open panel' },
    ],
  },
  {
    title: 'Chat',
    shortcuts: [
      { keys: ['/'], label: 'Focus composer' },
      { keys: ['enter'], label: 'Send message' },
      { keys: ['shift', 'enter'], label: 'New line in composer' },
      { keys: ['up'], label: 'Recall latest queued message' },
      { keys: ['down'], label: 'Queue current draft' },
    ],
  },
  {
    title: 'Contact rows',
    shortcuts: [
      { keys: ['enter'], label: 'Expand or collapse focused row' },
      { keys: ['esc'], label: 'Exit notes editor (saves)' },
    ],
  },
];

/**
 * KeyboardCheatsheet — the teach-once surface for every shortcut.
 * Invoked with `?` or via the header help icon. Quiet modal, ease-out-in.
 */
export function KeyboardCheatsheet({ open, onClose }: KeyboardCheatsheetProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="cheatsheet-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14, ease: [0.25, 1, 0.5, 1] }}
          className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-bg/60 backdrop-blur-sm"
          onClick={onClose}
          data-testid="cheatsheet-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
        >
          <motion.div
            key="cheatsheet-panel"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md overflow-hidden rounded-xl bg-surface"
            style={{
              boxShadow: '0 0 0 1px var(--color-border), 0 24px 60px -20px oklch(0% 0 0 / 0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border-soft px-5 py-4">
              <div>
                <h2 className="text-base font-medium tracking-tight text-fg">Keyboard shortcuts</h2>
                <p className="mt-0.5 text-xs text-muted">Learn once. Recall faster.</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-faint transition-colors duration-fast hover:bg-surface-soft hover:text-fg"
              >
                <X size={12} aria-hidden />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
              {SECTIONS.map((section) => (
                <section key={section.title} className="mb-5 last:mb-0">
                  <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-faint">
                    {section.title}
                  </h3>
                  <ul className="space-y-1.5">
                    {section.shortcuts.map((sc) => (
                      <li
                        key={sc.label}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="text-fg">{sc.label}</span>
                        <Kbd keys={sc.keys} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
