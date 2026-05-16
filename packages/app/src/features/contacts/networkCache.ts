/**
 * networkCache — IndexedDB-backed snapshot of the user's contacts + assets.
 *
 * The cache is authoritative for "what this device should paint right
 * now". Every full snapshot from the server is written here; every app
 * mount reads from here BEFORE waiting on the network. The result is a
 * supernatural second-load: the right pane is fully populated by the
 * time the wordmark finishes tweening in.
 *
 * Schema:
 *   DB:     reknowable_network (v1)
 *   Store:  snapshots         keyed by userId
 *   Value:  { userId, contacts, assets, fetchedAt }
 *
 * Migrations: bump DB_VERSION, add an `upgrade` step. Old keys are
 * preserved; readers tolerate missing fields.
 */

'use client';

import { openDB, type IDBPDatabase } from 'idb';
import type { Contact, Asset } from '../../lib/store';

const DB_NAME = 'reknowable_network';
const DB_VERSION = 1;
const STORE = 'snapshots';

export type NetworkSnapshot = {
  userId: string;
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
        if (oldVersion < 1) {
          db.createObjectStore(STORE, { keyPath: 'userId' });
        }
      },
    });
  }
  return dbPromise;
}

export async function readNetworkSnapshot(userId: string): Promise<NetworkSnapshot | null> {
  try {
    const db = await getDB();
    const value = (await db.get(STORE, userId)) as NetworkSnapshot | undefined;
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
    await db.put(STORE, snapshot);
  } catch {
    // Silent — the snapshot still lives in memory for this session.
  }
}

export async function clearNetworkSnapshot(userId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(STORE, userId);
  } catch {
    // Silent.
  }
}
