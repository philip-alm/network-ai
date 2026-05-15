'use client';

import { useEffect } from 'react';
import { getBrowserSupabase } from '../../lib/supabase';
import { useNetworkStore, type Contact, type Asset } from '../../lib/store';

export type { Contact, Asset } from '../../lib/store';

/**
 * useContacts — hydrates the cross-pane Zustand store from Supabase.
 *
 * Initial fetch on mount + Realtime subscription on contacts + assets.
 * Realtime payloads merge through `upsertContacts` / `upsertAssets`, which
 * is also the path tool calls use for optimistic updates — last-write-wins,
 * so the realtime echo for an already-optimistic row is a no-op.
 */
export function useContacts(): {
  contacts: Contact[];
  assets: Asset[];
  refetch: () => void;
} {
  const contacts = useNetworkStore((s) => s.contacts);
  const assets = useNetworkStore((s) => s.assets);
  const { setSnapshot, upsertContacts, upsertAssets, removeContact, removeAsset } = useNetworkStore(
    (s) => s.actions,
  );

  useEffect(() => {
    const supabase = getBrowserSupabase();
    let alive = true;

    async function fetchAll(): Promise<void> {
      const [{ data: cs }, { data: as }] = await Promise.all([
        supabase
          .from('contacts')
          .select('*')
          .is('deleted_at', null)
          .order('updated_at', { ascending: false }),
        supabase
          .from('assets')
          .select('*')
          .is('deleted_at', null)
          .order('updated_at', { ascending: false }),
      ]);
      if (!alive) return;
      setSnapshot({
        contacts: (cs as Contact[]) ?? [],
        assets: (as as Asset[]) ?? [],
      });
    }
    void fetchAll();

    const chan = supabase
      .channel('public:contacts-assets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, (payload) => {
        const row = (payload.new ?? payload.old) as Contact | null;
        if (!row) return;
        if (payload.eventType === 'DELETE' || (row as Contact).deleted_at) {
          removeContact(row.id);
        } else {
          upsertContacts([row]);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assets' }, (payload) => {
        const row = (payload.new ?? payload.old) as Asset | null;
        if (!row) return;
        if (payload.eventType === 'DELETE' || (row as Asset).deleted_at) {
          removeAsset(row.id);
        } else {
          upsertAssets([row]);
        }
      })
      .subscribe();

    return () => {
      alive = false;
      void supabase.removeChannel(chan);
    };
  }, [setSnapshot, upsertContacts, upsertAssets, removeContact, removeAsset]);

  return {
    contacts,
    assets,
    refetch: () => {
      void getBrowserSupabase()
        .from('contacts')
        .select('*')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .then(({ data }) => {
          if (data) upsertContacts(data as Contact[]);
        });
    },
  };
}
