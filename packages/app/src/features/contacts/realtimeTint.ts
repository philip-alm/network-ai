'use client';

import { useEffect, useMemo } from 'react';
import { useNetworkStore } from '../../lib/store';

const TINT_WINDOW_MS = 1200;

/**
 * useIsRecentlyUpdated — returns true for `TINT_WINDOW_MS` after a
 * realtime upsert touches `id`. Schedules a single cleanup so the
 * tint reliably fades + clears even if the user never re-renders the
 * row in question.
 */
export function useIsRecentlyUpdated(id: string): boolean {
  const ts = useNetworkStore((s) => s.recentlyUpdatedIds.get(id));
  const clearRecentlyUpdated = useNetworkStore((s) => s.actions.clearRecentlyUpdated);

  useEffect(() => {
    if (ts == null) return;
    const elapsed = Date.now() - ts;
    const remaining = TINT_WINDOW_MS - elapsed;
    if (remaining <= 0) {
      clearRecentlyUpdated(id);
      return;
    }
    const h = setTimeout(() => clearRecentlyUpdated(id), remaining);
    return () => clearTimeout(h);
  }, [id, ts, clearRecentlyUpdated]);

  return useMemo(() => {
    if (ts == null) return false;
    return Date.now() - ts < TINT_WINDOW_MS;
  }, [ts]);
}

/** ms a recently-updated row keeps its tint, exposed so styles can stay
 *  in sync with the JS timer. */
export const REALTIME_TINT_MS = TINT_WINDOW_MS;
