import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import {
  readNetworkSnapshot,
  writeNetworkSnapshot,
  clearNetworkSnapshot,
  type NetworkSnapshot,
} from './networkCache';
import type { Contact, Asset } from '../../lib/store';

function contact(over: Partial<Contact> = {}): Contact {
  return {
    id: 'c-' + Math.random().toString(36).slice(2, 8),
    name: 'A',
    warmth: 3,
    city: null,
    tags: [],
    notes: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}
function asset(over: Partial<Asset> = {}): Asset {
  return {
    id: 'a-' + Math.random().toString(36).slice(2, 8),
    name: 'A',
    description: '',
    availability: null,
    tags: [],
    contact_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

const userA = 'user-a';
const userB = 'user-b';

describe('networkCache', () => {
  beforeEach(async () => {
    await clearNetworkSnapshot(userA);
    await clearNetworkSnapshot(userB);
  });

  it('returns null when no snapshot has been written', async () => {
    const got = await readNetworkSnapshot(userA);
    expect(got).toBeNull();
  });

  it('round-trips a snapshot', async () => {
    const snap: NetworkSnapshot = {
      userId: userA,
      contacts: [contact({ id: 'c1', name: 'Anna' })],
      assets: [asset({ id: 'a1', name: 'Studio' })],
      fetchedAt: 1700000000000,
    };
    await writeNetworkSnapshot(snap);
    const got = await readNetworkSnapshot(userA);
    expect(got).toEqual(snap);
  });

  it('isolates snapshots by userId', async () => {
    await writeNetworkSnapshot({
      userId: userA,
      contacts: [contact({ id: 'a-only' })],
      assets: [],
      fetchedAt: 1,
    });
    await writeNetworkSnapshot({
      userId: userB,
      contacts: [contact({ id: 'b-only' })],
      assets: [],
      fetchedAt: 2,
    });
    const a = await readNetworkSnapshot(userA);
    const b = await readNetworkSnapshot(userB);
    expect(a?.contacts[0].id).toBe('a-only');
    expect(b?.contacts[0].id).toBe('b-only');
  });

  it('overwrites a previous snapshot for the same user', async () => {
    await writeNetworkSnapshot({
      userId: userA,
      contacts: [contact({ id: 'v1' })],
      assets: [],
      fetchedAt: 1,
    });
    await writeNetworkSnapshot({
      userId: userA,
      contacts: [contact({ id: 'v2' })],
      assets: [],
      fetchedAt: 2,
    });
    const got = await readNetworkSnapshot(userA);
    expect(got?.contacts[0].id).toBe('v2');
    expect(got?.fetchedAt).toBe(2);
  });

  it('clear drops the snapshot', async () => {
    await writeNetworkSnapshot({
      userId: userA,
      contacts: [],
      assets: [],
      fetchedAt: 1,
    });
    await clearNetworkSnapshot(userA);
    expect(await readNetworkSnapshot(userA)).toBeNull();
  });
});
