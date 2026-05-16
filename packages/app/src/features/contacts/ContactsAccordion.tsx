'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Undo2,
  Notebook,
  Users,
  Briefcase,
  ArrowUpRight,
  Layers,
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
  applyContactFilter,
  applyAssetFilter,
  applyContactSort,
  applyAssetSort,
  applyPinning,
  buildAssetCountMap,
  buildAssetsByOwnerMap,
  getOwnAssets,
  isContactFilterEmpty,
  isAssetFilterEmpty,
} from './panelLogic';
import { iconForAsset } from './assetIcons';
import { SkeletonRows } from './SkeletonRows';
import { CountUp } from './CountUp';
import { ProgressRing } from './ProgressRing';
import { useCascadeIn } from './useCascadeIn';
import { VirtualPanelList, buildPanelItems, type PanelItem } from './VirtualPanelList';
import { useNetworkStore, type Contact, type Asset, type PanelState } from '../../lib/store';
import { getBrowserSupabase } from '../../lib/supabase';
import { SoftDivider, WithTooltip, Kbd } from '../ui';

export type ContactsAccordionProps = {
  contacts: Contact[];
  assets: Asset[];
  onChange?: () => void;
};

const UNDO_WINDOW_MS = 5000;

type PendingDelete = {
  contact: Contact;
  expiresAt: number;
};

export function ContactsAccordion({ contacts, assets }: ContactsAccordionProps) {
  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const {
    upsertContacts,
    removeContact,
    jumpTo,
    setPanelState,
    clearPanelFilters,
    restorePanelState,
  } = useNetworkStore((s) => s.actions);
  const panel = useNetworkStore((s) => s.panel);
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

  // ── Derived data — memoized so the pipeline only re-runs when its
  //    inputs actually change, not on every render of an unrelated
  //    state slice (the chat side bumping pending, for example).

  /** Per-(contacts, assets) — used by row badges + asset_count sort. */
  const assetCountMap = useMemo(() => buildAssetCountMap(assets), [assets]);
  /** contact_id → assets[]. Passed per-row to ContactRow so each row
   *  receives only its own assets — keeps React.memo effective when
   *  unrelated assets change. */
  const assetsByOwner = useMemo(() => buildAssetsByOwnerMap(assets), [assets]);

  const visibleContacts = useMemo(() => {
    const filtered = applyContactFilter(contacts, filter, { assets, search });
    const sorted = applyContactSort(filtered, sort, { assetCountMap });
    const { list } = applyPinning(sorted, panel.pinnedContactIds);
    return list;
  }, [contacts, assets, filter, sort, search, panel.pinnedContactIds, assetCountMap]);

  const pinnedContactSet = useMemo(() => new Set(panel.pinnedContactIds), [panel.pinnedContactIds]);

  const visibleAssets = useMemo(() => {
    const filtered = applyAssetFilter(assets, panel.assetFilter, { search });
    const sorted = applyAssetSort(filtered, panel.assetSort);
    const { list } = applyPinning(sorted, panel.pinnedAssetIds);
    return list;
  }, [assets, panel.assetFilter, panel.assetSort, search, panel.pinnedAssetIds]);

  const pinnedAssetSet = useMemo(() => new Set(panel.pinnedAssetIds), [panel.pinnedAssetIds]);

  const showContacts = view === 'both' || view === 'contacts';
  const showAssets = view === 'both' || view === 'assets';
  const { active: firstEntryActive } = useFirstContactDelight(contacts.length);

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
  // One source of truth — pinned labels, dividers, the assets
  // section header, first-entry caption are all items in the same
  // array. The virtualizer handles ordering and visibility.
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
        assetsTotal: assets.length,
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
      assets.length,
    ],
  );

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
                onJumpToOwner={owner ? () => jumpTo(owner.id) : undefined}
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
        case 'asset-section-header':
          return (
            <div className="mt-4">
              <PanelHeader
                Icon={Briefcase}
                title="Assets"
                count={item.visible}
                total={item.total}
              />
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
      jumpTo,
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
        Icon={view === 'assets' ? Briefcase : view === 'contacts' ? Users : Layers}
        title={view === 'assets' ? 'Assets' : view === 'contacts' ? 'Contacts' : 'Network'}
        count={
          (showContacts ? visibleContacts.length : 0) + (showAssets ? visibleAssets.length : 0)
        }
        total={
          view === 'both'
            ? contacts.length + assets.length
            : view === 'contacts'
              ? contacts.length
              : assets.length
        }
        scrolled={scrolled}
        loadingPhase={loading.phase}
        actions={
          // Always render the action cluster — even when contacts and
          // assets are still loading. Previously this was conditional on
          // `length > 0`, so on first paint the search + view + sort +
          // filter icons were absent and then popped in once data
          // arrived, shifting the layout. Sort + filter render in every
          // view; their dropdowns are no-ops when there's nothing to act
          // on but the buttons hold their slots.
          <span className="inline-flex items-center gap-1.5">
            <HeaderSearch value={search} onChange={setSearch} />
            <ViewToggle view={view} onChange={setView} />
            {view !== 'assets' ? (
              <>
                <ContactSort value={sort} onChange={setSort} />
                <ContactFilter contacts={contacts} value={filter} onChange={setFilter} />
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

      {/* Cold-load skeleton: only when we truly have nothing to show. */}
      {showContacts && contacts.length === 0 && loading.phase === 'cold' ? <SkeletonRows /> : null}
      {showContacts && contacts.length === 0 && loading.phase !== 'cold' ? (
        <EmptyContactsState />
      ) : null}
      {showContacts && contacts.length > 0 && visibleContacts.length === 0 ? (
        <EmptyFilterState onClear={() => clearPanelFilters()} />
      ) : null}
      {/* Virtualized panel list — single virtualizer handles BOTH the
          contacts section and the assets section + their pinned
          subsections, section header, and the first-entry caption.
          Builds a typed `PanelItem[]` and dispatches rendering by type.
          Scales to 100k+ rows: only items in the viewport (~30) are
          mounted at any time. See VirtualPanelList.tsx for the
          virtualization rules + scroll-anchor behavior. */}
      {panelItems.length > 0 ? (
        <div className="px-3 pb-3">
          <VirtualPanelList
            items={panelItems}
            scrollerRef={scrollerRef}
            renderItem={renderPanelItem}
          />
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

type ViewMode = 'contacts' | 'both' | 'assets';

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <span
      className="inline-flex items-center rounded-md bg-bg p-0.5 shadow-hairline-soft"
      role="radiogroup"
      aria-label="View"
    >
      <ViewToggleButton
        active={view === 'contacts'}
        label="Contacts only"
        Icon={Users}
        onClick={() => onChange('contacts')}
      />
      <ViewToggleButton
        active={view === 'both'}
        label="Both"
        Icon={Layers}
        onClick={() => onChange('both')}
      />
      <ViewToggleButton
        active={view === 'assets'}
        label="Assets only"
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
function HeaderSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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
  return (
    <div
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
          {owner && onJumpToOwner ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onJumpToOwner();
              }}
              aria-label={`Open ${owner.name} who owns ${asset.name}`}
              className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-muted transition-colors duration-[140ms] hover:bg-bg hover:text-accent focus-visible:bg-bg focus-visible:text-accent active:scale-[0.96]"
              style={{
                transitionTimingFunction: 'var(--ease-out)',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span className="truncate max-w-[14ch]">{owner.name}</span>
              <ArrowUpRight size={10} aria-hidden />
            </button>
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
              {owner && onJumpToOwner ? (
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
                  Open {owner.name}
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
              <span className="text-faint/60"> / {total}</span>
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
      <p className="text-sm font-medium text-fg">Nothing matches.</p>
      <p className="mt-1 max-w-[36ch] text-sm text-muted">
        No contacts match the current filters. Try removing one.
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
        Clear filters
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
