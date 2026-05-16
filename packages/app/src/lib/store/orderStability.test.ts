/**
 * orderStability — proves that upserting a contact WITHOUT changing
 * its `updated_at` does NOT reorder the contacts array. This is the
 * exact path `useContactDetails` takes when it lazy-loads notes on row
 * expand. If this test ever fails, opening a contact will visibly
 * reorder the list — the symptom the user has been reporting.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useNetworkStore, type Contact } from './index';
import {
  applyContactFilter,
  applyContactSort,
  applyPinning,
  buildAssetCountMap,
} from '../../features/contacts/panelLogic';
import { EMPTY_CONTACT_FILTER } from './index';

function makeContact(over: Partial<Contact> = {}): Contact {
  return {
    id: 'c-' + Math.random().toString(36).slice(2, 8),
    name: 'X',
    warmth: 3,
    city: null,
    tags: [],
    notes: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function visibleIds(
  contacts: Contact[],
  sort: 'updated_desc' | 'created_desc' | 'name_asc' | 'warmth_asc',
): string[] {
  const filtered = applyContactFilter(contacts, EMPTY_CONTACT_FILTER, {
    assets: [],
    search: '',
  });
  const sorted = applyContactSort(filtered, sort, {
    assetCountMap: buildAssetCountMap([]),
  });
  return applyPinning(sorted, []).list.map((c) => c.id);
}

describe('order stability — upsert preserving updated_at', () => {
  beforeEach(() => {
    useNetworkStore.setState({ contacts: [], assets: [] });
  });

  it('updated_desc display order is identical before + after upsert that keeps updated_at', () => {
    const A = makeContact({ id: 'A', updated_at: '2026-05-10T00:00:00Z' });
    const B = makeContact({ id: 'B', updated_at: '2026-05-05T00:00:00Z' });
    const C = makeContact({ id: 'C', updated_at: '2026-05-01T00:00:00Z' });
    useNetworkStore.setState({ contacts: [A, B, C] });

    const before = visibleIds(useNetworkStore.getState().contacts, 'updated_desc');
    expect(before).toEqual(['A', 'B', 'C']);

    // Simulate the lazy-fetch upsert: same updated_at, only notes changes.
    useNetworkStore.getState().actions.upsertContacts([{ ...B, notes: 'fetched-notes' }]);

    const after = visibleIds(useNetworkStore.getState().contacts, 'updated_desc');
    expect(after).toEqual(['A', 'B', 'C']);
  });

  it('name_asc display order is identical before + after upsert', () => {
    const anna = makeContact({ id: 'a', name: 'Anna' });
    const bo = makeContact({ id: 'b', name: 'Bo' });
    const cara = makeContact({ id: 'c', name: 'Cara' });
    useNetworkStore.setState({ contacts: [anna, bo, cara] });

    const before = visibleIds(useNetworkStore.getState().contacts, 'name_asc');
    expect(before).toEqual(['a', 'b', 'c']);

    useNetworkStore.getState().actions.upsertContacts([{ ...bo, notes: 'fetched' }]);

    const after = visibleIds(useNetworkStore.getState().contacts, 'name_asc');
    expect(after).toEqual(['a', 'b', 'c']);
  });

  it('contacts with identical updated_at + identical names stay in id-asc order', () => {
    const a1 = makeContact({
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Same',
    });
    const a2 = makeContact({
      id: '00000000-0000-0000-0000-000000000002',
      name: 'Same',
    });
    const a3 = makeContact({
      id: '00000000-0000-0000-0000-000000000003',
      name: 'Same',
    });
    useNetworkStore.setState({ contacts: [a1, a2, a3] });
    const before = visibleIds(useNetworkStore.getState().contacts, 'name_asc');
    useNetworkStore.getState().actions.upsertContacts([{ ...a2, notes: 'lazy' }]);
    const after = visibleIds(useNetworkStore.getState().contacts, 'name_asc');
    expect(after).toEqual(before);
  });

  it('warmth_asc is stable under lazy upsert', () => {
    const A = makeContact({ id: 'A', warmth: 1 });
    const B = makeContact({ id: 'B', warmth: 3 });
    const C = makeContact({ id: 'C', warmth: 5 });
    useNetworkStore.setState({ contacts: [A, B, C] });

    const before = visibleIds(useNetworkStore.getState().contacts, 'warmth_asc');
    useNetworkStore.getState().actions.upsertContacts([{ ...B, notes: 'lazy' }]);
    const after = visibleIds(useNetworkStore.getState().contacts, 'warmth_asc');
    expect(after).toEqual(before);
  });

  it('repeated lazy-fetch upserts never change the order', () => {
    const contacts = Array.from({ length: 50 }, (_, i) =>
      makeContact({
        id: `c-${String(i).padStart(3, '0')}`,
        name: `Person ${i}`,
        updated_at: new Date(2026, 4, 16, 0, 0, i).toISOString(),
      }),
    );
    useNetworkStore.setState({ contacts });

    const initial = visibleIds(useNetworkStore.getState().contacts, 'updated_desc');
    // Simulate opening many contacts in random order.
    const shuffled = [...contacts].sort(() => Math.random() - 0.5);
    for (const c of shuffled) {
      useNetworkStore.getState().actions.upsertContacts([{ ...c, notes: 'lazy' }]);
    }
    const final = visibleIds(useNetworkStore.getState().contacts, 'updated_desc');
    expect(final).toEqual(initial);
  });

  it('an upsert that DOES change updated_at moves the row to the top under updated_desc', () => {
    const A = makeContact({ id: 'A', updated_at: '2026-05-10T00:00:00Z' });
    const B = makeContact({ id: 'B', updated_at: '2026-05-05T00:00:00Z' });
    const C = makeContact({ id: 'C', updated_at: '2026-05-01T00:00:00Z' });
    useNetworkStore.setState({ contacts: [A, B, C] });

    const before = visibleIds(useNetworkStore.getState().contacts, 'updated_desc');
    expect(before).toEqual(['A', 'B', 'C']);

    // This is what `persistNotes` does — bumps updated_at to NOW.
    useNetworkStore
      .getState()
      .actions.upsertContacts([{ ...C, notes: 'edited', updated_at: '2026-05-20T00:00:00Z' }]);

    const after = visibleIds(useNetworkStore.getState().contacts, 'updated_desc');
    expect(after).toEqual(['C', 'A', 'B']);
  });
});
