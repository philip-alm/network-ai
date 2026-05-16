'use client';

import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

/**
 * VirtualList — generic variable-height virtualization over a list of
 * items keyed by id. Renders only ~30 DOM nodes at a time regardless
 * of dataset size; gracefully handles expandable rows via the dynamic
 * measurement path (`measureElement`).
 *
 * Props:
 *   - items: the source list (must be referentially stable for items
 *     that haven't changed; pass the memoized list)
 *   - renderItem: returns a node for one item. Inside, the row MUST
 *     respect its provided `style`'s height — that's how the
 *     virtualizer hands you the slot.
 *   - estimateSize: a quick guess for first paint. Real heights are
 *     measured on mount; the virtualizer recalculates.
 *   - getScrollElement: the scroll container ref OR null to use the
 *     internal scroller this component renders.
 *
 * The contacts pane scrolls the whole section (not just the list), so
 * we accept an external scroll element. Pass it from the parent if you
 * want the virtualizer to track it; otherwise we provide our own.
 */
export type VirtualListProps<T extends { id: string }> = {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  estimateSize?: number;
  /** External scroll container (the pane). If omitted, we render an
   *  internal scroller. */
  scrollElement?: HTMLElement | null;
  /** Overscan rows beyond the visible viewport. Default 6. */
  overscan?: number;
  /** Extra padding above and below the rendered window (px). */
  paddingStart?: number;
  paddingEnd?: number;
};

export function VirtualList<T extends { id: string }>({
  items,
  renderItem,
  estimateSize = 64,
  scrollElement,
  overscan = 6,
  paddingStart = 0,
  paddingEnd = 0,
}: VirtualListProps<T>) {
  const internalRef = useRef<HTMLDivElement>(null);

  // The virtualizer needs a getter that returns the scroll element.
  // When scrollElement is null, return our internal ref's current.
  const getScrollEl = (): HTMLElement | null => scrollElement ?? internalRef.current;

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: getScrollEl,
    estimateSize: () => estimateSize,
    overscan,
    paddingStart,
    paddingEnd,
    getItemKey: (i) => items[i]?.id ?? i,
  });

  // Re-measure when the items list identity changes (e.g. after a
  // sort) so the virtualizer doesn't carry stale heights.
  useEffect(() => {
    virtualizer.measure();
  }, [items, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  const inner = (
    <div style={{ position: 'relative', height: totalSize, width: '100%' }}>
      {virtualItems.map((vi) => {
        const item = items[vi.index];
        if (!item) return null;
        return (
          <div
            key={vi.key}
            ref={virtualizer.measureElement}
            data-index={vi.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              transform: `translateY(${vi.start}px)`,
            }}
          >
            {renderItem(item, vi.index)}
          </div>
        );
      })}
    </div>
  );

  if (scrollElement) {
    // Caller owns the scroll element. We just render the virtual stack.
    return inner;
  }

  return (
    <div ref={internalRef} style={{ height: '100%', overflow: 'auto', contain: 'strict' }}>
      {inner}
    </div>
  );
}
