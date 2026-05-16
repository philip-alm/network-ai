'use client';

import { useState } from 'react';
import type { Ref } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
} from '@floating-ui/react';
import { Kbd, parseShortcut } from './Kbd';

export type TooltipSide = 'top' | 'bottom';

export type WithTooltipProps = {
  label: string;
  shortcut?: string;
  side?: TooltipSide;
  children: React.ReactNode;
};

const HOVER_DELAY = { open: 350, close: 0 };

/**
 * WithTooltip — built on `@floating-ui/react`.
 *
 * We tried hand-rolling positioning + viewport-collision twice; both
 * attempts produced subtle overflow bugs (mid-animation width
 * measurement, transform-origin drift). Floating UI is what Radix,
 * HeadlessUI, Mantine, shadcn, et al. use under the hood for exactly
 * this reason. Don't reinvent it.
 *
 * Behavior:
 *   - Auto-positions below the trigger (or above when `side="top"`).
 *   - `flip()` swaps sides if there's no room in the preferred direction.
 *   - `shift()` nudges horizontally to stay within the viewport ± 8px.
 *   - `autoUpdate` keeps the tooltip glued to its trigger during scroll
 *     / resize / layout changes.
 *   - 350 ms hover open delay; instant close.
 *   - A11y: real `role="tooltip"`, `useFocus` opens on keyboard focus,
 *     `useDismiss` closes on Escape, `useRole` wires aria-describedby.
 *
 * Trigger pattern: we render a `<span class="inline-flex">` wrapper
 * that owns the floating reference + interaction handlers. This works
 * uniformly across DOM elements, forwardRef components, and plain
 * function components — no `asChild`-style cloneElement gymnastics,
 * and no risk of the ref dropping silently for children that aren't
 * forwardRef'd (React 18). The wrapper is `inline-flex` so it inherits
 * the child's layout shape and doesn't introduce a layout box.
 */
export function WithTooltip({ label, shortcut, side = 'bottom', children }: WithTooltipProps) {
  const [open, setOpen] = useState(false);

  const { refs, floatingStyles, context, placement } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: side,
    middleware: [
      offset(6),
      // For top/bottom placements the recommended ordering is flip
      // first (pick the right side), then shift (nudge into viewport).
      flip({ padding: 8 }),
      shift({ padding: 8 }),
    ],
    whileElementsMounted: autoUpdate,
  });

  const hover = useHover(context, { delay: HOVER_DELAY, move: false });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });

  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);

  // Scale-in direction follows the resolved placement so the tooltip
  // appears to come out of the trigger edge, not from its own center.
  const isTop = placement.startsWith('top');
  const enterY = isTop ? 2 : -2;

  return (
    <>
      <span
        ref={refs.setReference as Ref<HTMLSpanElement>}
        {...getReferenceProps()}
        className="relative inline-flex"
      >
        {children}
      </span>
      <FloatingPortal>
        <AnimatePresence>
          {open ? (
            // Two-layer structure is INTENTIONAL: Floating UI writes
            // `transform: translate(x, y)` into `floatingStyles` to
            // position the tooltip. If we put `motion.div` here, its
            // scale animation overwrites `transform` and the tooltip
            // collapses to (0,0) — the top-left bug. Split positioning
            // (outer) from animation (inner) so they don't compete.
            <div
              ref={refs.setFloating as Ref<HTMLDivElement>}
              {...(getFloatingProps() as Record<string, unknown>)}
              style={{ ...floatingStyles, zIndex: 100 }}
              data-testid="tooltip-position-wrapper"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.94, y: enterY }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: enterY / 2 }}
                transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
                className="pointer-events-none inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-fg px-2 py-1 text-[11px] text-bg shadow-[0_4px_16px_-6px_rgba(0,0,0,0.25)]"
              >
                <span>{label}</span>
                {shortcut ? <Kbd keys={parseShortcut(shortcut)} size="sm" tone="inverted" /> : null}
              </motion.div>
            </div>
          ) : null}
        </AnimatePresence>
      </FloatingPortal>
    </>
  );
}
