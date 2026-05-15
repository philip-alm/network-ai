'use client';

import { useEffect, useState } from 'react';
import { getBrowserSupabase } from '../../lib/supabase';

export type Contact = {
  id: string;
  name: string;
  warmth: number | null;
  city: string | null;
  tags: string[];
  notes: string;
  updated_at: string;
};

export type Asset = {
  id: string;
  name: string;
  description: string;
  availability: string | null;
  tags: string[];
  contact_id: string | null;
  updated_at: string;
};

/**
 * Subscribes to the user's contacts. Initial fetch via REST, then keeps the
 * list current via Supabase Realtime so the accordion auto-updates when the
 * agent writes new rows mid-chat.
 */
export function useContacts(): { contacts: Contact[]; assets: Asset[]; refetch: () => void } {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    let alive = true;

    async function fetchAll(): Promise<void> {
      // Filter soft-deleted rows so the accordion shows only live data.
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
      setContacts((cs as Contact[]) ?? []);
      setAssets((as as Asset[]) ?? []);
    }
    void fetchAll();

    const chan = supabase
      .channel('public:contacts-assets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assets' }, () => fetchAll())
      .subscribe();

    return () => {
      alive = false;
      void supabase.removeChannel(chan);
    };
  }, [bump]);

  return { contacts, assets, refetch: () => setBump((b) => b + 1) };
}
