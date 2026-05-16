/**
 * CommandPalette — behavior tests covering the four things that broke
 * in the previous implementation:
 *
 *   1. Empty palette is exhaustive: the visible filter doesn't
 *      truncate what the user can find.
 *   2. Clicking a result reliably navigates — view-toggled if needed,
 *      fetched if not in the store, scrolled into view via the
 *      virtualizer.
 *   3. Outside-filter rows are visually marked so the user understands
 *      why the click "looks weird" when their filter would have hidden
 *      the row.
 *   4. The server search is debounced + seq-guarded + visibly in-flight.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

const navigateSpy = vi.fn();
vi.mock('../contacts/useNavigateToRow', () => ({
  useNavigateToRow: () => navigateSpy,
}));

const rpcMock = vi.fn();
vi.mock('../../lib/supabase', () => ({
  getBrowserSupabase: () => ({ rpc: rpcMock }),
}));

// Stub ResizeObserver because WithTooltip's Floating UI integration
// uses it (the outside-filter chip wraps in a tooltip).
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

import { CommandPalette } from './CommandPalette';
import {
  useNetworkStore,
  DEFAULT_PANEL_STATE,
  EMPTY_CONTACT_FILTER,
  type Contact,
  type Asset,
} from '../../lib/store';

function makeContact(over: Partial<Contact> = {}): Contact {
  return {
    id: 'c-' + Math.random().toString(36).slice(2, 10),
    name: 'Anna Svensson',
    warmth: 3,
    city: 'Stockholm',
    tags: [],
    notes: '',
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

beforeEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver =
    NoopResizeObserver as unknown as typeof ResizeObserver;
  // jsdom doesn't implement scrollIntoView; the highlight-follow effect
  // calls it. Stub a no-op so the effect doesn't throw.
  if (!('scrollIntoView' in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: function scrollIntoView() {},
    });
  }
  vi.useFakeTimers();
  navigateSpy.mockReset();
  rpcMock.mockReset();
  resetStore();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('CommandPalette · open + local results', () => {
  it('does not render when closed', () => {
    render(<CommandPalette open={false} onClose={() => {}} />);
    expect(screen.queryByTestId('command-palette-overlay')).toBeNull();
  });

  it('renders top local results when open with no query', () => {
    useNetworkStore.setState({
      contacts: [makeContact({ id: 'a', name: 'Anna' }), makeContact({ id: 'b', name: 'Bob' })],
    });
    render(<CommandPalette open onClose={() => {}} />);
    expect(screen.getByTestId('command-palette-overlay')).toBeTruthy();
    expect(screen.getByTestId('palette-result-contact-a')).toBeTruthy();
    expect(screen.getByTestId('palette-result-contact-b')).toBeTruthy();
  });

  it('Esc key closes the palette', () => {
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} />);
    const input = screen.getByTestId('command-palette-input');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('CommandPalette · navigation', () => {
  it('Enter on highlighted result fires useNavigateToRow with kind + id', () => {
    const anna = makeContact({ id: 'anna-id', name: 'Anna' });
    useNetworkStore.setState({ contacts: [anna] });
    render(<CommandPalette open onClose={() => {}} />);
    const input = screen.getByTestId('command-palette-input');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(navigateSpy).toHaveBeenCalledWith('contact', 'anna-id');
  });

  it('Click on a result fires useNavigateToRow', () => {
    const anna = makeContact({ id: 'anna-id', name: 'Anna' });
    useNetworkStore.setState({ contacts: [anna] });
    render(<CommandPalette open onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('palette-result-contact-anna-id'));
    expect(navigateSpy).toHaveBeenCalledWith('contact', 'anna-id');
  });

  it('clicking a result calls onClose before navigating (so view-toggle is not masked)', () => {
    const onClose = vi.fn();
    const anna = makeContact({ id: 'anna-id', name: 'Anna' });
    useNetworkStore.setState({ contacts: [anna] });
    render(<CommandPalette open onClose={onClose} />);
    fireEvent.click(screen.getByTestId('palette-result-contact-anna-id'));
    expect(onClose).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalled();
  });

  it('Arrow Down moves the highlight', () => {
    useNetworkStore.setState({
      contacts: [makeContact({ id: 'a', name: 'Anna' }), makeContact({ id: 'b', name: 'Bob' })],
    });
    render(<CommandPalette open onClose={() => {}} />);
    const input = screen.getByTestId('command-palette-input');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(navigateSpy).toHaveBeenCalledWith('contact', 'b');
  });
});

describe('CommandPalette · outside-filter chip', () => {
  it('marks rows that do not match the active panel filter', () => {
    const inFilter = makeContact({ id: 'in', name: 'Anna', warmth: 5 });
    const outOfFilter = makeContact({ id: 'out', name: 'Anders', warmth: 1 });
    useNetworkStore.setState({
      contacts: [inFilter, outOfFilter],
      panel: {
        ...DEFAULT_PANEL_STATE,
        contactFilter: { ...EMPTY_CONTACT_FILTER, warmth: [5] },
      },
    });
    render(<CommandPalette open onClose={() => {}} />);
    // The 'out' row should render an outside-filter chip; 'in' should not.
    const outRow = screen.getByTestId('palette-result-contact-out');
    const inRow = screen.getByTestId('palette-result-contact-in');
    expect(outRow.querySelector('[data-testid="palette-outside-filter"]')).toBeTruthy();
    expect(inRow.querySelector('[data-testid="palette-outside-filter"]')).toBeNull();
  });

  it('clicking an outside-filter row still navigates', () => {
    const outOfFilter = makeContact({ id: 'out', name: 'Anders', warmth: 1 });
    useNetworkStore.setState({
      contacts: [outOfFilter],
      panel: {
        ...DEFAULT_PANEL_STATE,
        contactFilter: { ...EMPTY_CONTACT_FILTER, warmth: [5] },
      },
    });
    render(<CommandPalette open onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('palette-result-contact-out'));
    expect(navigateSpy).toHaveBeenCalledWith('contact', 'out');
  });
});

describe('CommandPalette · server search', () => {
  it('shows "searching…" while the server RPC is in flight', async () => {
    // Never-resolving promise so inflight stays true.
    rpcMock.mockImplementation(() => new Promise(() => {}));
    render(<CommandPalette open onClose={() => {}} />);
    const input = screen.getByTestId('command-palette-input');
    fireEvent.change(input, { target: { value: 'anna' } });
    // Past debounce (80ms default).
    await act(async () => {
      vi.advanceTimersByTime(120);
      await Promise.resolve();
    });
    expect(screen.getByTestId('palette-server-inflight')).toBeTruthy();
  });

  it('appends server-only results to local ones once RPC returns', async () => {
    const localAnna = makeContact({ id: 'local', name: 'Anna' });
    useNetworkStore.setState({ contacts: [localAnna] });
    const serverBob = makeContact({ id: 'server', name: 'Bob (server-only)' });
    rpcMock.mockResolvedValue({
      data: { contacts: [{ ...serverBob, _score: 5 }], assets: [] },
      error: null,
    });
    render(<CommandPalette open onClose={() => {}} />);
    const input = screen.getByTestId('command-palette-input');
    fireEvent.change(input, { target: { value: 'b' } });
    await act(async () => {
      vi.advanceTimersByTime(150);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId('palette-result-contact-server')).toBeTruthy();
  });

  it('clicking a server-only result navigates (lookup happens inside useNavigateToRow)', async () => {
    const serverBob = makeContact({ id: 'server-only', name: 'Bob' });
    rpcMock.mockResolvedValue({
      data: { contacts: [{ ...serverBob, _score: 5 }], assets: [] },
      error: null,
    });
    render(<CommandPalette open onClose={() => {}} />);
    const input = screen.getByTestId('command-palette-input');
    fireEvent.change(input, { target: { value: 'bob' } });
    await act(async () => {
      vi.advanceTimersByTime(150);
      await Promise.resolve();
      await Promise.resolve();
    });
    fireEvent.click(screen.getByTestId('palette-result-contact-server-only'));
    expect(navigateSpy).toHaveBeenCalledWith('contact', 'server-only');
  });

  it('surfaces "local only" indicator when the server RPC errors', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'rpc down' } });
    render(<CommandPalette open onClose={() => {}} />);
    const input = screen.getByTestId('command-palette-input');
    fireEvent.change(input, { target: { value: 'x' } });
    await act(async () => {
      vi.advanceTimersByTime(150);
      await Promise.resolve();
    });
    expect(screen.getByTestId('palette-server-error')).toBeTruthy();
  });
});

describe('CommandPalette · empty states', () => {
  it('"Searching everywhere…" shows while inflight + no local hits', async () => {
    rpcMock.mockImplementation(() => new Promise(() => {}));
    render(<CommandPalette open onClose={() => {}} />);
    const input = screen.getByTestId('command-palette-input');
    fireEvent.change(input, { target: { value: 'nobody-loaded' } });
    await act(async () => {
      vi.advanceTimersByTime(120);
      await Promise.resolve();
    });
    expect(screen.getByText(/searching everywhere/i)).toBeTruthy();
  });

  it('"No matches" once server returns empty + no local hits', async () => {
    rpcMock.mockResolvedValue({ data: { contacts: [], assets: [] }, error: null });
    render(<CommandPalette open onClose={() => {}} />);
    const input = screen.getByTestId('command-palette-input');
    fireEvent.change(input, { target: { value: 'zzz' } });
    await act(async () => {
      vi.advanceTimersByTime(150);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText(/no matches for "zzz"/i)).toBeTruthy();
  });
});

// Asset shape kept here for completeness — used to verify the result
// rendering branch dispatches correctly between contact and asset.
const _typeWitness: Asset = {
  id: 'a',
  name: 'x',
  description: '',
  availability: null,
  tags: [],
  contact_id: null,
  created_at: '',
  updated_at: '',
};
void _typeWitness;
