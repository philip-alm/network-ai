'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Undo2,
  Notebook,
  Users,
  Briefcase,
  ArrowUpRight,
  Search,
  X,
  Sparkles,
  Pin,
  ChevronRight,
} from 'lucide-react';
import { ContactRow } from './ContactRow';
import { useFirstContactDelight } from './useFirstContactDelight';
import { ContactFilter, type ContactFilterState } from './ContactFilter';
import { ContactSort, type ContactSortMode } from './ContactSort';
import {
  applyPinning,
  buildAssetsByOwnerMap,
  getOwnAssets,
  isContactFilterEmpty,
  isAssetFilterEmpty,
} from './panelLogic';
import { iconForAsset } from './assetIcons';
import { SkeletonRows } from './SkeletonRows';
import { CountUp } from './CountUp';
import { ProgressRing } from './ProgressRing';
import { LoadingMoreTail } from './LoadingMoreTail';
import { useCascadeIn } from './useCascadeIn';
import { useOwnerName } from './useOwnerName';
import { VirtualPanelList, buildPanelItems, type PanelItem } from './VirtualPanelList';
import type { NetworkTotals, NetworkFacets } from './useContacts';
import { useNavigateToRow } from './useNavigateToRow';
import { useNetworkStore, type Contact, type Asset, type PanelState } from '../../lib/store';
import { getBrowserSupabase } from '../../lib/supabase';
import { SoftDivider, WithTooltip, Kbd } from '../ui';

export type ContactsAccordionProps = {
  contacts: Contact[];
  assets: Asset[];
  totals: NetworkTotals;
  filteredTotals: NetworkTotals;
  facets: NetworkFacets;
  hasMore: { contacts: boolean; assets: boolean };
  isLoadingMore: { contacts: boolean; assets: boolean };
  isLoading: boolean;
  /** A page-1 refetch is in flight (per kind). UI dims existing rows
   *  so the user sees something is happening but doesn't watch them
   *  disappear and reappear. */
  isRefetching: { contacts: boolean; assets: boolean };
  /** User is typing but the search debounce hasn't fired yet. Drives
   *  the search-input spinner. */
  isSearchPending: boolean;
  loadMore: (kind: 'contacts' | 'assets') => Promise<void>;
  /** Last RPC error, if any. Drives the retry banner. */
  error: string | null;
  /** Imperative retry — clears error and refetches everything. */
  retry: () => Promise<void>;
  onChange?: () => void;
};

const UNDO_WINDOW_MS = 5000;
/** Prefetch the next page when the user has fewer than this many
 *  VIEWPORT HEIGHTS of content remaining below the fold. Viewport-
 *  relative beats fixed-row-count because expanded rows are 200-600px
 *  while closed rows are 44px — a fixed row-count threshold fires too
 *  late when many rows are open. 1.5 viewports = comfortable lead
 *  time for inertial scrolling without thrashing. */
const PREFETCH_VIEWPORT_RATIO = 1.5;

type PendingDelete = {
  contact: Contact;
  expiresAt: number;
};

export function ContactsAccordion({
  contacts,
  assets,
  totals,
  filteredTotals,
  facets,
  hasMore,
  isLoadingMore,
  isLoading,
  isRefetching,
  isSearchPending,
  loadMore,
  error,
  retry,
}: ContactsAccordionProps) {
  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const { upsertContacts, removeContact, setPanelState, clearPanelFilters, restorePanelState } =
    useNetworkStore((s) => s.actions);
  // Jump-to-owner from an asset row is the same primitive the palette
  // and @mentions use — fetches the contact on miss, switches view if
  // needed, drives both the virtualizer scroll AND the row's open pulse.
  const navigate = useNavigateToRow();
  const panel = useNetworkStore((s) => s.panel);
  // scrollIntent is consumed by VirtualPanelList (off-screen scroll) AND
  // by mounted ContactRow / AssetRow (the open + pulse on the right
  // row). We subscribe once here and pass it down so the virtualizer's
  // re-scroll triggers come through the React render cycle alongside
  // any items-list rebuild from upsert (so findRowIndex hits the new
  // row, not a stale list).
  const scrollIntent = useNetworkStore((s) => s.scrollIntent);
  const undoSnapshot = useNetworkStore((s) => s.panelUndoSnapshot);
  const loading = useNetworkStore((s) => s.loading);
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [expandedAssetIds, setExpandedAssetIds] = useState<Set<string>>(() => new Set());
  const toggleAssetExpanded = useCallback((id: string): void => {
    setExpandedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollerRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const filter = panel.contactFilter;
  const sort = panel.contactSort;
  const view = panel.view;
  const search = panel.search;
  const setFilter = useCallback(
    (next: ContactFilterState): void => setPanelState({ contactFilter: next }),
    [setPanelState],
  );
  const setSort = useCallback(
    (next: ContactSortMode): void => setPanelState({ contactSort: next }),
    [setPanelState],
  );
  const setView = useCallback(
    (next: ViewMode): void => setPanelState({ view: next }),
    [setPanelState],
  );
  const setSearch = useCallback(
    (next: string): void => setPanelState({ search: next }),
    [setPanelState],
  );

  // ── Server is the source of truth for filter + sort + search.
  //    The `contacts` and `assets` props are already filtered, sorted,
  //    and paged by the RPCs in useContacts. We only do client-side:
  //
  //    1. Pinning — small N, user-state, cheap to hoist to top.
  //    2. assetsByOwner Map — for ContactRow's expanded panel. Note:
  //       at scale this only contains LOADED assets; expanded rows
  //       may need to lazy-fetch the contact's full asset set.

  /** contact_id → assets[]. Built from the currently loaded asset
   *  slice. Incomplete at scale, but enough for the open-row preview;
   *  full owned-asset list is fetched on demand by ContactRow. */
  const assetsByOwner = useMemo(() => buildAssetsByOwnerMap(assets), [assets]);

  const pinnedContactSet = useMemo(() => new Set(panel.pinnedContactIds), [panel.pinnedContactIds]);
  const pinnedAssetSet = useMemo(() => new Set(panel.pinnedAssetIds), [panel.pinnedAssetIds]);

  // Visible lists = server result + client-side pin hoisting only.
  const visibleContacts = useMemo(() => {
    if (panel.pinnedContactIds.length === 0) return contacts;
    return applyPinning(contacts, panel.pinnedContactIds).list;
  }, [contacts, panel.pinnedContactIds]);

  const visibleAssets = useMemo(() => {
    if (panel.pinnedAssetIds.length === 0) return assets;
    return applyPinning(assets, panel.pinnedAssetIds).list;
  }, [assets, panel.pinnedAssetIds]);

  // Exactly one of these is true at any time. Two clean toggles, two
  // independent paginated lists — no stacking, no ambiguous "bottom."
  const showContacts = view === 'contacts';
  const showAssets = view === 'assets';
  const { active: firstEntryActive } = useFirstContactDelight(totals.contacts);

  const isPanelDirty =
    !isContactFilterEmpty(panel.contactFilter) ||
    !isAssetFilterEmpty(panel.assetFilter) ||
    panel.search.length > 0 ||
    panel.pinnedContactIds.length > 0 ||
    panel.pinnedAssetIds.length > 0;

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = (): void => setScrolled(el.scrollTop > 4);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const handleDelete = useCallback(
    async (contact: Contact): Promise<void> => {
      if (timerRef.current) clearTimeout(timerRef.current);
      removeContact(contact.id);
      const { error } = await getBrowserSupabase()
        .from('contacts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', contact.id);
      if (error) {
        upsertContacts([contact]);
        return;
      }
      setPending({ contact, expiresAt: Date.now() + UNDO_WINDOW_MS });
      timerRef.current = setTimeout(() => setPending(null), UNDO_WINDOW_MS);
    },
    [upsertContacts, removeContact],
  );
  // Stable callback ref passed to every ContactRow. handleDelete itself
  // is already useCallback-stabilized; this is just a defensive alias.
  const handleDeleteCallback = useCallback(
    (contact: Contact): void => {
      void handleDelete(contact);
    },
    [handleDelete],
  );

  // ── Build the typed panel item list for the virtualizer.
  // One source of truth — pinned labels, dividers, first-entry
  // caption are all items in the same array. The view determines
  // whether it's all contacts or all assets — never both.
  const panelItems = useMemo<PanelItem[]>(
    () =>
      buildPanelItems({
        view,
        visibleContacts: showContacts ? visibleContacts : [],
        visibleAssets: showAssets ? visibleAssets : [],
        pinnedContactIds: pinnedContactSet,
        pinnedAssetIds: pinnedAssetSet,
        showContacts,
        showAssets,
        showFirstEntryCaption: firstEntryActive,
      }),
    [
      view,
      visibleContacts,
      visibleAssets,
      pinnedContactSet,
      pinnedAssetSet,
      showContacts,
      showAssets,
      firstEntryActive,
    ],
  );

  // ── Scroll-to-load-more trigger.
  //
  // Uses the scroller's measured DOM dimensions (NOT estimated row
  // counts), so it works correctly whether the visible window is full
  // of 44px closed rows or 600px expanded ones. Fires when there's
  // less than PREFETCH_VIEWPORT_RATIO × viewport heights of content
  // remaining below the fold.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = (): void => {
      if (!hasMore.contacts && !hasMore.assets) return;
      const viewportHeight = el.clientHeight;
      // scrollHeight is the FULL measured content height (the
      // virtualizer's absolute container provides this via its
      // height = totalSize style). So this delta is real px, not
      // an estimate from row count.
      const distanceFromBottom = el.scrollHeight - (el.scrollTop + viewportHeight);
      if (distanceFromBottom > viewportHeight * PREFETCH_VIEWPORT_RATIO) return;
      // Load whichever kind still has more, contacts first.
      if (hasMore.contacts && !isLoadingMore.contacts) {
        void loadMore('contacts');
      } else if (hasMore.assets && !isLoadingMore.assets) {
        void loadMore('assets');
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    // Initial check on mount — short lists may already be at the
    // bottom on first paint.
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [hasMore.contacts, hasMore.assets, isLoadingMore.contacts, isLoadingMore.assets, loadMore]);

  // Dispatch rendering by item type. The cascade animation wraps the
  // row content on an INNER div; the virtualizer owns the OUTER
  // absolute-positioned transform — so the two transforms compose
  // without conflict.
  const renderPanelItem = useCallback(
    (item: PanelItem): React.ReactNode => {
      switch (item.type) {
        case 'contact':
          return (
            <CascadeRow id={item.data.id} index={item.cascadeIndex}>
              <ContactRow
                contact={item.data}
                ownAssets={getOwnAssets(assetsByOwner, item.data.id)}
                onDelete={handleDeleteCallback}
              />
            </CascadeRow>
          );
        case 'asset': {
          const Icon = iconForAsset(item.data.name, item.data.availability);
          // Pass owner-as-loaded for fast-path render; AssetRow falls
          // back to a lookup_contacts_by_ids call via useOwnerName if
          // the owner isn't in the loaded slice. onJumpToOwner is
          // always provided when the asset has a contact_id — jumpTo
          // itself fetches-on-miss via useJumpTo, so the click works
          // regardless of pagination state.
          const owner = item.data.contact_id ? contactById.get(item.data.contact_id) : null;
          const open = expandedAssetIds.has(item.data.id);
          return (
            <CascadeRow id={item.data.id} index={item.cascadeIndex}>
              <AssetRow
                asset={item.data}
                Icon={Icon}
                owner={owner ?? null}
                open={open}
                onToggle={() => toggleAssetExpanded(item.data.id)}
                onJumpToOwner={
                  item.data.contact_id
                    ? () => void navigate('contact', item.data.contact_id as string)
                    : undefined
                }
              />
            </CascadeRow>
          );
        }
        case 'pinned-label':
          return <PinnedSectionLabel count={item.count} />;
        case 'pinned-divider':
          return (
            <div className="my-2 px-1">
              <SoftDivider />
            </div>
          );
        case 'first-entry-caption':
          return <FirstEntryCaption />;
      }
    },
    [
      assetsByOwner,
      contactById,
      expandedAssetIds,
      handleDeleteCallback,
      navigate,
      toggleAssetExpanded,
    ],
  );

  // Scroll-to-top on sort change. Sort destroys the meaning of the
  // current scroll position (the row at y=1500 is now a different
  // row) — anchoring there would be more confusing than starting
  // from the top.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: 0, behavior: 'auto' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, view, panel.assetSort]);

  const handleUndo = useCallback(async (): Promise<void> => {
    if (!pending) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    const restored: Contact = { ...pending.contact, deleted_at: null };
    upsertContacts([restored]);
    setPending(null);
    const { error } = await getBrowserSupabase()
      .from('contacts')
      .update({ deleted_at: null })
      .eq('id', pending.contact.id);
    if (error) {
      removeContact(pending.contact.id);
    }
  }, [pending, upsertContacts, removeContact]);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      const inField = !!(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'));
      if (inField) return;
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        void handleUndo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, handleUndo]);

  return (
    <section
      ref={scrollerRef}
      data-testid="contacts-accordion"
      className="flex h-full min-h-0 flex-col overflow-y-auto overflow-x-hidden"
    >
      <PanelHeader
        Icon={view === 'assets' ? Briefcase : Users}
        title={view === 'assets' ? 'Assets' : 'Network'}
        // count = matching the current filter (the denominator of
        // "200 of 15,461"); total = everything alive in the user's
        // network. Both are SERVER-REPORTED so they remain honest at
        // any scale — never the .length of what happens to be loaded.
        count={showContacts ? filteredTotals.contacts : filteredTotals.assets}
        total={showContacts ? totals.contacts : totals.assets}
        scrolled={scrolled}
        loadingPhase={isLoading ? 'syncing' : loading.phase}
        actions={
          // Always render the action cluster — even when contacts and
          // assets are still loading. Previously this was conditional on
          // `length > 0`, so on first paint the search + view + sort +
          // filter icons were absent and then popped in once data
          // arrived, shifting the layout. Sort + filter render in every
          // view; their dropdowns are no-ops when there's nothing to act
          // on but the buttons hold their slots.
          <span className="inline-flex items-center gap-1.5">
            <HeaderSearch value={search} onChange={setSearch} pending={isSearchPending} />
            <ViewToggle view={view} onChange={setView} />
            {view !== 'assets' ? (
              <>
                <ContactSort value={sort} onChange={setSort} />
                <ContactFilter facets={facets} value={filter} onChange={setFilter} />
              </>
            ) : null}
          </span>
        }
      />

      <AnimatePresence>
        {isPanelDirty ? (
          <ActiveFiltersBar
            panel={panel}
            contacts={contacts}
            assets={assets}
            hasAiSnapshot={!!undoSnapshot}
            onPatch={(patch) => setPanelState(patch as Parameters<typeof setPanelState>[0])}
            onUndo={() => undoSnapshot && restorePanelState(undoSnapshot)}
            onClearAll={() => clearPanelFilters()}
          />
        ) : null}
      </AnimatePresence>

      {/* States below use SERVER totals as the source of truth, not
          loaded-row counts. "0 of 0" → empty network; "0 of 15,461" →
          filter narrowed everything out.

          CRITICAL guards (race conditions): network_counts returns
          faster than query_contacts_page, so for a moment
          `totals.contacts > 0` while `filteredTotals.contacts === 0`.
          Without the guards the user briefly sees "No contacts match"
          when in fact page 1 is just still loading.

          - SkeletonRows: only on truly fresh load (cold cache + no rows).
          - EmptyContactsState: only when we're DONE loading AND server
            says 0 contacts AND no rows have ever appeared.
          - EmptyFilterState: only when we're DONE loading AND server
            says 0 matches AND nothing is showing in the list. */}
      {showContacts &&
      totals.contacts === 0 &&
      contacts.length === 0 &&
      (isLoading || isRefetching.contacts) ? (
        <SkeletonRows />
      ) : null}
      {showContacts &&
      totals.contacts === 0 &&
      contacts.length === 0 &&
      !isLoading &&
      !isRefetching.contacts ? (
        <EmptyContactsState />
      ) : null}
      {showContacts &&
      totals.contacts > 0 &&
      filteredTotals.contacts === 0 &&
      contacts.length === 0 &&
      !isLoading &&
      !isRefetching.contacts ? (
        <EmptyFilterState onClear={() => clearPanelFilters()} />
      ) : null}
      {/* Error banner — silent failures are unacceptable. When an RPC
          fails, the user gets a clear "Couldn't load — Retry" with one
          click to recover. */}
      {error ? (
        <div
          role="alert"
          data-testid="network-error-banner"
          className="mx-3 mt-2 flex items-center gap-2 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-fg"
        >
          <span aria-hidden className="inline-flex h-1.5 w-1.5 rounded-full bg-danger" />
          <span className="flex-1">
            Couldn't load the network. <span className="text-faint">{error.slice(0, 80)}</span>
          </span>
          <button
            type="button"
            onClick={() => void retry()}
            className="rounded-sm px-2 py-1 text-[11px] font-medium text-fg transition-all duration-[140ms] hover:bg-surface-soft active:scale-[0.96]"
            style={{ transitionTimingFunction: 'var(--ease-out)' }}
          >
            Retry
          </button>
        </div>
      ) : null}

      {/* Virtualized panel list — single virtualizer handles BOTH the
          contacts section and the assets section + their pinned
          subsections, section header, and the first-entry caption.
          Builds a typed `PanelItem[]` and dispatches rendering by type.
          Scales to 100k+ rows: only items in the viewport (~30) are
          mounted at any time. See VirtualPanelList.tsx for the
          virtualization rules + scroll-anchor behavior.

          Stale-during-refetch: when a filter/sort/search changes and a
          new page is loading, we DIM the existing rows (opacity 0.55)
          instead of blanking them. The crossfade reads as "your action
          is being applied" — not "everything broke." */}
      {panelItems.length > 0 ? (
        <div className="px-3 pb-3">
          <div
            style={{
              opacity: isRefetching.contacts || isRefetching.assets ? 0.55 : 1,
              transition: 'opacity 180ms var(--ease-out)',
              pointerEvents: isRefetching.contacts || isRefetching.assets ? 'none' : 'auto',
            }}
          >
            <VirtualPanelList
              items={panelItems}
              scrollerRef={scrollerRef}
              renderItem={renderPanelItem}
              scrollIntent={scrollIntent}
            />
          </div>
          {/* Scroll-prefetch indicator — visible whenever a loadMore
              fetch is in flight. Subtle pulsing dot + "Loading more…"
              so the user knows the next page is on its way. */}
          <LoadingMoreTail visible={isLoadingMore.contacts || isLoadingMore.assets} />
        </div>
      ) : null}

      <AnimatePresence>
        {pending ? (
          <UndoBanner
            key={`undo-${pending.contact.id}`}
            contact={pending.contact}
            expiresAt={pending.expiresAt}
            onUndo={() => void handleUndo()}
          />
        ) : null}
      </AnimatePresence>
    </section>
  );
}

type ViewMode = 'contacts' | 'assets';

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  // Two clean modes — Network (people) ↔ Assets (things). No "both":
  // stacking two paginated lists in one scroller breaks scroll-to-
  // load-more and creates an ambiguous bottom. Toggle when you want
  // to look at the other kind.
  return (
    <span
      className="inline-flex items-center rounded-md bg-bg p-0.5 shadow-hairline-soft"
      role="radiogroup"
      aria-label="View"
    >
      <ViewToggleButton
        active={view === 'contacts'}
        label="Network"
        Icon={Users}
        onClick={() => onChange('contacts')}
      />
      <ViewToggleButton
        active={view === 'assets'}
        label="Assets"
        Icon={Briefcase}
        onClick={() => onChange('assets')}
      />
    </span>
  );
}

/**
 * CascadeRow — wraps a contact row in a one-shot opacity + Y settle the
 * FIRST time React mounts it (tracked by store.seenIds, so virtualization
 * remounts don't re-animate). Subsequent renders are identity-style.
 */
function CascadeRow({
  id,
  index,
  children,
}: {
  id: string;
  index: number;
  children: React.ReactNode;
}) {
  const style = useCascadeIn(id, index);
  return <div style={style}>{children}</div>;
}

function ViewToggleButton({
  active,
  label,
  Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  Icon: typeof Users;
  onClick: () => void;
}) {
  return (
    <WithTooltip label={label}>
      <button
        type="button"
        role="radio"
        aria-checked={active}
        aria-label={label}
        onClick={onClick}
        className={`inline-flex h-6 w-7 items-center justify-center rounded-sm transition-all duration-[140ms] active:scale-[0.92] ${
          active
            ? 'bg-surface text-fg shadow-hairline-soft'
            : 'text-faint hover:text-fg focus-visible:text-fg'
        }`}
        style={{
          transitionTimingFunction: 'var(--ease-out)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <Icon size={13} aria-hidden />
      </button>
    </WithTooltip>
  );
}

/**
 * PanelSearchBar — text search across both lists. Wired to panel.search.
 */
/**
 * Stub bridges between the user's in-flight refactor and the live build.
 * The user is replacing PanelSearchBar/AIBanner/ClearBanner with a
 * unified HeaderSearch + ActiveFiltersBar. Until those land, these
 * minimal implementations keep the build green and the UX coherent.
 */
/**
 * HeaderSearch — always-visible filter input sitting in the panel header.
 * Mirrors the visual language of the top-bar global search (icon-left,
 * placeholder always shown, trailing kbd hint or clear-X on the right,
 * surface-soft bed that lifts to bg on focus) so the two search surfaces
 * feel like one product.
 *
 * Behaviour: filters the visible list as you type (drives `panel.search`).
 * When AI sets `panel.search`, the value appears here automatically — same
 * affordance whether user or AI authored it.
 */
function HeaderSearch({
  value,
  onChange,
  pending = false,
}: {
  value: string;
  onChange: (v: string) => void;
  /** A search is debouncing / RTT in flight. Drives the pulse on the
   *  leading search icon so the user knows their keystroke registered. */
  pending?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const active = focused || value.length > 0;

  return (
    <label
      className={`group relative inline-flex h-7 w-[200px] items-center gap-2 rounded-md pl-2.5 pr-1.5 transition-all duration-[160ms] focus-within:shadow-focus md:w-[240px] ${
        active ? 'bg-bg shadow-hairline-soft' : 'bg-surface-soft hover:bg-bg/60'
      }`}
      style={{ transitionTimingFunction: 'var(--ease-out)' }}
    >
      <Search
        size={12}
        aria-hidden
        className={`shrink-0 transition-colors duration-[140ms] ${
          active ? 'text-accent' : 'text-faint group-hover:text-muted'
        }`}
        style={{
          // When a search round-trip is pending, pulse the icon so the
          // user can tell their keystroke is being processed (avoids
          // the "is anything happening?" gap of debounce + RTT).
          animation: pending ? 'reknowable-pulse 900ms ease-in-out infinite' : undefined,
        }}
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            if (value) onChange('');
            else (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder="Filter the list"
        aria-label="Filter the network pane"
        data-testid="header-search"
        className="min-w-0 flex-1 bg-transparent text-[12px] tracking-tight text-fg outline-none placeholder:text-faint"
      />
      {value ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onChange('');
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          data-testid="header-search-clear"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-faint transition-all duration-[140ms] hover:bg-surface-soft hover:text-fg active:scale-[0.92]"
          style={{
            transitionTimingFunction: 'var(--ease-out)',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <X size={12} aria-hidden />
        </button>
      ) : null}
    </label>
  );
}

/**
 * ActiveFiltersBar — single honest surface for "what's narrowing the list
 * right now." One chip per active facet (city, tag, warmth, has-assets,
 * recency, owner, availability, pinned items by name). Each chip's X
 * removes that single facet — mirrors how the user toggles it off in
 * the filter dropdown.
 *
 * AI authorship is signaled by a small Sparkles "AI" badge + an
 * "Undo Reknowable" button. Undo is the only AI-specific affordance;
 * chips, remove-X, and "Clear all" behave identically regardless of
 * who set them. The AI uses the same UI surface as the user.
 */
function ActiveFiltersBar({
  panel,
  contacts,
  assets,
  hasAiSnapshot,
  onPatch,
  onUndo,
  onClearAll,
}: {
  panel: PanelState;
  contacts: Contact[];
  assets: Asset[];
  hasAiSnapshot: boolean;
  onPatch: (patch: Partial<PanelState>) => void;
  onUndo: () => void;
  onClearAll: () => void;
}) {
  const contactNameById = new Map(contacts.map((c) => [c.id, c.name] as const));
  const assetNameById = new Map(assets.map((a) => [a.id, a.name] as const));

  type Chip = { key: string; label: string; pinned?: boolean; onRemove: () => void };
  const chips: Chip[] = [];
  const cf = panel.contactFilter;
  const af = panel.assetFilter;

  cf.cities.forEach((city) =>
    chips.push({
      key: `c-city-${city}`,
      label: city,
      onRemove: () =>
        onPatch({ contactFilter: { ...cf, cities: cf.cities.filter((x) => x !== city) } }),
    }),
  );
  cf.tags.forEach((tag) =>
    chips.push({
      key: `c-tag-${tag}`,
      label: tag,
      onRemove: () => onPatch({ contactFilter: { ...cf, tags: cf.tags.filter((x) => x !== tag) } }),
    }),
  );
  cf.tagsAll.forEach((tag) =>
    chips.push({
      key: `c-tagsall-${tag}`,
      label: `+${tag}`,
      onRemove: () =>
        onPatch({
          contactFilter: { ...cf, tagsAll: cf.tagsAll.filter((x) => x !== tag) },
        }),
    }),
  );
  cf.warmth.forEach((w) =>
    chips.push({
      key: `c-warmth-${w}`,
      label: `Warmth ${w}`,
      onRemove: () =>
        onPatch({ contactFilter: { ...cf, warmth: cf.warmth.filter((x) => x !== w) } }),
    }),
  );
  if (cf.hasAssets != null)
    chips.push({
      key: 'c-hasAssets',
      label: cf.hasAssets ? 'Has assets' : 'No assets',
      onRemove: () => onPatch({ contactFilter: { ...cf, hasAssets: null } }),
    });
  if (cf.updatedWithinDays != null)
    chips.push({
      key: 'c-recent',
      label: `Updated ${cf.updatedWithinDays}d`,
      onRemove: () => onPatch({ contactFilter: { ...cf, updatedWithinDays: null } }),
    });

  af.tags.forEach((tag) =>
    chips.push({
      key: `a-tag-${tag}`,
      label: `Asset: ${tag}`,
      onRemove: () => onPatch({ assetFilter: { ...af, tags: af.tags.filter((x) => x !== tag) } }),
    }),
  );
  af.tagsAll.forEach((tag) =>
    chips.push({
      key: `a-tagsall-${tag}`,
      label: `Asset: +${tag}`,
      onRemove: () =>
        onPatch({
          assetFilter: { ...af, tagsAll: af.tagsAll.filter((x) => x !== tag) },
        }),
    }),
  );
  if (af.hasOwner != null)
    chips.push({
      key: 'a-hasOwner',
      label: af.hasOwner ? 'Attached assets' : 'Unattached assets',
      onRemove: () => onPatch({ assetFilter: { ...af, hasOwner: null } }),
    });
  if (af.availabilityContains)
    chips.push({
      key: 'a-availability',
      label: `Available: ${af.availabilityContains}`,
      onRemove: () => onPatch({ assetFilter: { ...af, availabilityContains: '' } }),
    });
  if (af.updatedWithinDays != null)
    chips.push({
      key: 'a-recent',
      label: `Asset: updated ${af.updatedWithinDays}d`,
      onRemove: () => onPatch({ assetFilter: { ...af, updatedWithinDays: null } }),
    });
  af.ownerIds.forEach((oid) => {
    const name = contactNameById.get(oid) ?? oid.slice(0, 6);
    chips.push({
      key: `a-owner-${oid}`,
      label: `Owner: ${name}`,
      onRemove: () =>
        onPatch({
          assetFilter: { ...af, ownerIds: af.ownerIds.filter((x) => x !== oid) },
        }),
    });
  });

  panel.pinnedContactIds.forEach((id) => {
    const name = contactNameById.get(id);
    if (!name) return;
    chips.push({
      key: `pin-c-${id}`,
      label: name,
      pinned: true,
      onRemove: () => onPatch({ pinnedContactIds: panel.pinnedContactIds.filter((x) => x !== id) }),
    });
  });
  panel.pinnedAssetIds.forEach((id) => {
    const name = assetNameById.get(id);
    if (!name) return;
    chips.push({
      key: `pin-a-${id}`,
      label: name,
      pinned: true,
      onRemove: () => onPatch({ pinnedAssetIds: panel.pinnedAssetIds.filter((x) => x !== id) }),
    });
  });

  if (chips.length === 0) return null;

  return (
    <motion.div
      key="active-filters"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
      className="mx-4 mb-2 flex items-start gap-2 rounded-md bg-surface-soft px-2.5 py-1.5 text-[11.5px]"
      role="status"
      data-testid="active-filters-bar"
    >
      {hasAiSnapshot ? (
        <WithTooltip label="Filters set by Reknowable">
          <span
            aria-label="Set by Reknowable"
            className="mt-px inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-sm bg-accent-soft text-accent"
          >
            <Sparkles size={10} aria-hidden />
          </span>
        </WithTooltip>
      ) : null}
      {/* Chips region: wraps freely, occupies the rest of the row.
          Split into filter chips and pinned chips with a small inline
          PINNED label between, mirroring the in-list section label. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        <AnimatePresence initial={false}>
          {chips
            .filter((c) => !c.pinned)
            .map((chip) => (
              <FilterChipPill key={chip.key} chip={chip} />
            ))}
        </AnimatePresence>
        {chips.some((c) => !c.pinned) && chips.some((c) => c.pinned) ? (
          <span aria-hidden className="mx-0.5 inline-flex h-3 w-px shrink-0 bg-border" />
        ) : null}
        {chips.some((c) => c.pinned) ? (
          <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
            <Pin size={9} aria-hidden className="text-accent" />
            <span>Pinned</span>
          </span>
        ) : null}
        <AnimatePresence initial={false}>
          {chips
            .filter((c) => c.pinned)
            .map((chip) => (
              <FilterChipPill key={chip.key} chip={chip} />
            ))}
        </AnimatePresence>
      </div>
      {/* Actions: anchored to the right, never wrap. */}
      <span className="mt-px inline-flex shrink-0 items-center gap-0.5">
        {hasAiSnapshot ? (
          <button
            type="button"
            onClick={onUndo}
            data-testid="ai-undo"
            className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-medium text-accent transition-all duration-[140ms] hover:bg-bg active:scale-[0.95]"
            style={{
              transitionTimingFunction: 'var(--ease-out)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <Undo2 size={10} aria-hidden />
            Undo
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClearAll}
          data-testid="active-filters-clear"
          className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-medium text-muted transition-all duration-[140ms] hover:bg-bg hover:text-fg active:scale-[0.95]"
          style={{
            transitionTimingFunction: 'var(--ease-out)',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          Clear all
        </button>
      </span>
    </motion.div>
  );
}

function FilterChipPill({
  chip,
}: {
  chip: { key: string; label: string; pinned?: boolean; onRemove: () => void };
}) {
  return (
    <motion.span
      layout="position"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
      className={`group inline-flex items-center gap-1 rounded-sm py-0.5 pl-1.5 pr-0.5 ${
        chip.pinned ? 'bg-accent-soft text-accent' : 'bg-bg text-fg shadow-hairline-soft'
      }`}
    >
      {chip.pinned ? <Pin size={9} aria-hidden className="shrink-0" /> : null}
      <span className="max-w-[18ch] truncate">{chip.label}</span>
      <button
        type="button"
        onClick={chip.onRemove}
        aria-label={`Remove ${chip.label}`}
        data-testid={`chip-remove-${chip.key}`}
        className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm opacity-0 transition-all duration-[140ms] focus-visible:opacity-100 group-hover:opacity-70 hover:!opacity-100 active:scale-[0.92] ${
          chip.pinned ? 'hover:bg-accent/15' : 'hover:bg-surface-soft'
        }`}
        style={{
          transitionTimingFunction: 'var(--ease-out)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <X size={9} aria-hidden />
      </button>
    </motion.span>
  );
}

/**
 * AssetRow — inline expandable asset card.
 *
 * Click anywhere on the row toggles the expanded panel below — same
 * semantics as ContactRow, so the click behavior is consistent
 * regardless of whether the asset is attached to a contact.
 *
 * The owner pill (when present) keeps its own click handler with
 * stopPropagation, so clicking the pill jumps to the owning contact
 * without expanding the asset. Click anywhere else on the row to
 * expand. Inside the expanded panel, the owner is repeated as a
 * bigger button for full visibility.
 *
 * Unattached assets get an "Owned by you" tag (clearer than "Yours").
 */
function AssetRow({
  asset,
  Icon,
  owner,
  open,
  onToggle,
  onJumpToOwner,
}: {
  asset: Asset;
  Icon: typeof Briefcase;
  owner: Contact | null;
  open: boolean;
  onToggle: () => void;
  onJumpToOwner?: () => void;
}) {
  // useOwnerName falls back to the lookup_contacts_by_ids RPC if the
  // owner isn't in the loaded contacts slice. Passing the known name
  // when we have it skips the round trip. Result: the owner pill is
  // always populated, even at scale where the owning contact may be
  // on a different page.
  const resolvedOwnerName = useOwnerName(asset.contact_id ?? null, owner?.name ?? null);

  // scrollIntent → scrollIntoView + open + clear highlight pulse.
  // Mirrors ContactRow exactly but gated on kind === 'asset' so a
  // contact id collision can't trigger it. The nonce ref prevents the
  // effect from re-running when the parent rebuilds onToggle's identity
  // (a NEW arrow function every accordion render) without changing the
  // actual scroll intent.
  const rowRef = useRef<HTMLDivElement>(null);
  const clearHighlight = useNetworkStore((s) => s.actions.clearHighlight);
  const scrollIntent = useNetworkStore((s) => s.scrollIntent);
  const lastHandledNonceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!scrollIntent || scrollIntent.kind !== 'asset' || scrollIntent.id !== asset.id) return;
    if (lastHandledNonceRef.current === scrollIntent.nonce) return;
    lastHandledNonceRef.current = scrollIntent.nonce;
    rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (!open) onToggle();
    const t = setTimeout(() => clearHighlight(), 1200);
    return () => clearTimeout(t);
  }, [scrollIntent, asset.id, open, onToggle, clearHighlight]);

  return (
    <div
      ref={rowRef}
      className={`group rounded-md transition-all duration-[140ms] ${
        // No outer margin when open — same fix as ContactRow. The 4px
        // top + 4px bottom margin shifted siblings by 8px on toggle.
        // The bg + shadow alone are enough visual separation.
        open ? 'bg-surface-soft shadow-hairline-soft' : ''
      }`}
      style={{
        transition: 'background-color 180ms var(--ease-out), box-shadow 180ms var(--ease-out)',
      }}
    >
      {/* Outer is a div (not a button) so the owner pill can be a real
          nested button without producing invalid <button>-in-<button>
          markup — which was triggering a hydration error AND making
          the click target ambiguous. The div carries the role/keyboard
          handling so screen readers + Enter/Space still work. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={open}
        aria-controls={`asset-panel-${asset.id}`}
        data-testid={`asset-toggle-${asset.id}`}
        className={`flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-sm transition-colors duration-[160ms] active:scale-[0.998] ${
          open ? '' : 'hover:bg-surface-soft focus-visible:bg-surface-soft'
        }`}
        style={{
          transitionTimingFunction: 'var(--ease-out)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span
          aria-hidden
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-soft text-[var(--color-tag-amber-fg)]"
        >
          <Icon size={11} />
        </span>
        <span className="min-w-0 truncate text-[14px] font-medium text-fg">{asset.name}</span>
        {asset.availability ? (
          <span className="truncate text-xs text-muted">· {asset.availability}</span>
        ) : null}
        <span className="ml-auto inline-flex shrink-0 items-center gap-2 text-[11px]">
          {asset.contact_id ? (
            resolvedOwnerName ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onJumpToOwner?.();
                }}
                aria-label={`Open ${resolvedOwnerName} who owns ${asset.name}`}
                disabled={!onJumpToOwner}
                className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-muted transition-colors duration-[140ms] hover:bg-bg hover:text-accent focus-visible:bg-bg focus-visible:text-accent active:scale-[0.96] disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-muted"
                style={{
                  transitionTimingFunction: 'var(--ease-out)',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span className="truncate max-w-[14ch]">{resolvedOwnerName}</span>
                {onJumpToOwner ? <ArrowUpRight size={10} aria-hidden /> : null}
              </button>
            ) : (
              <span className="text-faint">Loading…</span>
            )
          ) : (
            <span className="text-faint">Owned by you</span>
          )}
          <ChevronRight
            size={13}
            aria-hidden
            className={`shrink-0 text-faint transition-transform duration-[200ms] ${
              open ? 'rotate-90' : ''
            }`}
            style={{ transitionTimingFunction: 'var(--ease-out)' }}
          />
        </span>
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="content"
            id={`asset-panel-${asset.id}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-3 px-4 pb-4 pt-1 text-sm">
              {asset.description ? (
                <p className="whitespace-pre-wrap leading-relaxed text-fg">{asset.description}</p>
              ) : (
                <p className="italic text-faint">
                  No description yet. Ask the assistant to add details.
                </p>
              )}
              {asset.availability ? (
                <div className="text-xs">
                  <span className="font-medium text-muted">Available:</span>{' '}
                  <span className="text-fg">{asset.availability}</span>
                </div>
              ) : null}
              {asset.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {asset.tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center rounded-[4px] bg-bg px-1.5 py-px text-[11px] font-medium text-muted"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
              {asset.contact_id && resolvedOwnerName && onJumpToOwner ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onJumpToOwner();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md bg-bg px-2.5 py-1.5 text-xs font-medium text-fg transition-all duration-[140ms] hover:bg-surface focus-visible:bg-surface active:scale-[0.96]"
                  style={{
                    transitionTimingFunction: 'var(--ease-out)',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  Open {resolvedOwnerName}
                  <ArrowUpRight size={11} aria-hidden />
                </button>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * PinnedSectionLabel — quiet caps-mono header above the pinned rows.
 * Matches the language used elsewhere for section markers (10px mono
 * uppercase, faint, accented icon for the carrier meaning).
 */
function PinnedSectionLabel({ count }: { count: number }) {
  return (
    <div className="mb-2 flex items-center gap-1.5 px-2 pt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
      <Pin size={9} aria-hidden className="text-accent" />
      <span>Pinned</span>
      <span className="tabular-nums text-muted">{count}</span>
    </div>
  );
}

// Legacy banners + PinnedTick removed — superseded by ActiveFiltersBar
// and PinnedSectionLabel respectively.

function PanelHeader({
  Icon,
  title,
  count,
  total,
  scrolled,
  actions,
  loadingPhase,
}: {
  Icon: typeof Users;
  title: string;
  count: number;
  /** When filtering, total is the unfiltered count for the "N of M" badge. */
  total?: number;
  scrolled?: boolean;
  actions?: React.ReactNode;
  /** Drives the right-side progress ring. Always rendered (invisible
   *  when idle) so the title row never reflows. */
  loadingPhase?: 'cold' | 'cached' | 'syncing' | 'paginating' | 'idle';
}) {
  const showOfTotal = total != null && total !== count;
  return (
    <div
      className="sticky top-0 z-10 bg-surface transition-shadow duration-[180ms]"
      style={{
        transitionTimingFunction: 'var(--ease-out)',
        boxShadow: scrolled ? '0 8px 12px -8px var(--color-border)' : 'none',
      }}
    >
      <div className="flex items-center gap-2.5 px-6 py-4">
        <Icon size={14} aria-hidden className="text-muted" />
        <h2 className="text-base font-medium tracking-tight text-fg">{title}</h2>
        <span className="text-sm text-faint tabular-nums">
          {showOfTotal ? (
            <>
              <CountUp to={count} />
              <span className="text-faint/60">
                {' / '}
                <CountUp to={total} />
              </span>
            </>
          ) : (
            <CountUp to={count} />
          )}
        </span>
        {/* Right cluster: progress ring + actions. The ring is always
            rendered (visibility opacity-toggled) so transitions never
            shift the layout. */}
        <span className="ml-auto inline-flex items-center gap-2">
          {loadingPhase ? <ProgressRing phase={loadingPhase} /> : null}
          {actions ? <span className="inline-flex items-center gap-1">{actions}</span> : null}
        </span>
      </div>
      {/* Section-bottom hairline. Same color + alpha + weight as the
          per-row separators (bg-border-soft / 70), and aligned to the
          same content column (24px = header px-6 = row content start)
          so all hairlines in the panel read as one family. Replaces
          the old SoftDivider gradient which felt heavier than the new
          per-row marks. */}
      <div aria-hidden className="mx-6 h-px bg-border-soft opacity-70" />
    </div>
  );
}

function EmptyFilterState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-16 text-center">
      <p className="text-sm font-medium text-fg">No contacts match.</p>
      <p className="mt-1 max-w-[40ch] text-sm text-muted">
        Remove a filter chip above to widen the search — or clear everything to start fresh.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-surface-soft px-2.5 py-1 text-xs font-medium text-fg transition-all duration-[140ms] hover:bg-bg focus-visible:bg-bg active:scale-[0.96]"
        style={{
          transitionTimingFunction: 'var(--ease-out)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        Clear all filters
      </button>
    </div>
  );
}

function UndoBanner({
  contact,
  expiresAt,
  onUndo,
}: {
  contact: Contact;
  expiresAt: number;
  onUndo: () => void;
}) {
  const total = UNDO_WINDOW_MS;
  const [remaining, setRemaining] = useState(() => Math.max(0, expiresAt - Date.now()));

  useEffect(() => {
    let raf = 0;
    const tick = (): void => {
      const r = Math.max(0, expiresAt - Date.now());
      setRemaining(r);
      if (r > 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [expiresAt]);

  const pct = Math.max(0, Math.min(1, remaining / total));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      className="sticky bottom-3 z-20 mx-auto mt-3 flex w-fit max-w-[calc(100%-1.5rem)] flex-col gap-1 rounded-md bg-fg px-3 py-2 text-sm text-bg shadow-lift"
      role="status"
      data-testid="contact-undo-banner"
    >
      <div className="flex items-center gap-3">
        <span className="truncate">
          <span className="opacity-60">Deleted</span>{' '}
          <span className="font-medium">{contact.name}</span>
        </span>
        <button
          type="button"
          onClick={onUndo}
          data-testid="contact-undo-button"
          className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium text-bg transition-all duration-[160ms] hover:bg-bg/15 focus-visible:bg-bg/15 active:scale-[0.95]"
          style={{
            transitionTimingFunction: 'var(--ease-out)',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <Undo2 size={12} aria-hidden /> Undo
        </button>
        <Kbd keys={['cmd', 'Z']} size="sm" tone="inverted" />
      </div>
      <div className="h-[2px] w-full overflow-hidden rounded-full bg-bg/15" aria-hidden>
        <div
          className="h-full bg-accent"
          style={{ width: `${pct * 100}%`, transition: 'width 100ms linear' }}
        />
      </div>
    </motion.div>
  );
}

function EmptyContactsState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-20 text-center">
      <Notebook size={22} aria-hidden strokeWidth={1.5} className="mx-auto mb-5 text-faint" />
      <p className="text-sm font-medium text-fg">A blank page.</p>
      <p className="mt-1.5 max-w-[36ch] text-sm text-muted">
        Drop a note about someone or something in the chat. People and assets appear here, with
        warmth and availability.
      </p>
    </div>
  );
}

/**
 * FirstEntryCaption — the signature delight moment. Lands once per user
 * (localStorage-guarded). Earns the brand accent's most expressive use.
 */
function FirstEntryCaption() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className="mt-3 rounded-md bg-accent-soft px-4 py-3 text-sm"
      role="status"
      data-testid="first-entry-caption"
    >
      <span className="font-medium text-fg">Your first entry.</span>{' '}
      <span className="text-muted">The notebook begins.</span>
    </motion.div>
  );
}
