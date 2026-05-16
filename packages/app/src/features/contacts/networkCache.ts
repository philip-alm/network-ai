/**
 * networkCache — IndexedDB-backed snapshot of the user's contacts + assets.
 *
 * The cache is keyed by **userId + viewHash** so a warm cache for one
 * filter (e.g. tags=['gaming']) doesn't paint over a fresh load of a
 * different filter (e.g. tags=['investor']). When the user changes
 * their active filter/sort/search, the next mount finds no cache for
 * that view and shows SkeletonRows instead of flashing wrong rows.
 *
 * Every viewHash has its own snapshot. Defaults (no filters, default
 * sort) have a stable empty-string hash so cold cache is just the
 * default view.
 *
 * Schema:
 *   DB:     reknowable_network (v2)
 *   Store:  snapshots         keyed by `${userId}::${viewHash}`
 *   Value:  { userId, viewHash, contacts, assets, fetchedAt }
 *
 * v1 → v2 upgrade: drop the old store and recreate with the composite
 * key. The old per-user cache becomes stale and is harmlessly evicted.
 */

'use client';

import { openDB, type IDBPDatabase } from 'idb';
import type { Contact, Asset, PanelState } from '../../lib/store';

const DB_NAME = 'reknowable_network';
const DB_VERSION = 2;
const STORE = 'snapshots';

export type NetworkSnapshot = {
  userId: string;
  viewHash: string;
  contacts: Contact[];
  assets: Asset[];
  fetchedAt: number;
};

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('networkCache: no window'));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // v2: drop v1's per-user store and recreate with composite key.
        // The previous snapshot becomes uncacheable; the next fetch
        // populates the v2 store cleanly.
        if (db.objectStoreNames.contains(STORE)) {
          db.deleteObjectStore(STORE);
        }
        db.createObjectStore(STORE); // out-of-line keys; we compose them
        void oldVersion;
      },
    });
  }
  return dbPromise;
}

/**
 * Stable hash for the panel state's "view" axes — the filter + sort +
 * search shape the user (or agent) has chosen. Stringify is fine for
 * our shapes; arrays are sorted to make order-independent equivalent
 * filters hash identically.
 */
export function panelViewHash(
  panel: Pick<
    PanelState,
    'contactFilter' | 'contactSort' | 'assetFilter' | 'assetSort' | 'search' | 'view'
  >,
): string {
  const sortArr = (a: readonly string[] | undefined) => (a ? [...a].sort() : []);
  const sortNumArr = (a: readonly number[] | undefined) => (a ? [...a].sort((x, y) => x - y) : []);
  return JSON.stringify({
    v: panel.view,
    cs: panel.contactSort,
    as: panel.assetSort,
    s: panel.search,
    cf: panel.contactFilter
      ? {
          tags: sortArr(panel.contactFilter.tags),
          tagsAll: sortArr(panel.contactFilter.tagsAll),
          cities: sortArr(panel.contactFilter.cities),
          warmth: sortNumArr(panel.contactFilter.warmth),
          hasAssets: panel.contactFilter.hasAssets,
          updatedWithinDays: panel.contactFilter.updatedWithinDays,
        }
      : null,
    af: panel.assetFilter
      ? {
          tags: sortArr(panel.assetFilter.tags),
          tagsAll: sortArr(panel.assetFilter.tagsAll),
          ownerIds: sortArr(panel.assetFilter.ownerIds),
          hasOwner: panel.assetFilter.hasOwner,
          availabilityContains: panel.assetFilter.availabilityContains,
          updatedWithinDays: panel.assetFilter.updatedWithinDays,
        }
      : null,
  });
}

function key(userId: string, viewHash: string): string {
  return `${userId}::${viewHash}`;
}

export async function readNetworkSnapshot(
  userId: string,
  viewHash: string,
): Promise<NetworkSnapshot | null> {
  try {
    const db = await getDB();
    const value = (await db.get(STORE, key(userId, viewHash))) as NetworkSnapshot | undefined;
    return value ?? null;
  } catch {
    // Cache is best-effort. Any IndexedDB failure (private mode, quota,
    // schema mismatch) is silently treated as "no cache".
    return null;
  }
}

export async function writeNetworkSnapshot(snapshot: NetworkSnapshot): Promise<void> {
  try {
    const db = await getDB();
    await db.put(STORE, snapshot, key(snapshot.userId, snapshot.viewHash));
  } catch {
    // Silent — the snapshot still lives in memory for this session.
  }
}

export async function clearNetworkSnapshot(userId: string, viewHash: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(STORE, key(userId, viewHash));
  } catch {
    // Silent.
  }
}

/** Wipe every cached snapshot for a user (used on sign-out). */
export async function clearAllUserSnapshots(userId: string): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE, 'readwrite');
    const keys = (await tx.store.getAllKeys()) as string[];
    for (const k of keys) {
      if (k.startsWith(`${userId}::`)) await tx.store.delete(k);
    }
    await tx.done;
  } catch {
    // Silent.
  }
}
