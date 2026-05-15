'use client';

import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getBrowserSupabase } from '../../lib/supabase';

export type AuthState = {
  user: User | null;
  session: Session | null;
  loading: boolean;
};

/**
 * Subscribes to Supabase auth state and returns the current user/session.
 * Web-only (uses the browser singleton). Native screens get an analogous hook
 * via a separate adapter (Phase 7).
 */
export function useAuth(): AuthState & { signOut: () => Promise<void> } {
  const [state, setState] = useState<AuthState>({ user: null, session: null, loading: true });

  useEffect(() => {
    const supabase = getBrowserSupabase();
    let alive = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setState({ user: data.session?.user ?? null, session: data.session, loading: false });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setState({ user: session?.user ?? null, session, loading: false });
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return {
    ...state,
    signOut: async () => {
      await getBrowserSupabase().auth.signOut();
    },
  };
}
