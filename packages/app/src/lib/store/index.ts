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
  /** Server-computed count of alive assets owned by this contact.
   *  Populated by query_contacts_page; absent on optimistic upserts and
   *  realtime payloads (consumers should treat absence as "unknown"). */
  asset_count?: number;
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

/** Right-pane view: people (Network) OR things (Assets). We deliberately
 *  do NOT support a "both" view — stacking two paginated lists in one
 *  scroller breaks the scroll-to-load-more trigger and creates an
 *  ambiguous bottom. Two clean toggles, clean pagination per kind. */
export type PanelViewMode = 'contacts' | 'assets';

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
  view: 'contacts',
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

/** Tracks which panel facets the AGENT most-recently touched. Drives
 *  the AI badge on filter chips + the agent-applied-flash animation
 *  on the affected control. Cleared when the user manually changes
 *  that facet (the user took it over). */
export type PanelFacetKey =
  | 'contactFilter'
  | 'assetFilter'
  | 'contactSort'
  | 'assetSort'
  | 'search'
  | 'pinnedContactIds'
  | 'pinnedAssetIds'
  | 'view';

type State = {
  contacts: Contact[];
  assets: Asset[];
  /** Row id (contact or asset) currently highlighted in the accordion. */
  highlightedId: string | null;
  /** Bumps when a "scroll-to" intent fires.
   *
   *  Two layers listen:
   *  1. `VirtualPanelList` reads (kind, id), finds the row's index in the
   *     current item list, and calls `virtualizer.scrollToIndex` so an
   *     off-screen row scrolls into the render window FIRST. Without
   *     this, virtualization silently drops the intent for any row not
   *     currently mounted (~> 30 rows below the fold).
   *  2. `ContactRow` / `AssetRow` listen for their own id and run the
   *     local "scroll into view + open + clear highlight after 1.2s"
   *     effect — but only AFTER the virtualizer has mounted them.
   *
   *  `kind` is carried so the virtualizer knows whether to look for a
   *  contact item or an asset item; it also makes "wrong-view" navigations
   *  diagnosable in traces. */
  scrollIntent: { id: string; kind: 'contact' | 'asset'; nonce: number } | null;
  /** Right-pane filter/sort/view, controlled by user UI AND the agent. */
  panel: PanelState;
  /** Snapshot from BEFORE the agent's last set_panel call. Lets the
   *  chat-side ToolCallCard offer an Undo. Null when no AI-driven
   *  change is in effect. */
  panelUndoSnapshot: PanelState | null;
  /** Which facets the agent last touched. UI uses this to show an AI
   *  badge on filter chips + briefly glow the changed controls. The
   *  user clearing a facet manually removes it from the set. */
  aiSetFacets: Set<PanelFacetKey>;
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
  /** Replace ONLY the contacts list (preserves assets). Used when the
   *  contact filter/sort changes — assets are unaffected. */
  replaceContacts: (rows: Contact[]) => void;
  /** Replace ONLY the assets list (preserves contacts). */
  replaceAssets: (rows: Asset[]) => void;
  /** Merge one or more rows (insert or update). Filters by id.
   *  Preserves the existing sort order (newest updated_at first). */
  upsertContacts: (rows: Contact[]) => void;
  upsertAssets: (rows: Asset[]) => void;
  /** Append rows to the end of the current list — used by loadMore
   *  pagination. Server already sorted them; keep their order intact. */
  appendContacts: (rows: Contact[]) => void;
  appendAssets: (rows: Asset[]) => void;
  /** Remove a row by id (treats it as deleted regardless of deleted_at). */
  removeContact: (id: string) => void;
  removeAsset: (id: string) => void;
  /** Highlight a row + trigger the accordion to scroll to it.
   *
   *  `kind` is required so the virtualizer can locate the row even
   *  when it's not currently mounted (the row's own scrollIntent
   *  listener cannot fire if the component isn't rendered). For typical
   *  call sites, prefer `useNavigateToRow` — it switches view + fetches
   *  missing rows + retries the jump after upsert. Raw `jumpTo` only
   *  makes sense when you KNOW the row is in the loaded set AND the
   *  active view matches its kind. */
  jumpTo: (id: string, kind: 'contact' | 'asset') => void;
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
  aiSetFacets: new Set<PanelFacetKey>(),
  loading: { phase: 'cold', total: null },
  seenIds: new Set<string>(),
  recentlyUpdatedIds: new Map<string, number>(),

  actions: {
    setSnapshot: ({ contacts, assets }) =>
      set({
        contacts: contacts.filter((c) => !c.deleted_at),
        assets: assets.filter((a) => !a.deleted_at),
      }),

    replaceContacts: (rows) => set({ contacts: rows.filter((c) => !c.deleted_at) }),

    replaceAssets: (rows) => set({ assets: rows.filter((a) => !a.deleted_at) }),

    appendContacts: (rows) =>
      set((s) => {
        // Dedupe by id — if a row arrived via realtime since the page
        // fetch was issued, keep the realtime version (latest).
        const seen = new Set(s.contacts.map((c) => c.id));
        const toAdd = rows.filter((r) => !r.deleted_at && !seen.has(r.id));
        return toAdd.length > 0 ? { contacts: [...s.contacts, ...toAdd] } : {};
      }),

    appendAssets: (rows) =>
      set((s) => {
        const seen = new Set(s.assets.map((a) => a.id));
        const toAdd = rows.filter((r) => !r.deleted_at && !seen.has(r.id));
        return toAdd.length > 0 ? { assets: [...s.assets, ...toAdd] } : {};
      }),

    upsertContacts: (rows) =>
      set((s) =>
        mergeWithoutReSorting(
          s.contacts,
          rows,
          (c) => c.id,
          (c) => Boolean(c.deleted_at),
          'contacts',
        ),
      ),

    upsertAssets: (rows) =>
      set((s) =>
        mergeWithoutReSorting(
          s.assets,
          rows,
          (a) => a.id,
          (a) => Boolean(a.deleted_at),
          'assets',
        ),
      ),

    removeContact: (id) => set((s) => ({ contacts: s.contacts.filter((c) => c.id !== id) })),

    removeAsset: (id) => set((s) => ({ assets: s.assets.filter((a) => a.id !== id) })),

    jumpTo: (id, kind) =>
      set({
        highlightedId: id,
        scrollIntent: { id, kind, nonce: Date.now() },
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
        // Track which facets the agent touched. The user manually
        // changing a facet removes it from the AI set (they took it
        // over). The agent touching a facet adds it.
        const nextAi = new Set(s.aiSetFacets);
        for (const key of Object.keys(patch) as PanelFacetKey[]) {
          if (fromAgent) nextAi.add(key);
          else nextAi.delete(key);
        }
        return {
          panel: nextPanel,
          // Capture an Undo snapshot only when the agent drives the
          // change. User-initiated changes are part of their own muscle
          // memory and don't need an Undo affordance.
          panelUndoSnapshot: fromAgent ? s.panel : s.panelUndoSnapshot,
          aiSetFacets: nextAi,
        };
      }),

    restorePanelState: (snapshot) =>
      set({ panel: snapshot, panelUndoSnapshot: null, aiSetFacets: new Set() }),

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
        aiSetFacets: new Set(),
      })),

    resetPanel: () =>
      set({ panel: DEFAULT_PANEL_STATE, panelUndoSnapshot: null, aiSetFacets: new Set() }),

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

/**
 * mergeWithoutReSorting — merge incoming rows into existing without
 * re-sorting the result. Rows already in the list keep their position
 * (their updated values overwrite in place). New rows are prepended so
 * the user sees their latest action at the top — the next refetch from
 * the server will reconcile them into the correct sort position.
 *
 * The previous `mergeRows` always re-sorted by `updated_at DESC`,
 * which silently broke the user's chosen sort whenever an optimistic
 * insert or a realtime upsert landed. The server is the source of
 * truth for ordering; the store shouldn't impose a different one.
 */
function mergeWithoutReSorting<T, K extends 'contacts' | 'assets'>(
  existing: T[],
  incoming: T[],
  keyFn: (t: T) => string,
  isDeleted: (t: T) => boolean,
  field: K,
): Partial<State> {
  const existingIds = new Set(existing.map(keyFn));
  const incomingById = new Map<string, T>();
  const toDelete = new Set<string>();
  for (const r of incoming) {
    const id = keyFn(r);
    if (isDeleted(r)) toDelete.add(id);
    else incomingById.set(id, r);
  }

  // In-place update for existing rows; collect brand-new rows separately.
  const updated: T[] = [];
  for (const row of existing) {
    const id = keyFn(row);
    if (toDelete.has(id)) continue;
    updated.push(incomingById.get(id) ?? row);
  }
  // New rows (not in existing) prepended in the order they arrived.
  const prepended: T[] = [];
  for (const r of incoming) {
    const id = keyFn(r);
    if (isDeleted(r)) continue;
    if (existingIds.has(id)) continue;
    prepended.push(r);
  }
  return { [field]: [...prepended, ...updated] } as Partial<State>;
}
