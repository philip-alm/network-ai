'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Kbd, parseShortcut } from './Kbd';

const TOOLTIP_GAP_MS = 500;
const TOOLTIP_LAST = { ref: 0 };

export type TooltipSide = 'top' | 'bottom';

export type WithTooltipProps = {
  label: string;
  shortcut?: string;
  side?: TooltipSide;
  children: React.ReactNode;
};

type Pos = { top: number; left: number; transformOrigin: string };

/**
 * WithTooltip — origin-aware tooltip with skip-delay. The tooltip
 * renders in a portal to document.body so it escapes any overflow:hidden
 * parent (e.g. the scrollable contacts pane). The wrapper span carries
 * only pointer/focus listeners — no absolutely positioned child — so
 * nothing in this component can block clicks on neighboring elements.
 */
export function WithTooltip({ label, shortcut, side = 'bottom', children }: WithTooltipProps) {
  const [open, setOpen] = useState(false);
  const [instant, setInstant] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [mounted, setMounted] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const measure = (): void => {
    const el = wrapperRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (side === 'top') {
      setPos({
        top: r.top - 6,
        left: r.left + r.width / 2,
        transformOrigin: 'bottom center',
      });
    } else {
      setPos({
        top: r.bottom + 6,
        left: r.left + r.width / 2,
        transformOrigin: 'top center',
      });
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onEnter = (): void => {
    const sinceLast = Date.now() - TOOLTIP_LAST.ref;
    const skip = sinceLast < TOOLTIP_GAP_MS;
    setInstant(skip);
    if (skip) {
      setOpen(true);
      return;
    }
    timerRef.current = setTimeout(() => setOpen(true), 350);
  };
  const onLeave = (): void => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setOpen(false);
    TOOLTIP_LAST.ref = Date.now();
  };

  return (
    <span
      ref={wrapperRef}
      className="relative inline-flex"
      style={{ pointerEvents: 'auto' }}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
    >
      {children}
      {mounted
        ? createPortal(
            <AnimatePresence>
              {open && pos ? (
                <motion.span
                  key="tooltip"
                  role="tooltip"
                  aria-hidden
                  initial={
                    instant
                      ? { opacity: 1, scale: 1, y: 0 }
                      : { opacity: 0, scale: 0.94, y: side === 'top' ? 2 : -2 }
                  }
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: side === 'top' ? 1 : -1 }}
                  transition={{
                    duration: instant ? 0 : 0.14,
                    ease: [0.23, 1, 0.32, 1],
                  }}
                  className="pointer-events-none fixed z-[100] inline-flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-md bg-fg px-2 py-1 text-[11px] text-bg shadow-[0_4px_16px_-6px_rgba(0,0,0,0.25)]"
                  style={{
                    top: pos.top,
                    left: pos.left,
                    transform: side === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
                    transformOrigin: pos.transformOrigin,
                  }}
                >
                  <span>{label}</span>
                  {shortcut ? (
                    <Kbd keys={parseShortcut(shortcut)} size="sm" tone="inverted" />
                  ) : null}
                </motion.span>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </span>
  );
}
