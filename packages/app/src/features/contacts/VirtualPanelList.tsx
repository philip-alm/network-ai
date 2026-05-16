'use client';

/**
 * VirtualPanelList — single virtualizer over the whole right pane (contacts
 * section + assets section). Items are typed; estimateSize and rendering
 * dispatch on type. Picked over "two virtualizers with scrollMargin"
 * because the single-virtualizer model has no header-offset bookkeeping
 * and a unified scrollbar, which is what the rest of the app expects.
 *
 * Design notes (sourced from @tanstack/react-virtual docs + production
 * patterns — see commit message + repo MOTION.md):
 *
 *  - `data-index` + virtualizer.measureElement on the OUTER row div.
 *    Required for ResizeObserver-driven re-measure when a row expands.
 *
 *  - The virtualizer owns the outer transform (`translateY(start)`).
 *    Per-item entry animation (the cascade) lives on an INNER wrapper
 *    so the two transforms don't conflict. (See discussion #413.)
 *
 *  - `estimateSize` reflects the COMMON case (closed-row height). Over-
 *    estimating wastes initial render budget; under-estimating causes
 *    scroll-up jumps as rows are revealed and measured.
 *
 *  - `getItemKey` is memoized via useCallback. Typed prefix (`c-${id}`,
 *    `a-${id}`, etc.) prevents collisions across item kinds. Stable
 *    keys are the entire mechanism that preserves the measurement
 *    cache across reorders.
 *
 *  - shouldAdjustScrollPositionOnItemSizeChange: only adjusts when the
 *    changing row is ABOVE the viewport. So expanding an in-view row
 *    never shoves the scroll; expanding a row above the viewport
 *    anchors content in place.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Contact, Asset } from '../../lib/store';

/** The taxonomy of things that can appear in the right pane. The pane
 *  shows either contacts OR assets at a time (no "both" view), so we
 *  never need an inline section header between them. */
export type PanelItem =
  | { type: 'contact'; data: Contact; pinned: boolean; cascadeIndex: number }
  | { type: 'asset'; data: Asset; pinned: boolean; cascadeIndex: number }
  | { type: 'pinned-label'; section: 'contacts' | 'assets'; count: number }
  | { type: 'pinned-divider'; section: 'contacts' | 'assets' }
  | { type: 'first-entry-caption' };

/**
 * Per-type size estimates (px). These are HINTS; the real size is
 * measured at runtime via ResizeObserver. Estimates that match the
 * common case minimize scroll-up stutter from off-screen re-measuring.
 */
export const PANEL_ITEM_ESTIMATES: Record<PanelItem['type'], number> = {
  contact: 44,
  asset: 44,
  'pinned-label': 28,
  'pinned-divider': 14,
  'first-entry-caption': 60,
};

/** Stable, collision-free keys per item kind. */
export function panelItemKey(item: PanelItem): string {
  switch (item.type) {
    case 'contact':
      return `c-${item.data.id}`;
    case 'asset':
      return `a-${item.data.id}`;
    case 'pinned-label':
      return `pl-${item.section}`;
    case 'pinned-divider':
      return `pd-${item.section}`;
    case 'first-entry-caption':
      return 'fec';
  }
}

export type VirtualPanelListProps = {
  items: PanelItem[];
  /** Outer scroll container. The virtualizer subscribes to scroll on
   *  this element. Passed as a ref object so the virtualizer reads the
   *  CURRENT element after refs are populated (first render is null). */
  scrollerRef: RefObject<HTMLElement | null>;
  renderItem: (item: PanelItem) => React.ReactNode;
  /** Number of off-screen rows kept mounted to avoid blank gaps during
   *  fast scroll. Default 8 — enough for inertial scroll without
   *  inflating React work per frame. */
  overscan?: number;
  /** Scroll-to intent fired by useNavigateToRow / store.jumpTo. The
   *  list locates the row by (kind, id) in its items array and calls
   *  virtualizer.scrollToIndex so an off-screen row scrolls into the
   *  render window. The row component's own scrollIntent effect then
   *  takes over (open + highlight pulse + 1.2s clear). Without this,
   *  any row past the overscan window is silently un-scrollable. */
  scrollIntent?: { id: string; kind: 'contact' | 'asset'; nonce: number } | null;
  /** Test-only: skip the virtualizer and render every item. JSDOM has
   *  no layout, so virtualization can't be exercised meaningfully in
   *  unit tests; this lets DOM-assertion tests still verify rendering. */
  disableVirtualization?: boolean;
};

export function VirtualPanelList({
  items,
  scrollerRef,
  renderItem,
  overscan = 8,
  scrollIntent = null,
  disableVirtualization = false,
}: VirtualPanelListProps): React.ReactElement {
  // Memoized so the virtualizer's measurement cache doesn't churn on
  // every parent render (the cache is keyed by getItemKey identity).
  const getItemKey = useCallback((index: number) => panelItemKey(items[index]), [items]);
  const estimateSize = useCallback(
    (index: number) => PANEL_ITEM_ESTIMATES[items[index].type],
    [items],
  );

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize,
    getItemKey,
    overscan,
  });

  // Anchored re-measure: rows ABOVE the viewport adjust scrollTop
  // when they change size (keeps content visually pinned); rows AT or
  // BELOW the viewport don't, so expanding an in-view row never
  // shoves the scroll. This lives as a settable property on the
  // virtualizer instance (NOT a constructor option in v3.14), so wire
  // it up via layout effect right after creation.
  useLayoutEffect(() => {
    virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) => {
      const offset = instance.scrollOffset ?? 0;
      return item.start < offset;
    };
  }, [virtualizer]);

  // scrollIntent → virtualizer.scrollToIndex.
  //
  // Two-phase scroll: (1) virtualizer scrolls the parent so the row's
  // index lands near the middle of the viewport — this also forces
  // the row component to mount via the overscan window; (2) the row
  // component's own scrollIntent effect runs scrollIntoView for the
  // final fine adjustment + opens the row + clears highlight after
  // the pulse. Re-fires whenever `nonce` changes, so a second click
  // on the same id re-scrolls.
  //
  // Tracked with `lastHandledNonceRef` (NOT a useEffect dep) so the
  // effect can read the current items list without re-running on every
  // items rebuild — re-running on items would re-scroll on every
  // realtime upsert, which would yank the scroll position out from
  // under the user.
  const lastHandledNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!scrollIntent) return;
    if (lastHandledNonceRef.current === scrollIntent.nonce) return;
    const targetType = scrollIntent.kind;
    const index = items.findIndex((it) => it.type === targetType && it.data.id === scrollIntent.id);
    if (index < 0) return; // Row not in items yet — useNavigateToRow will re-fire after upsert.
    lastHandledNonceRef.current = scrollIntent.nonce;
    if (disableVirtualization) return; // Tests assert the index lookup, not the scroll.
    virtualizer.scrollToIndex(index, { align: 'center', behavior: 'smooth' });
  }, [scrollIntent, items, virtualizer, disableVirtualization]);

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // Fallback: render every item without virtualization. Used in tests
  // (JSDOM has no layout) and as a degenerate safety net if the
  // virtualizer hasn't initialized yet.
  if (disableVirtualization) {
    return (
      <div data-testid="virtual-panel-list" data-virtualized="false">
        {items.map((item, index) => (
          <div key={panelItemKey(item)} data-index={index}>
            {renderItem(item)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      data-testid="virtual-panel-list"
      data-virtualized="true"
      style={{
        position: 'relative',
        height: totalSize,
        width: '100%',
      }}
    >
      {virtualItems.map((vi) => {
        const item = items[vi.index];
        return (
          <div
            key={vi.key}
            ref={virtualizer.measureElement}
            data-index={vi.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${vi.start}px)`,
            }}
          >
            {renderItem(item)}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Locate a row in the items list by (kind, id). Pure + extracted from
 * the scroll-intent effect so tests can assert the lookup directly
 * without needing the virtualizer + DOM layout. Returns -1 when the
 * row isn't present, which the caller treats as "wait for upsert."
 */
export function findRowIndex(items: PanelItem[], kind: 'contact' | 'asset', id: string): number {
  return items.findIndex((it) => it.type === kind && it.data.id === id);
}

/**
 * Pure builder for the typed item list the virtualizer renders. Kept
 * separate from the React component so it can be unit-tested without
 * mounting anything.
 */
export function buildPanelItems(input: {
  view: 'contacts' | 'assets';
  visibleContacts: Contact[];
  visibleAssets: Asset[];
  pinnedContactIds: Set<string>;
  pinnedAssetIds: Set<string>;
  showContacts: boolean;
  showAssets: boolean;
  showFirstEntryCaption: boolean;
}): PanelItem[] {
  const items: PanelItem[] = [];
  let cascadeIndex = 0;

  if (input.showContacts) {
    const pinned = input.visibleContacts.filter((c) => input.pinnedContactIds.has(c.id));
    const rest = input.visibleContacts.filter((c) => !input.pinnedContactIds.has(c.id));

    if (pinned.length > 0) {
      items.push({ type: 'pinned-label', section: 'contacts', count: pinned.length });
      for (const c of pinned) {
        items.push({ type: 'contact', data: c, pinned: true, cascadeIndex: cascadeIndex++ });
      }
      items.push({ type: 'pinned-divider', section: 'contacts' });
    }
    for (const c of rest) {
      items.push({ type: 'contact', data: c, pinned: false, cascadeIndex: cascadeIndex++ });
    }
    if (input.showFirstEntryCaption) {
      items.push({ type: 'first-entry-caption' });
    }
  }

  if (input.showAssets) {
    const pinned = input.visibleAssets.filter((a) => input.pinnedAssetIds.has(a.id));
    const rest = input.visibleAssets.filter((a) => !input.pinnedAssetIds.has(a.id));

    if (pinned.length > 0) {
      items.push({ type: 'pinned-label', section: 'assets', count: pinned.length });
      for (const a of pinned) {
        items.push({ type: 'asset', data: a, pinned: true, cascadeIndex: cascadeIndex++ });
      }
      items.push({ type: 'pinned-divider', section: 'assets' });
    }
    for (const a of rest) {
      items.push({ type: 'asset', data: a, pinned: false, cascadeIndex: cascadeIndex++ });
    }
  }

  return items;
}
