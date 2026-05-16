import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const rpcMock = vi.fn();
vi.mock('../../lib/supabase', () => ({
  getBrowserSupabase: () => ({ rpc: rpcMock }),
}));

import { useNavigateToRow, _resetNavigateToRowInFlight } from './useNavigateToRow';
import { useNetworkStore, DEFAULT_PANEL_STATE, type Contact, type Asset } from '../../lib/store';

const baseContact: Contact = {
  id: '00000000-0000-0000-0000-00000000abcd',
  name: 'Anna Svensson',
  warmth: 3,
  city: 'Stockholm',
  tags: ['investor'],
  notes: '',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};
const baseAsset: Asset = {
  id: '00000000-0000-0000-0000-00000000ef01',
  name: 'Podcast studio',
  description: '',
  availability: null,
  tags: [],
  contact_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function resetStore(): void {
  useNetworkStore.setState({
    contacts: [],
    assets: [],
    highlightedId: null,
    scrollIntent: null,
    panel: DEFAULT_PANEL_STATE,
    panelUndoSnapshot: null,
    aiSetFacets: new Set(),
    seenIds: new Set(),
    recentlyUpdatedIds: new Map(),
  });
}

describe('useNavigateToRow', () => {
  beforeEach(() => {
    resetStore();
    rpcMock.mockReset();
    _resetNavigateToRowInFlight();
  });
  afterEach(() => {
    rpcMock.mockReset();
  });

  it('fires scrollIntent with the kind and id without touching the network when the row is loaded', async () => {
    useNetworkStore.setState({ contacts: [baseContact] });
    const { result } = renderHook(() => useNavigateToRow());
    await act(async () => {
      await result.current('contact', baseContact.id);
    });
    expect(rpcMock).not.toHaveBeenCalled();
    const intent = useNetworkStore.getState().scrollIntent;
    expect(intent).not.toBeNull();
    expect(intent?.id).toBe(baseContact.id);
    expect(intent?.kind).toBe('contact');
    expect(useNetworkStore.getState().highlightedId).toBe(baseContact.id);
  });

  it('switches view to match the kind when they differ', async () => {
    useNetworkStore.setState({
      panel: { ...DEFAULT_PANEL_STATE, view: 'assets' },
      contacts: [baseContact],
    });
    const { result } = renderHook(() => useNavigateToRow());
    await act(async () => {
      await result.current('contact', baseContact.id);
    });
    expect(useNetworkStore.getState().panel.view).toBe('contacts');
  });

  it('preserves the view when preserveView is true', async () => {
    useNetworkStore.setState({
      panel: { ...DEFAULT_PANEL_STATE, view: 'assets' },
      contacts: [baseContact],
    });
    const { result } = renderHook(() => useNavigateToRow());
    await act(async () => {
      await result.current('contact', baseContact.id, { preserveView: true });
    });
    expect(useNetworkStore.getState().panel.view).toBe('assets');
  });

  it('fetches via lookup_contacts_by_ids when the contact is not in the store', async () => {
    rpcMock.mockResolvedValue({ data: [baseContact], error: null });
    const { result } = renderHook(() => useNavigateToRow());
    await act(async () => {
      await result.current('contact', baseContact.id);
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('lookup_contacts_by_ids', { p_ids: [baseContact.id] });
    const stored = useNetworkStore.getState().contacts;
    expect(stored.map((c) => c.id)).toContain(baseContact.id);
  });

  it('fetches via lookup_assets_by_ids when the asset is not in the store', async () => {
    rpcMock.mockResolvedValue({ data: [baseAsset], error: null });
    const { result } = renderHook(() => useNavigateToRow());
    await act(async () => {
      await result.current('asset', baseAsset.id);
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('lookup_assets_by_ids', { p_ids: [baseAsset.id] });
    const stored = useNetworkStore.getState().assets;
    expect(stored.map((a) => a.id)).toContain(baseAsset.id);
  });

  it('re-fires scrollIntent with a fresh nonce after the row is upserted', async () => {
    rpcMock.mockResolvedValue({ data: [baseContact], error: null });
    const { result } = renderHook(() => useNavigateToRow());
    await act(async () => {
      await result.current('contact', baseContact.id);
    });
    // The hook fires jumpTo BEFORE fetch (intent #1) and again AFTER
    // upsert (intent #2). Only the latest survives in the store, but
    // its nonce should be > 0 — and the highlighted row should be the
    // fetched one.
    const intent = useNetworkStore.getState().scrollIntent;
    expect(intent?.id).toBe(baseContact.id);
    expect(intent?.nonce).toBeGreaterThan(0);
    expect(useNetworkStore.getState().highlightedId).toBe(baseContact.id);
  });

  it('marks the fetched row as recently updated so the tint pulse fires', async () => {
    rpcMock.mockResolvedValue({ data: [baseContact], error: null });
    const { result } = renderHook(() => useNavigateToRow());
    await act(async () => {
      await result.current('contact', baseContact.id);
    });
    const recent = useNetworkStore.getState().recentlyUpdatedIds;
    expect(recent.has(baseContact.id)).toBe(true);
  });

  it('coalesces concurrent navigations to the same id into one RPC', async () => {
    let resolveRpc: (v: unknown) => void = () => {};
    rpcMock.mockImplementation(
      () =>
        new Promise((res) => {
          resolveRpc = res;
        }),
    );
    const { result } = renderHook(() => useNavigateToRow());
    let p1: Promise<void> | undefined;
    let p2: Promise<void> | undefined;
    await act(async () => {
      p1 = result.current('contact', baseContact.id);
      p2 = result.current('contact', baseContact.id);
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveRpc({ data: [baseContact], error: null });
      await p1;
      await p2;
    });
    // After both settle, still only one RPC was issued.
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it('does not crash or upsert when lookup returns zero rows (RLS-denied or deleted)', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useNavigateToRow());
    await act(async () => {
      await result.current('contact', 'unknown-id');
    });
    expect(useNetworkStore.getState().contacts).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does not upsert when lookup errors; logs and exits cleanly', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useNavigateToRow());
    await act(async () => {
      await result.current('contact', baseContact.id);
    });
    expect(useNetworkStore.getState().contacts).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
