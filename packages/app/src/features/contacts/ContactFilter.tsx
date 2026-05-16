'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Filter, X, Briefcase, Clock } from 'lucide-react';
import type { Contact, ContactFilterState as StoreContactFilterState } from '../../lib/store';
import { EMPTY_CONTACT_FILTER } from '../../lib/store';
import { applyContactFilter, isContactFilterEmpty } from './panelLogic';
import { WithTooltip } from '../ui';

// Re-export the canonical store types under their old names so existing
// imports across the contacts feature keep working.
export type ContactFilterState = StoreContactFilterState;
export const emptyFilter: ContactFilterState = EMPTY_CONTACT_FILTER;
export const isFilterEmpty = isContactFilterEmpty;

/** Back-compat wrapper around the canonical applyContactFilter. New
 *  call sites should prefer panelLogic.applyContactFilter directly,
 *  which takes the assets list (needed for the hasAssets facet). */
export function applyFilter(contacts: Contact[], f: ContactFilterState): Contact[] {
  return applyContactFilter(contacts, f, { assets: [], search: '' });
}

type Counts = {
  tags: Array<[string, number]>;
  cities: Array<[string, number]>;
  warmth: Array<[number, number]>;
};

function inventory(contacts: Contact[]): Counts {
  const tagMap = new Map<string, number>();
  const cityMap = new Map<string, number>();
  const warmthMap = new Map<number, number>();
  for (const c of contacts) {
    for (const t of c.tags) tagMap.set(t, (tagMap.get(t) ?? 0) + 1);
    if (c.city) cityMap.set(c.city, (cityMap.get(c.city) ?? 0) + 1);
    if (c.warmth != null) warmthMap.set(c.warmth, (warmthMap.get(c.warmth) ?? 0) + 1);
  }
  const byCount = <T,>(a: [T, number], b: [T, number]): number => b[1] - a[1];
  return {
    tags: [...tagMap.entries()].sort(byCount),
    cities: [...cityMap.entries()].sort(byCount),
    warmth: [...warmthMap.entries()].sort((a, b) => a[0] - b[0]),
  };
}

export type ContactFilterProps = {
  contacts: Contact[];
  value: ContactFilterState;
  onChange: (next: ContactFilterState) => void;
};

/**
 * ContactFilter — a smart filter dropdown that introspects the current
 * contacts list. Only renders categories that have data; ranks tag and
 * city options by frequency (most common first). Portaled to escape
 * the contacts pane's overflow:hidden clipping.
 */
export function ContactFilter({ contacts, value, onChange }: ContactFilterProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const counts = useMemo(() => inventory(contacts), [contacts]);
  const totalChips = counts.tags.length + counts.cities.length + counts.warmth.length;
  const hasAnyData = totalChips > 0;
  const activeCount =
    value.tags.length +
    value.cities.length +
    value.warmth.length +
    (value.hasAssets != null ? 1 : 0) +
    (value.updatedWithinDays != null ? 1 : 0);

  const measure = (): void => {
    const el = buttonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Anchor the dropdown's RIGHT edge to the button's right edge.
    // Computed in viewport coordinates so it works with position:fixed
    // and doesn't fight Motion's transform animation.
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

  const toggleTag = (t: string): void => {
    onChange({
      ...value,
      tags: value.tags.includes(t) ? value.tags.filter((x) => x !== t) : [...value.tags, t],
    });
  };
  const toggleCity = (c: string): void => {
    onChange({
      ...value,
      cities: value.cities.includes(c) ? value.cities.filter((x) => x !== c) : [...value.cities, c],
    });
  };
  const toggleWarmth = (w: number): void => {
    onChange({
      ...value,
      warmth: value.warmth.includes(w) ? value.warmth.filter((x) => x !== w) : [...value.warmth, w],
    });
  };

  return (
    <>
      <WithTooltip label="Filter">
        <button
          ref={buttonRef}
          type="button"
          aria-label="Filter"
          aria-expanded={open}
          data-testid="contacts-filter-trigger"
          onClick={() => setOpen((v) => !v)}
          className={`relative inline-flex h-7 w-7 items-center justify-center rounded-md transition-all duration-[140ms] active:scale-[0.95] ${
            activeCount > 0
              ? 'bg-accent-soft text-accent'
              : 'text-faint hover:bg-surface-soft hover:text-fg focus-visible:bg-surface-soft focus-visible:text-fg'
          }`}
          style={{
            transitionTimingFunction: 'var(--ease-out)',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <Filter size={13} aria-hidden />
          {activeCount > 0 ? (
            <span
              aria-hidden
              className="absolute -right-1 -top-1 inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-accent px-0.5 font-mono text-[9px] font-medium text-bg"
            >
              {activeCount}
            </span>
          ) : null}
        </button>
      </WithTooltip>

      {mounted
        ? createPortal(
            <AnimatePresence>
              {open && pos ? (
                <motion.div
                  ref={popoverRef}
                  key="filter-popover"
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
                  role="dialog"
                  aria-label="Filter contacts"
                  className="fixed z-[80] w-[280px] origin-top-right overflow-hidden rounded-xl bg-surface"
                  style={{
                    top: pos.top,
                    right: pos.right,
                    boxShadow:
                      '0 0 0 1px var(--color-border), 0 16px 40px -16px oklch(0% 0 0 / 0.45)',
                  }}
                >
                  {!hasAnyData ? (
                    <div className="px-4 py-5 text-center text-xs text-faint">
                      Nothing to filter on yet. Add a contact with a tag or city.
                    </div>
                  ) : (
                    <div className="max-h-[60vh] overflow-y-auto px-3 py-3">
                      {counts.tags.length > 0 ? (
                        <FilterSection title="Tags">
                          <ChipRow>
                            {counts.tags.map(([tag, n]) => (
                              <FilterChip
                                key={tag}
                                label={tag}
                                count={n}
                                active={value.tags.includes(tag)}
                                onClick={() => toggleTag(tag)}
                              />
                            ))}
                          </ChipRow>
                        </FilterSection>
                      ) : null}

                      {counts.cities.length > 0 ? (
                        <FilterSection title="Cities">
                          <ChipRow>
                            {counts.cities.map(([city, n]) => (
                              <FilterChip
                                key={city}
                                label={city}
                                count={n}
                                active={value.cities.includes(city)}
                                onClick={() => toggleCity(city)}
                              />
                            ))}
                          </ChipRow>
                        </FilterSection>
                      ) : null}

                      {counts.warmth.length > 0 ? (
                        <FilterSection title="Warmth">
                          <ChipRow>
                            {counts.warmth.map(([w, n]) => (
                              <FilterChip
                                key={w}
                                label={`Warmth ${w}`}
                                count={n}
                                active={value.warmth.includes(w)}
                                onClick={() => toggleWarmth(w)}
                              />
                            ))}
                          </ChipRow>
                        </FilterSection>
                      ) : null}

                      <FilterSection title="More">
                        <ChipRow>
                          <FilterChip
                            label="Has assets"
                            Icon={Briefcase}
                            active={value.hasAssets === true}
                            onClick={() =>
                              onChange({
                                ...value,
                                hasAssets: value.hasAssets === true ? null : true,
                              })
                            }
                          />
                          <FilterChip
                            label="No assets"
                            Icon={Briefcase}
                            active={value.hasAssets === false}
                            onClick={() =>
                              onChange({
                                ...value,
                                hasAssets: value.hasAssets === false ? null : false,
                              })
                            }
                          />
                          <FilterChip
                            label="Updated 7d"
                            Icon={Clock}
                            active={value.updatedWithinDays === 7}
                            onClick={() =>
                              onChange({
                                ...value,
                                updatedWithinDays: value.updatedWithinDays === 7 ? null : 7,
                              })
                            }
                          />
                          <FilterChip
                            label="Updated 30d"
                            Icon={Clock}
                            active={value.updatedWithinDays === 30}
                            onClick={() =>
                              onChange({
                                ...value,
                                updatedWithinDays: value.updatedWithinDays === 30 ? null : 30,
                              })
                            }
                          />
                        </ChipRow>
                      </FilterSection>
                    </div>
                  )}

                  {activeCount > 0 ? (
                    <div className="flex items-center justify-between border-t border-border-soft px-3 py-2">
                      <span className="text-xs text-faint tabular-nums">{activeCount} active</span>
                      <button
                        type="button"
                        onClick={() => onChange(emptyFilter)}
                        data-testid="contacts-filter-clear"
                        className="inline-flex items-center gap-1 rounded-sm px-1.5 py-1 text-xs text-muted transition-all duration-[140ms] hover:bg-surface-soft hover:text-fg focus-visible:bg-surface-soft focus-visible:text-fg active:scale-[0.96]"
                        style={{
                          transitionTimingFunction: 'var(--ease-out)',
                          WebkitTapHighlightColor: 'transparent',
                        }}
                      >
                        <X size={10} aria-hidden />
                        Clear
                      </button>
                    </div>
                  ) : null}
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="py-2 first:pt-1 last:pb-1">
      <h3 className="mb-2 px-1 text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

function FilterChip({
  label,
  count,
  active,
  onClick,
  Icon,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  Icon?: typeof Briefcase;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={`filter-chip-${label}`}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-all duration-[140ms] active:scale-[0.96] ${
        active ? 'bg-accent text-bg' : 'bg-surface-soft text-fg hover:bg-bg focus-visible:bg-bg'
      }`}
      style={{
        transitionTimingFunction: 'var(--ease-out)',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {Icon ? <Icon size={10} aria-hidden /> : null}
      <span className="truncate">{label}</span>
      {count != null ? (
        <span
          className={`font-mono text-[10px] tabular-nums ${active ? 'text-bg/70' : 'text-faint'}`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
