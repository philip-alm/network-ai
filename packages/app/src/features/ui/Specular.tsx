'use client';

import { useRef, useState } from 'react';

export type SpecularProps = {
  children: React.ReactNode;
  className?: string;
  /** 0-100, alpha % at the peak of the highlight. */
  intensity?: number;
  size?: number;
  radius?: string;
  hoverOnly?: boolean;
};

/**
 * Specular — cursor-tracking radial-gradient highlight overlay.
 * Wraps any surface and fades a soft light spot at the pointer on
 * hover. Uses `var(--color-fg)` so it's a light wash in dark mode and
 * a dark wash in light mode (the highlight auto-adapts).
 *
 * Sets style props directly on the element (not on a parent) so
 * children-style recalc doesn't fire on every pointermove.
 */
export function Specular({
  children,
  className = '',
  intensity = 6,
  size = 260,
  radius = '12px',
  hoverOnly = true,
}: SpecularProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(!hoverOnly);

  const onMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--spec-x', `${e.clientX - rect.left}px`);
    el.style.setProperty('--spec-y', `${e.clientY - rect.top}px`);
  };

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerEnter={hoverOnly ? () => setActive(true) : undefined}
      onPointerLeave={hoverOnly ? () => setActive(false) : undefined}
      className={`relative ${className}`}
    >
      {children}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(${size}px circle at var(--spec-x, 50%) var(--spec-y, -20%), color-mix(in oklch, var(--color-fg) ${intensity}%, transparent), transparent 65%)`,
          opacity: active ? 1 : 0,
          transition: 'opacity 240ms var(--ease-out)',
          borderRadius: radius,
        }}
      />
    </div>
  );
}
