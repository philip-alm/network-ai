import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const rpcMock = vi.fn();
vi.mock('../../lib/supabase', () => ({
  getBrowserSupabase: () => ({ rpc: rpcMock }),
}));

import { _rankLocal, usePaletteSearch } from './usePaletteSearch';
import { useNetworkStore, DEFAULT_PANEL_STATE, type Contact, type Asset } from '../../lib/store';

function makeContact(over: Partial<Contact> = {}): Contact {
  return {
    id: 'c-' + Math.random().toString(36).slice(2, 8),
    name: 'Anna',
    warmth: 3,
    city: 'Stockholm',
    tags: [],
    notes: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function makeAsset(over: Partial<Asset> = {}): Asset {
  return {
    id: 'a-' + Math.random().toString(36).slice(2, 8),
    name: 'Studio',
    description: '',
    availability: null,
    tags: [],
    contact_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

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

describe('_rankLocal', () => {
  it('returns top-recent local rows when query is empty (70/30 mix)', () => {
    const contacts = Array.from({ length: 10 }, (_, i) => makeContact({ name: `C${i}` }));
    const assets = Array.from({ length: 10 }, (_, i) => makeAsset({ name: `A${i}` }));
    const out = _rankLocal('', contacts, assets, 10);
    const contactCount = out.filter((r) => r.kind === 'contact').length;
    const assetCount = out.filter((r) => r.kind === 'asset').length;
    expect(out).toHaveLength(10);
    expect(contactCount).toBe(7); // 70% of 10
    expect(assetCount).toBe(3);
    expect(out.every((r) => r.source === 'local')).toBe(true);
  });

  it('prefix matches outrank substring matches', () => {
    const annika = makeContact({ name: 'Annika' });
    const susannah = makeContact({ name: 'Susannah' });
    const out = _rankLocal('ann', [annika, susannah], [], 10);
    expect(out[0].kind).toBe('contact');
    expect((out[0] as { contact: Contact }).contact.id).toBe(annika.id);
  });

  it('warmer contacts edge out colder ones on tie', () => {
    const warm = makeContact({ name: 'Anna', warmth: 5 });
    const cold = makeContact({ name: 'Anna', warmth: 1 });
    const out = _rankLocal('anna', [warm, cold], [], 10);
    expect((out[0] as { contact: Contact }).contact.id).toBe(warm.id);
  });

  it('rejects rows scoring zero (no haystack match anywhere)', () => {
    const c = makeContact({ name: 'Bob', city: 'Oslo', notes: '', tags: [] });
    const out = _rankLocal('zzz', [c], [], 10);
    expect(out).toEqual([]);
  });

  it('matches against notes + city + tags via token scoring', () => {
    const c = makeContact({ name: 'Bob', notes: 'investor in podcasting', tags: ['founder'] });
    const out = _rankLocal('podcasting', [c], [], 10);
    expect(out).toHaveLength(1);
    expect(out[0].score).toBeGreaterThan(0);
  });
});

describe('usePaletteSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    rpcMock.mockReset();
    resetStore();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('empty query returns top local rows without firing the server RPC', async () => {
    const c = makeContact({ name: 'Anna' });
    useNetworkStore.setState({ contacts: [c] });
    const { result } = renderHook(() => usePaletteSearch(''));
    expect(result.current.results.length).toBe(1);
    expect(result.current.results[0]).toMatchObject({ kind: 'contact', source: 'local' });
    expect(result.current.serverInflight).toBe(false);
    // Server effect doesn't fire on empty query — even after timers advance.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('shows local fallback during the debounce window', () => {
    const c = makeContact({ name: 'Anna' });
    useNetworkStore.setState({ contacts: [c] });
    const { result } = renderHook(() => usePaletteSearch('anna', { debounceMs: 80 }));
    expect(result.current.results.length).toBeGreaterThan(0);
    expect(result.current.results[0].source).toBe('local');
    expect(result.current.serverInflight).toBe(true);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('fires find_anything exactly once after the debounce', async () => {
    rpcMock.mockResolvedValue({ data: { contacts: [], assets: [] }, error: null });
    renderHook(() => usePaletteSearch('anna', { debounceMs: 80 }));
    await act(async () => {
      vi.advanceTimersByTime(100);
      await Promise.resolve();
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith(
      'find_anything',
      expect.objectContaining({
        query_terms: ['anna'],
        contains_filter: 'anna',
        in_contacts: true,
        in_assets: true,
      }),
    );
  });

  it('replaces local fallback with server results once they land', async () => {
    const localAnna = makeContact({ id: 'local', name: 'Anna Local' });
    useNetworkStore.setState({ contacts: [localAnna] });
    const serverAnna = makeContact({ id: 'server', name: 'Anna Server' });
    rpcMock.mockResolvedValue({
      data: { contacts: [{ ...serverAnna, _score: 99 }], assets: [] },
      error: null,
    });
    const { result } = renderHook(() => usePaletteSearch('anna', { debounceMs: 80 }));
    await act(async () => {
      vi.advanceTimersByTime(100);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.results.length).toBe(1);
    expect(result.current.results[0]).toMatchObject({ kind: 'contact', source: 'server' });
    expect((result.current.results[0] as { contact: Contact }).contact.id).toBe('server');
  });

  it('tags a server result as "local" when it is also in the store', async () => {
    const shared = makeContact({ id: 'shared', name: 'Anna' });
    useNetworkStore.setState({ contacts: [shared] });
    rpcMock.mockResolvedValue({
      data: { contacts: [{ ...shared, _score: 99 }], assets: [] },
      error: null,
    });
    const { result } = renderHook(() => usePaletteSearch('anna', { debounceMs: 80 }));
    await act(async () => {
      vi.advanceTimersByTime(100);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.results[0].source).toBe('local');
  });

  it('discards stale RPC responses when a newer query supersedes', async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    const firstP = new Promise((res) => {
      resolveFirst = res;
    });
    let resolveSecond: (v: unknown) => void = () => {};
    const secondP = new Promise((res) => {
      resolveSecond = res;
    });
    rpcMock.mockImplementationOnce(() => firstP).mockImplementationOnce(() => secondP);

    const { result, rerender } = renderHook(({ q }) => usePaletteSearch(q, { debounceMs: 50 }), {
      initialProps: { q: 'first' },
    });

    // Trip the first debounce.
    await act(async () => {
      vi.advanceTimersByTime(60);
      await Promise.resolve();
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);

    // Change query → second debounce + RPC.
    rerender({ q: 'second' });
    await act(async () => {
      vi.advanceTimersByTime(60);
      await Promise.resolve();
    });
    expect(rpcMock).toHaveBeenCalledTimes(2);

    // Resolve SECOND first → committed.
    const liveContact = makeContact({ id: 'live', name: 'second' });
    await act(async () => {
      resolveSecond({
        data: { contacts: [{ ...liveContact, _score: 5 }], assets: [] },
        error: null,
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect((result.current.results[0] as { contact: Contact }).contact.id).toBe('live');

    // Resolve FIRST last → ignored.
    const staleContact = makeContact({ id: 'stale', name: 'first' });
    await act(async () => {
      resolveFirst({
        data: { contacts: [{ ...staleContact, _score: 5 }], assets: [] },
        error: null,
      });
      await Promise.resolve();
    });
    expect((result.current.results[0] as { contact: Contact }).contact.id).toBe('live');
  });

  it('exposes serverError when the RPC fails', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'oops' } });
    const { result } = renderHook(() => usePaletteSearch('x', { debounceMs: 20 }));
    await act(async () => {
      vi.advanceTimersByTime(30);
      await Promise.resolve();
    });
    expect(result.current.serverError).toBe('oops');
  });

  it('sorts merged server results by score descending', async () => {
    const a = makeContact({ id: 'low', name: 'low' });
    const b = makeContact({ id: 'high', name: 'high' });
    rpcMock.mockResolvedValue({
      data: {
        contacts: [
          { ...a, _score: 1 },
          { ...b, _score: 99 },
        ],
        assets: [],
      },
      error: null,
    });
    const { result } = renderHook(() => usePaletteSearch('x', { debounceMs: 20 }));
    await act(async () => {
      vi.advanceTimersByTime(30);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect((result.current.results[0] as { contact: Contact }).contact.id).toBe('high');
    expect((result.current.results[1] as { contact: Contact }).contact.id).toBe('low');
  });
});
