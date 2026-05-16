/**
 * useNetworkStore — Zustand store for contacts + assets + cross-pane UI state.
 *
 * Three pieces:
 *   - Canonical data (contacts, assets) hydrated by Supabase Realtime via
 *     `features/contacts/useContacts`.
 *   - Optimistic + ephemeral UI: when an agent tool call writes a row, we
 *     merge the RETURNING row into the store immediately so the right
 *     pane reflects the change before the realtime event fires. The
 *     subsequent realtime payload becomes a no-op (last-write-wins).
 *   - Panel state (filter / sort / search / pinning / view) — driven by
 *     both the user (right-pane controls) and the agent (set_panel
 *     tool). One source of truth so the two paths can never disagree.
 */

'use client';

import { create } from 'zustand';

export type Contact = {
  id: string;
  name: string;
  warmth: number | null;
  city: string | null;
  tags: string[];
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
};

export type Asset = {
  id: string;
  name: string;
  description: string;
  availability: string | null;
  tags: string[];
  contact_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
};

// ─── Panel state ─────────────────────────────────────────────────────

/** Contact-side filter. Arrays so it serializes for the agent tool;
 *  values within a facet OR, facets AND together. */
export type ContactFilterState = {
  /** OR within facet — any contact carrying at least one tag passes. */
  tags: string[];
  /** AND within facet — contact must carry ALL listed tags. */
  tagsAll: string[];
  cities: string[];
  warmth: number[];
  /** Only contacts with at least one alive asset (true) / without (false). */
  hasAssets: boolean | null;
  /** Only contacts updated within the last N days. */
  updatedWithinDays: number | null;
};

export type AssetFilterState = {
  tags: string[];
  tagsAll: string[];
  /** Only assets attached to one of these contact ids. */
  ownerIds: string[];
  /** true = attached only; false = unattached only; null = both. */
  hasOwner: boolean | null;
  /** Substring (case-insensitive) over `availability`. */
  availabilityContains: string;
  updatedWithinDays: number | null;
};

export type ContactSortMode =
  | 'updated_desc'
  | 'created_desc'
  | 'name_asc'
  | 'name_desc'
  | 'warmth_asc'
  | 'warmth_desc'
  | 'asset_count_desc';

export type AssetSortMode = 'updated_desc' | 'created_desc' | 'name_asc' | 'name_desc';

export type PanelViewMode = 'contacts' | 'both' | 'assets';

/** Backward-compat alias used by older imports. */
export type PanelFilterState = ContactFilterState;

export type PanelState = {
  contactFilter: ContactFilterState;
  assetFilter: AssetFilterState;
  contactSort: ContactSortMode;
  assetSort: AssetSortMode;
  /** Free-text search across name + notes/description + city + tags. */
  search: string;
  /** Ordered list of contact ids that should appear at the top of the
   *  list (in this order) regardless of sort. */
  pinnedContactIds: string[];
  pinnedAssetIds: string[];
  view: PanelViewMode;
};

export const EMPTY_CONTACT_FILTER: ContactFilterState = {
  tags: [],
  tagsAll: [],
  cities: [],
  warmth: [],
  hasAssets: null,
  updatedWithinDays: null,
};

export const EMPTY_ASSET_FILTER: AssetFilterState = {
  tags: [],
  tagsAll: [],
  ownerIds: [],
  hasOwner: null,
  availabilityContains: '',
  updatedWithinDays: null,
};

export const EMPTY_PANEL_FILTER: ContactFilterState = EMPTY_CONTACT_FILTER;

export const DEFAULT_PANEL_STATE: PanelState = {
  contactFilter: EMPTY_CONTACT_FILTER,
  assetFilter: EMPTY_ASSET_FILTER,
  // Default sort: warmest contacts first (5 = "would drop everything"
  // floats to top), with first-name alphabetical tiebreak inside each
  // warmth tier. Picked over recency because "who matters most" is the
  // load-bearing question of a personal network; recency is a control
  // the user can flip to once they're looking for something specific.
  contactSort: 'warmth_desc',
  assetSort: 'updated_desc',
  search: '',
  pinnedContactIds: [],
  pinnedAssetIds: [],
  view: 'both',
};

/**
 * The five loading phases the right pane can be in:
 *   - `cold`       : first mount, no cache, no server response yet
 *                    → render SkeletonRows
 *   - `cached`     : cache hydrated but server hasn't responded yet
 *                    → render real rows + "Cached · refreshing" pill
 *   - `syncing`    : first server page in flight after cache
 *                    → real rows + pill
 *   - `paginating` : first page in, background paginator draining the rest
 *                    → real rows + "Loading more…" tail indicator
 *   - `idle`       : fully synced
 */
export type LoadingPhase = 'cold' | 'cached' | 'syncing' | 'paginating' | 'idle';

export type LoadingState = {
  phase: LoadingPhase;
  /** Cumulative contact + asset count once known. null until first
   *  server response confirms total. Drives the CountUp animation. */
  total: number | null;
};

type State = {
  contacts: Contact[];
  assets: Asset[];
  /** Row id (contact or asset) currently highlighted in the accordion. */
  highlightedId: string | null;
  /** Bumps when a "scroll-to" intent fires — accordion listens via selector. */
  scrollIntent: { id: string; nonce: number } | null;
  /** Right-pane filter/sort/view, controlled by user UI AND the agent. */
  panel: PanelState;
  /** Snapshot from BEFORE the agent's last set_panel call. Lets the
   *  chat-side ToolCallCard offer an Undo. Null when no AI-driven
   *  change is in effect. */
  panelUndoSnapshot: PanelState | null;
  /** Where the network pane is in its first-load lifecycle. */
  loading: LoadingState;
  /** Set of row ids the UI has already animated in (cascade fade).
   *  Prevents re-cascading when realtime events bump existing rows. */
  seenIds: Set<string>;
  /** Row id → wall-clock ms-since-epoch when realtime last touched it.
   *  Drives the 1.2 s accent tint that signals "live data just arrived".
   *  Entries are GC'd by the consuming hook on a timeout. */
  recentlyUpdatedIds: Map<string, number>;
};

type Actions = {
  /** Replace the entire snapshot — typically called from useContacts after refetch. */
  setSnapshot: (snap: { contacts: Contact[]; assets: Asset[] }) => void;
  /** Merge one or more rows (insert or update). Filters by id. */
  upsertContacts: (rows: Contact[]) => void;
  upsertAssets: (rows: Asset[]) => void;
  /** Remove a row by id (treats it as deleted regardless of deleted_at). */
  removeContact: (id: string) => void;
  removeAsset: (id: string) => void;
  /** Highlight a row + trigger the accordion to scroll to it. */
  jumpTo: (id: string) => void;
  /** Clear the highlight (after the pulse animation completes). */
  clearHighlight: () => void;
  /** Merge a partial panel-state update. Both UI controls AND the agent
   *  tool funnel through here. Unspecified keys are preserved; nested
   *  filter objects are shallow-merged so callers can patch a single
   *  facet without rebuilding the whole filter. Pass `undoable: true`
   *  (the default for agent-driven changes) to capture the prior state
   *  into panelUndoSnapshot so the chat can offer Undo. */
  setPanelState: (patch: Partial<PanelState>, opts?: { source?: 'user' | 'agent' }) => void;
  /** Restore a previously captured panel snapshot (Undo path). */
  restorePanelState: (snapshot: PanelState) => void;
  /** Reset every filter + search + pins. Sort/view preserved. */
  clearPanelFilters: () => void;
  /** Full reset — back to DEFAULT_PANEL_STATE. */
  resetPanel: () => void;
  /** Transition the loading phase. The total can be updated alongside
   *  or on its own. */
  setLoading: (next: Partial<LoadingState>) => void;
  /** Mark a row as "seen" by the UI so the cascade animation doesn't
   *  fire for it again. Called by the row component on first mount. */
  markSeen: (id: string) => void;
  /** Flag a row as just touched by realtime (drives the tint pulse).
   *  The store keeps a wall-clock timestamp; consumers GC after the
   *  pulse window. */
  markRecentlyUpdated: (id: string) => void;
  /** Drop an id from recentlyUpdatedIds after the pulse window elapses. */
  clearRecentlyUpdated: (id: string) => void;
};

export const useNetworkStore = create<State & { actions: Actions }>((set) => ({
  contacts: [],
  assets: [],
  highlightedId: null,
  scrollIntent: null,
  panel: DEFAULT_PANEL_STATE,
  panelUndoSnapshot: null,
  loading: { phase: 'cold', total: null },
  seenIds: new Set<string>(),
  recentlyUpdatedIds: new Map<string, number>(),

  actions: {
    setSnapshot: ({ contacts, assets }) =>
      set({
        contacts: contacts.filter((c) => !c.deleted_at),
        assets: assets.filter((a) => !a.deleted_at),
      }),

    upsertContacts: (rows) =>
      set((s) =>
        mergeRows(
          s.contacts,
          rows,
          (c) => c.id,
          (c) => Boolean(c.deleted_at),
          'contacts',
        ),
      ),

    upsertAssets: (rows) =>
      set((s) =>
        mergeRows(
          s.assets,
          rows,
          (a) => a.id,
          (a) => Boolean(a.deleted_at),
          'assets',
        ),
      ),

    removeContact: (id) => set((s) => ({ contacts: s.contacts.filter((c) => c.id !== id) })),

    removeAsset: (id) => set((s) => ({ assets: s.assets.filter((a) => a.id !== id) })),

    jumpTo: (id) =>
      set({
        highlightedId: id,
        scrollIntent: { id, nonce: Date.now() },
      }),

    clearHighlight: () => set({ highlightedId: null }),

    setPanelState: (patch, opts) =>
      set((s) => {
        const fromAgent = opts?.source === 'agent';
        const nextPanel: PanelState = {
          ...s.panel,
          ...patch,
          contactFilter: patch.contactFilter
            ? { ...s.panel.contactFilter, ...patch.contactFilter }
            : s.panel.contactFilter,
          assetFilter: patch.assetFilter
            ? { ...s.panel.assetFilter, ...patch.assetFilter }
            : s.panel.assetFilter,
        };
        return {
          panel: nextPanel,
          // Capture an Undo snapshot only when the agent drives the
          // change. User-initiated changes are part of their own muscle
          // memory and don't need an Undo affordance.
          panelUndoSnapshot: fromAgent ? s.panel : s.panelUndoSnapshot,
        };
      }),

    restorePanelState: (snapshot) => set({ panel: snapshot, panelUndoSnapshot: null }),

    clearPanelFilters: () =>
      set((s) => ({
        panel: {
          ...s.panel,
          contactFilter: EMPTY_CONTACT_FILTER,
          assetFilter: EMPTY_ASSET_FILTER,
          search: '',
          pinnedContactIds: [],
          pinnedAssetIds: [],
        },
        panelUndoSnapshot: null,
      })),

    resetPanel: () => set({ panel: DEFAULT_PANEL_STATE, panelUndoSnapshot: null }),

    setLoading: (next) => set((s) => ({ loading: { ...s.loading, ...next } })),

    markSeen: (id) =>
      set((s) => {
        if (s.seenIds.has(id)) return {};
        const next = new Set(s.seenIds);
        next.add(id);
        return { seenIds: next };
      }),

    markRecentlyUpdated: (id) =>
      set((s) => {
        const next = new Map(s.recentlyUpdatedIds);
        next.set(id, Date.now());
        return { recentlyUpdatedIds: next };
      }),

    clearRecentlyUpdated: (id) =>
      set((s) => {
        if (!s.recentlyUpdatedIds.has(id)) return {};
        const next = new Map(s.recentlyUpdatedIds);
        next.delete(id);
        return { recentlyUpdatedIds: next };
      }),
  },
}));

function mergeRows<T, K extends 'contacts' | 'assets'>(
  existing: T[],
  incoming: T[],
  keyFn: (t: T) => string,
  isDeleted: (t: T) => boolean,
  field: K,
): Partial<State> {
  const byId = new Map<string, T>();
  for (const r of existing) byId.set(keyFn(r), r);
  for (const r of incoming) {
    if (isDeleted(r)) byId.delete(keyFn(r));
    else byId.set(keyFn(r), r);
  }
  const merged = Array.from(byId.values());
  // Stable order: newest updated_at first, falling back to id.
  merged.sort((a, b) => {
    const at = ((a as unknown as { updated_at?: string }).updated_at ?? '') as string;
    const bt = ((b as unknown as { updated_at?: string }).updated_at ?? '') as string;
    if (at !== bt) return at < bt ? 1 : -1;
    return keyFn(a) < keyFn(b) ? -1 : 1;
  });
  return { [field]: merged } as Partial<State>;
}
