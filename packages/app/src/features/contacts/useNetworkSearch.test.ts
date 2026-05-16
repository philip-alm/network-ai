import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const rpcMock = vi.fn();
vi.mock('../../lib/supabase', () => ({
  getBrowserSupabase: () => ({ rpc: rpcMock }),
}));

import { useNetworkSearch } from './useNetworkSearch';
import type { Contact, Asset } from '../../lib/store';

const baseContact: Contact = {
  id: '00000000-0000-0000-0000-000000000000',
  name: 'Anna Svensson',
  warmth: 2,
  city: 'Stockholm',
  tags: ['investor'],
  notes: 'Met at AI dinner.',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};
const baseAsset: Asset = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Podcast studio',
  description: 'Mics + soundproofing.',
  availability: 'Tuesdays',
  tags: ['podcast'],
  contact_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('useNetworkSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    rpcMock.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null result + no inflight when query is empty', () => {
    const { result } = renderHook(() => useNetworkSearch(''));
    expect(result.current.result).toBeNull();
    expect(result.current.inflight).toBe(false);
  });

  it('does not fire RPC during the debounce window', () => {
    renderHook(() => useNetworkSearch('Anna', { debounceMs: 200 }));
    expect(rpcMock).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('fires the RPC exactly once after the debounce window', async () => {
    rpcMock.mockResolvedValue({ data: { contacts: [], assets: [] }, error: null });
    renderHook(() => useNetworkSearch('Anna', { debounceMs: 200 }));
    await act(async () => {
      vi.advanceTimersByTime(220);
      await Promise.resolve();
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith(
      'find_anything',
      expect.objectContaining({
        contains_filter: 'Anna',
        query_terms: ['Anna'],
        in_contacts: true,
        in_assets: true,
      }),
    );
  });

  it('local fallback returns substring matches during the debounce window', () => {
    const { result } = renderHook(() =>
      useNetworkSearch('anna', {
        debounceMs: 200,
        fallback: { contacts: [baseContact], assets: [baseAsset] },
      }),
    );
    expect(result.current.fallbackResult?.contactIds).toEqual([baseContact.id]);
    expect(result.current.fallbackResult?.assetIds).toEqual([]);
  });

  it('substring fallback is case-insensitive across all searchable fields', () => {
    const { result } = renderHook(() =>
      useNetworkSearch('SOUNDPROOFING', {
        debounceMs: 200,
        fallback: { contacts: [baseContact], assets: [baseAsset] },
      }),
    );
    expect(result.current.fallbackResult?.assetIds).toEqual([baseAsset.id]);
  });

  it('stale RPC responses are discarded when a newer query supersedes', async () => {
    let resolveFirst: (v: unknown) => void;
    const firstP = new Promise((res) => {
      resolveFirst = res;
    });
    let resolveSecond: (v: unknown) => void;
    const secondP = new Promise((res) => {
      resolveSecond = res;
    });
    rpcMock.mockImplementationOnce(() => firstP).mockImplementationOnce(() => secondP);

    const { result, rerender } = renderHook(({ q }) => useNetworkSearch(q, { debounceMs: 50 }), {
      initialProps: { q: 'first' },
    });

    // Trip the first debounce so the first RPC is dispatched.
    await act(async () => {
      vi.advanceTimersByTime(60);
      await Promise.resolve();
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);

    // Now change the query — second debounce + RPC.
    rerender({ q: 'second' });
    await act(async () => {
      vi.advanceTimersByTime(60);
      await Promise.resolve();
    });
    expect(rpcMock).toHaveBeenCalledTimes(2);

    // Resolve the SECOND request first → that result should commit.
    await act(async () => {
      resolveSecond!({
        data: { contacts: [{ id: 'live', _score: 1 }], assets: [] },
        error: null,
      });
      await Promise.resolve();
    });
    expect(result.current.result?.contactIds).toEqual(['live']);

    // Resolve the FIRST request last → must be ignored (stale).
    await act(async () => {
      resolveFirst!({
        data: { contacts: [{ id: 'stale', _score: 1 }], assets: [] },
        error: null,
      });
      await Promise.resolve();
    });
    expect(result.current.result?.contactIds).toEqual(['live']);
  });
});
