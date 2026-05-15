/**
 * useNetworkStore — Zustand store for contacts + assets + cross-pane UI state.
 *
 * Two pieces:
 *   - Canonical data (contacts, assets) hydrated by Supabase Realtime via
 *     `features/contacts/useContacts`.
 *   - Optimistic + ephemeral UI: when an agent tool call writes a row, we
 *     merge the RETURNING row into the store immediately so the right
 *     pane reflects the change before the realtime event fires. The
 *     subsequent realtime payload becomes a no-op (last-write-wins).
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
  updated_at: string;
  deleted_at?: string | null;
};

type State = {
  contacts: Contact[];
  assets: Asset[];
  /** Row id (contact or asset) currently highlighted in the accordion. */
  highlightedId: string | null;
  /** Bumps when a "scroll-to" intent fires — accordion listens via selector. */
  scrollIntent: { id: string; nonce: number } | null;
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
};

export const useNetworkStore = create<State & { actions: Actions }>((set) => ({
  contacts: [],
  assets: [],
  highlightedId: null,
  scrollIntent: null,

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
