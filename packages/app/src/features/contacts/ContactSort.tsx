'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowDownUp, Check } from 'lucide-react';
import type { ContactSortMode as StoreContactSortMode } from '../../lib/store';
import { WithTooltip } from '../ui';
import { applyContactSort } from './panelLogic';

export type ContactSortMode = StoreContactSortMode;

const OPTIONS: Array<{ mode: ContactSortMode; label: string }> = [
  { mode: 'updated_desc', label: 'Recently updated' },
  { mode: 'created_desc', label: 'Recently added' },
  { mode: 'name_asc', label: 'Name (A → Z)' },
  { mode: 'name_desc', label: 'Name (Z → A)' },
  { mode: 'warmth_desc', label: 'Warmth (closest first)' },
  { mode: 'warmth_asc', label: 'Warmth (distant first)' },
  { mode: 'asset_count_desc', label: 'Most assets first' },
];

export const DEFAULT_SORT: ContactSortMode = 'updated_desc';

// Back-compat: callers that don't have the assets list pass an empty
// one. Affects only the asset_count_desc mode (which becomes a no-op).
export const applySort = (
  contacts: Parameters<typeof applyContactSort>[0],
  mode: ContactSortMode,
) => applyContactSort(contacts, mode, { assets: [] });

export type ContactSortProps = {
  value: ContactSortMode;
  onChange: (next: ContactSortMode) => void;
};

/**
 * ContactSort — small dropdown next to the filter for picking how the
 * contacts list is ordered. Portaled to escape pane overflow clipping.
 */
export function ContactSort({ value, onChange }: ContactSortProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const measure = (): void => {
    const el = buttonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      top: r.bottom + 6,
      right: Math.max(8, window.innerWidth - r.right),
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const onScroll = (): void => measure();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node | null;
      if (!t) return;
      if (buttonRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <WithTooltip label="Sort">
        <button
          ref={buttonRef}
          type="button"
          aria-label="Sort"
          aria-expanded={open}
          data-testid="contacts-sort-trigger"
          onClick={() => setOpen((v) => !v)}
          className={`inline-flex h-6 w-6 items-center justify-center rounded-md transition-all duration-[140ms] active:scale-[0.95] ${
            value !== DEFAULT_SORT
              ? 'bg-accent-soft text-accent'
              : 'text-faint hover:bg-surface-soft hover:text-fg focus-visible:bg-surface-soft focus-visible:text-fg'
          }`}
          style={{
            transitionTimingFunction: 'var(--ease-out)',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <ArrowDownUp size={12} aria-hidden />
        </button>
      </WithTooltip>

      {mounted
        ? createPortal(
            <AnimatePresence>
              {open && pos ? (
                <motion.div
                  ref={popoverRef}
                  key="sort-popover"
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
                  role="menu"
                  aria-label="Sort contacts"
                  className="fixed z-[80] w-[200px] origin-top-right overflow-hidden rounded-xl bg-surface py-1.5"
                  style={{
                    top: pos.top,
                    right: pos.right,
                    boxShadow:
                      '0 0 0 1px var(--color-border), 0 16px 40px -16px oklch(0% 0 0 / 0.45)',
                  }}
                >
                  {OPTIONS.map((opt) => {
                    const active = opt.mode === value;
                    return (
                      <button
                        key={opt.mode}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        onClick={() => {
                          onChange(opt.mode);
                          setOpen(false);
                        }}
                        className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] transition-colors duration-[140ms] hover:bg-surface-soft focus-visible:bg-surface-soft ${
                          active ? 'text-fg' : 'text-muted'
                        }`}
                        style={{
                          transitionTimingFunction: 'var(--ease-out)',
                          WebkitTapHighlightColor: 'transparent',
                        }}
                      >
                        <span className="truncate">{opt.label}</span>
                        {active ? <Check size={12} aria-hidden className="text-accent" /> : null}
                      </button>
                    );
                  })}
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </>
  );
}
