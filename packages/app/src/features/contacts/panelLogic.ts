/**
 * panelLogic — pure functions that turn raw contacts/assets + the
 * panel state in the store into the lists the UI actually renders.
 *
 * All transformations live here (and nowhere else) so the rendering
 * components stay declarative and the agent's set_panel tool has a
 * single, predictable model of what its choices do.
 */

import type {
  Asset,
  Contact,
  ContactFilterState,
  AssetFilterState,
  ContactSortMode,
  AssetSortMode,
} from '../../lib/store';

const DAY_MS = 24 * 60 * 60 * 1000;

function searchMatchContact(c: Contact, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (c.name.toLowerCase().includes(needle)) return true;
  if (c.notes && c.notes.toLowerCase().includes(needle)) return true;
  if (c.city && c.city.toLowerCase().includes(needle)) return true;
  if (c.tags.some((t) => t.toLowerCase().includes(needle))) return true;
  return false;
}

function searchMatchAsset(a: Asset, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (a.name.toLowerCase().includes(needle)) return true;
  if (a.description && a.description.toLowerCase().includes(needle)) return true;
  if (a.availability && a.availability.toLowerCase().includes(needle)) return true;
  if (a.tags.some((t) => t.toLowerCase().includes(needle))) return true;
  return false;
}

export function isContactFilterEmpty(f: ContactFilterState): boolean {
  return (
    f.tags.length === 0 &&
    f.tagsAll.length === 0 &&
    f.cities.length === 0 &&
    f.warmth.length === 0 &&
    f.hasAssets == null &&
    f.updatedWithinDays == null
  );
}

export function isAssetFilterEmpty(f: AssetFilterState): boolean {
  return (
    f.tags.length === 0 &&
    f.tagsAll.length === 0 &&
    f.ownerIds.length === 0 &&
    f.hasOwner == null &&
    f.availabilityContains === '' &&
    f.updatedWithinDays == null
  );
}

export function applyContactFilter(
  contacts: Contact[],
  filter: ContactFilterState,
  ctx: { assets: Asset[]; search: string; now?: number },
): Contact[] {
  const now = ctx.now ?? Date.now();
  const anyTags = new Set(filter.tags);
  const allTags = new Set(filter.tagsAll);
  const cities = new Set(filter.cities);
  const warmth = new Set(filter.warmth);
  // Build a contact_id → owns-at-least-one-asset map only when needed.
  const ownsAsset =
    filter.hasAssets != null
      ? new Set(
          ctx.assets
            .filter((a) => a.contact_id != null && !a.deleted_at)
            .map((a) => a.contact_id as string),
        )
      : null;

  return contacts.filter((c) => {
    if (!searchMatchContact(c, ctx.search)) return false;
    if (anyTags.size > 0 && !c.tags.some((t) => anyTags.has(t))) return false;
    if (allTags.size > 0 && !filter.tagsAll.every((t) => c.tags.includes(t))) return false;
    if (cities.size > 0 && (!c.city || !cities.has(c.city))) return false;
    if (warmth.size > 0 && (c.warmth == null || !warmth.has(c.warmth))) return false;
    if (filter.hasAssets != null && ownsAsset) {
      const has = ownsAsset.has(c.id);
      if (has !== filter.hasAssets) return false;
    }
    if (filter.updatedWithinDays != null) {
      const t = Date.parse(c.updated_at);
      if (Number.isNaN(t)) return false;
      if (now - t > filter.updatedWithinDays * DAY_MS) return false;
    }
    return true;
  });
}

export function applyAssetFilter(
  assets: Asset[],
  filter: AssetFilterState,
  ctx: { search: string; now?: number },
): Asset[] {
  const now = ctx.now ?? Date.now();
  const anyTags = new Set(filter.tags);
  const allTags = new Set(filter.tagsAll);
  const owners = new Set(filter.ownerIds);
  const availNeedle = filter.availabilityContains.toLowerCase().trim();

  return assets.filter((a) => {
    if (!searchMatchAsset(a, ctx.search)) return false;
    if (anyTags.size > 0 && !a.tags.some((t) => anyTags.has(t))) return false;
    if (allTags.size > 0 && !filter.tagsAll.every((t) => a.tags.includes(t))) return false;
    if (owners.size > 0 && (a.contact_id == null || !owners.has(a.contact_id))) return false;
    if (filter.hasOwner != null) {
      const has = a.contact_id != null;
      if (has !== filter.hasOwner) return false;
    }
    if (availNeedle.length > 0) {
      if (!a.availability || !a.availability.toLowerCase().includes(availNeedle)) {
        return false;
      }
    }
    if (filter.updatedWithinDays != null) {
      const t = Date.parse(a.updated_at);
      if (Number.isNaN(t)) return false;
      if (now - t > filter.updatedWithinDays * DAY_MS) return false;
    }
    return true;
  });
}

/**
 * Build a contact_id → asset_count map. Pulled out + memoizable so the
 * accordion can compute it ONCE per (contacts, assets) change rather
 * than rebuilding it inside every sort call.
 */
export function buildAssetCountMap(assets: Asset[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const a of assets) {
    if (a.contact_id == null || a.deleted_at) continue;
    counts.set(a.contact_id, (counts.get(a.contact_id) ?? 0) + 1);
  }
  return counts;
}

const EMPTY_ASSETS: Asset[] = [];

/**
 * Build a contact_id → Asset[] map. Lets every ContactRow receive only
 * its OWN assets as a prop instead of the entire assets array — so
 * React.memo can short-circuit row re-renders when an unrelated asset
 * is touched. Returns a frozen empty array sentinel for contacts with
 * no assets so the prop ref is stable across rebuilds.
 */
export function buildAssetsByOwnerMap(assets: Asset[]): Map<string, Asset[]> {
  const m = new Map<string, Asset[]>();
  for (const a of assets) {
    if (a.contact_id == null || a.deleted_at) continue;
    const list = m.get(a.contact_id);
    if (list) list.push(a);
    else m.set(a.contact_id, [a]);
  }
  return m;
}

export function getOwnAssets(map: Map<string, Asset[]>, contactId: string): Asset[] {
  return map.get(contactId) ?? EMPTY_ASSETS;
}

// ─── Sort comparators ────────────────────────────────────────────────
//
// Every sort is a CHAIN of comparators: the primary key (what the user
// asked for), then one or more tiebreakers so two rows with the same
// primary value never swap places randomly between renders. The last
// link in every chain is `byIdAsc` — guarantees total ordering even
// when names + dates collide (bulk inserts, identical entries).
//
// Null/missing values always sort LAST regardless of direction. That's
// the intuitive read: "I don't know" should never outrank "I do."

type Cmp<T> = (a: T, b: T) => number;

/** Compose comparators left-to-right; returns the first non-zero result. */
function chain<T>(...cmps: Cmp<T>[]): Cmp<T> {
  return (a, b) => {
    for (const cmp of cmps) {
      const v = cmp(a, b);
      if (v !== 0) return v;
    }
    return 0;
  };
}

/** Locale-aware, case-insensitive collator. One instance reused. */
const COLLATOR = new Intl.Collator(undefined, { sensitivity: 'base' });

/** Compare a nullable scalar — nulls always sort last, regardless of direction. */
function nullableNumber<T>(get: (x: T) => number | null | undefined, dir: 'asc' | 'desc'): Cmp<T> {
  return (a, b) => {
    const av = get(a);
    const bv = get(b);
    const aNull = av == null;
    const bNull = bv == null;
    if (aNull && bNull) return 0;
    if (aNull) return 1;
    if (bNull) return -1;
    return dir === 'asc' ? av - bv : bv - av;
  };
}

function nullableString<T>(get: (x: T) => string | null | undefined, dir: 'asc' | 'desc'): Cmp<T> {
  return (a, b) => {
    const av = get(a);
    const bv = get(b);
    const aEmpty = !av;
    const bEmpty = !bv;
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    return dir === 'asc' ? COLLATOR.compare(av, bv) : COLLATOR.compare(bv, av);
  };
}

// Contact comparators ----------------------------------------------------
const contactByName = (dir: 'asc' | 'desc'): Cmp<Contact> =>
  nullableString<Contact>((c) => c.name, dir);
const contactByUpdated = (dir: 'asc' | 'desc'): Cmp<Contact> =>
  nullableString<Contact>((c) => c.updated_at ?? null, dir);
const contactByCreated = (dir: 'asc' | 'desc'): Cmp<Contact> =>
  nullableString<Contact>((c) => c.created_at ?? null, dir);
const contactByWarmth = (dir: 'asc' | 'desc'): Cmp<Contact> =>
  nullableNumber<Contact>((c) => c.warmth, dir);
const contactByAssetCount = (counts: Map<string, number>, dir: 'asc' | 'desc'): Cmp<Contact> =>
  nullableNumber<Contact>((c) => counts.get(c.id) ?? 0, dir);
const contactByIdAsc: Cmp<Contact> = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// Asset comparators ------------------------------------------------------
const assetByName = (dir: 'asc' | 'desc'): Cmp<Asset> => nullableString<Asset>((a) => a.name, dir);
const assetByUpdated = (dir: 'asc' | 'desc'): Cmp<Asset> =>
  nullableString<Asset>((a) => a.updated_at ?? null, dir);
const assetByCreated = (dir: 'asc' | 'desc'): Cmp<Asset> =>
  nullableString<Asset>((a) => a.created_at ?? null, dir);
const assetByIdAsc: Cmp<Asset> = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * applyContactSort — pure, stable, total ordering.
 *
 * Tiebreak strategy (in order):
 *   1. The primary key the user picked.
 *   2. Name (asc) — alphabetical fallback so equal primaries don't shuffle.
 *      Default sort says "warmth desc, name asc" → warmest first, then
 *      alphabetical within each warmth tier.
 *   3. ID (asc) — final guarantee of total ordering, never observable
 *      to the user but kills any remaining flicker.
 */
export function applyContactSort(
  contacts: Contact[],
  mode: ContactSortMode,
  ctx: { assets?: Asset[]; assetCountMap?: Map<string, number> },
): Contact[] {
  const arr = contacts.slice();
  switch (mode) {
    case 'updated_desc':
      arr.sort(chain(contactByUpdated('desc'), contactByName('asc'), contactByIdAsc));
      break;
    case 'created_desc':
      arr.sort(chain(contactByCreated('desc'), contactByName('asc'), contactByIdAsc));
      break;
    case 'name_asc':
      arr.sort(chain(contactByName('asc'), contactByCreated('desc'), contactByIdAsc));
      break;
    case 'name_desc':
      arr.sort(chain(contactByName('desc'), contactByCreated('desc'), contactByIdAsc));
      break;
    case 'warmth_asc':
      arr.sort(chain(contactByWarmth('asc'), contactByName('asc'), contactByIdAsc));
      break;
    case 'warmth_desc':
      arr.sort(chain(contactByWarmth('desc'), contactByName('asc'), contactByIdAsc));
      break;
    case 'asset_count_desc': {
      const counts = ctx.assetCountMap ?? buildAssetCountMap(ctx.assets ?? []);
      arr.sort(chain(contactByAssetCount(counts, 'desc'), contactByName('asc'), contactByIdAsc));
      break;
    }
  }
  return arr;
}

/**
 * applyAssetSort — same tiebreak philosophy as contacts.
 * Primary key first, then name asc, then id asc as final stability guard.
 */
export function applyAssetSort(assets: Asset[], mode: AssetSortMode): Asset[] {
  const arr = assets.slice();
  switch (mode) {
    case 'updated_desc':
      arr.sort(chain(assetByUpdated('desc'), assetByName('asc'), assetByIdAsc));
      break;
    case 'created_desc':
      arr.sort(chain(assetByCreated('desc'), assetByName('asc'), assetByIdAsc));
      break;
    case 'name_asc':
      arr.sort(chain(assetByName('asc'), assetByCreated('desc'), assetByIdAsc));
      break;
    case 'name_desc':
      arr.sort(chain(assetByName('desc'), assetByCreated('desc'), assetByIdAsc));
      break;
  }
  return arr;
}

/**
 * Hoist pinned items to the top of a list in the order the pins were
 * given. Items not in the pin set keep their current relative order.
 *
 * Returns `{ list, pinnedSet }` so callers can render a visual pin
 * indicator on pinned rows.
 */
export function applyPinning<T extends { id: string }>(
  list: T[],
  pinnedIds: string[],
): { list: T[]; pinnedSet: Set<string> } {
  if (pinnedIds.length === 0) return { list, pinnedSet: new Set() };
  const pinnedSet = new Set(pinnedIds);
  const byId = new Map(list.map((x) => [x.id, x]));
  const pinned: T[] = [];
  for (const id of pinnedIds) {
    const x = byId.get(id);
    if (x) pinned.push(x);
  }
  const rest = list.filter((x) => !pinnedSet.has(x.id));
  return { list: [...pinned, ...rest], pinnedSet };
}
