import { describe, expect, it } from 'vitest';
import {
  buildPanelItems,
  findRowIndex,
  panelItemKey,
  PANEL_ITEM_ESTIMATES,
  type PanelItem,
} from './VirtualPanelList';
import type { Contact, Asset } from '../../lib/store';

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

describe('buildPanelItems', () => {
  it('produces empty array when the active list is empty', () => {
    const items = buildPanelItems({
      view: 'contacts',
      visibleContacts: [],
      visibleAssets: [],
      pinnedContactIds: new Set(),
      pinnedAssetIds: new Set(),
      showContacts: true,
      showAssets: false,
      showFirstEntryCaption: false,
    });
    expect(items).toEqual([]);
  });

  it('contacts view returns only contact items', () => {
    const c1 = makeContact({ id: 'a' });
    const c2 = makeContact({ id: 'b' });
    const items = buildPanelItems({
      view: 'contacts',
      visibleContacts: [c1, c2],
      visibleAssets: [],
      pinnedContactIds: new Set(),
      pinnedAssetIds: new Set(),
      showContacts: true,
      showAssets: false,
      showFirstEntryCaption: false,
    });
    expect(items.map((i) => i.type)).toEqual(['contact', 'contact']);
  });

  it('assets view returns only asset items', () => {
    const a1 = makeAsset({ id: 'a' });
    const a2 = makeAsset({ id: 'b' });
    const items = buildPanelItems({
      view: 'assets',
      visibleContacts: [],
      visibleAssets: [a1, a2],
      pinnedContactIds: new Set(),
      pinnedAssetIds: new Set(),
      showContacts: false,
      showAssets: true,
      showFirstEntryCaption: false,
    });
    expect(items.map((i) => i.type)).toEqual(['asset', 'asset']);
  });

  it('pinned contacts come first with label and divider', () => {
    const c1 = makeContact({ id: '1' });
    const c2 = makeContact({ id: '2' });
    const c3 = makeContact({ id: '3' });
    const items = buildPanelItems({
      view: 'contacts',
      visibleContacts: [c1, c2, c3],
      visibleAssets: [],
      pinnedContactIds: new Set(['2']),
      pinnedAssetIds: new Set(),
      showContacts: true,
      showAssets: false,
      showFirstEntryCaption: false,
    });
    expect(items.map((i) => i.type)).toEqual([
      'pinned-label',
      'contact',
      'pinned-divider',
      'contact',
      'contact',
    ]);
    const label = items[0];
    if (label.type === 'pinned-label') {
      expect(label.section).toBe('contacts');
      expect(label.count).toBe(1);
    }
  });

  it('cascadeIndex is sequential across pinned + rest within the active view', () => {
    const c1 = makeContact({ id: '1' });
    const c2 = makeContact({ id: '2' });
    const c3 = makeContact({ id: '3' });
    const items = buildPanelItems({
      view: 'contacts',
      visibleContacts: [c1, c2, c3],
      visibleAssets: [],
      pinnedContactIds: new Set(['1']),
      pinnedAssetIds: new Set(),
      showContacts: true,
      showAssets: false,
      showFirstEntryCaption: false,
    });
    const cascadeIndices = items
      .filter((i) => i.type === 'contact')
      .map((i) => (i.type === 'contact' ? i.cascadeIndex : -1));
    expect(cascadeIndices).toEqual([0, 1, 2]);
  });

  it('first-entry-caption appears after contacts when toggled on', () => {
    const c = makeContact();
    const items = buildPanelItems({
      view: 'contacts',
      visibleContacts: [c],
      visibleAssets: [],
      pinnedContactIds: new Set(),
      pinnedAssetIds: new Set(),
      showContacts: true,
      showAssets: false,
      showFirstEntryCaption: true,
    });
    expect(items.map((i) => i.type)).toEqual(['contact', 'first-entry-caption']);
  });
});

describe('panelItemKey', () => {
  it('uses type prefixes so a contact id and an asset id with the same uuid never collide', () => {
    const sharedId = 'same-uuid';
    const c = makeContact({ id: sharedId });
    const a = makeAsset({ id: sharedId });
    const cKey = panelItemKey({ type: 'contact', data: c, pinned: false, cascadeIndex: 0 });
    const aKey = panelItemKey({ type: 'asset', data: a, pinned: false, cascadeIndex: 0 });
    expect(cKey).not.toBe(aKey);
    expect(cKey).toBe(`c-${sharedId}`);
    expect(aKey).toBe(`a-${sharedId}`);
  });

  it('produces stable keys for non-row items', () => {
    expect(panelItemKey({ type: 'pinned-label', section: 'contacts', count: 0 })).toBe(
      'pl-contacts',
    );
    expect(panelItemKey({ type: 'pinned-divider', section: 'assets' })).toBe('pd-assets');
    expect(panelItemKey({ type: 'first-entry-caption' })).toBe('fec');
  });
});

describe('findRowIndex', () => {
  const c1 = makeContact({ id: 'c1' });
  const c2 = makeContact({ id: 'c2' });
  const a1 = makeAsset({ id: 'a1' });

  it('returns -1 when the items list is empty', () => {
    expect(findRowIndex([], 'contact', 'whatever')).toBe(-1);
  });

  it('returns -1 when the id is not present in items', () => {
    const items: PanelItem[] = [{ type: 'contact', data: c1, pinned: false, cascadeIndex: 0 }];
    expect(findRowIndex(items, 'contact', 'no-match')).toBe(-1);
  });

  it('finds a contact among contact items', () => {
    const items: PanelItem[] = [
      { type: 'contact', data: c1, pinned: false, cascadeIndex: 0 },
      { type: 'contact', data: c2, pinned: false, cascadeIndex: 1 },
    ];
    expect(findRowIndex(items, 'contact', 'c2')).toBe(1);
  });

  it('does NOT cross-match a contact id against an asset item with the same id', () => {
    const sameId = 'collision';
    const cSame = makeContact({ id: sameId });
    const aSame = makeAsset({ id: sameId });
    const items: PanelItem[] = [
      { type: 'asset', data: aSame, pinned: false, cascadeIndex: 0 },
      { type: 'contact', data: cSame, pinned: false, cascadeIndex: 1 },
    ];
    // Asks for a contact → must find the contact item, not the asset.
    expect(findRowIndex(items, 'contact', sameId)).toBe(1);
    expect(findRowIndex(items, 'asset', sameId)).toBe(0);
  });

  it('counts through non-row items (pinned labels, dividers) to the right absolute index', () => {
    const items: PanelItem[] = [
      { type: 'pinned-label', section: 'contacts', count: 1 },
      { type: 'contact', data: c1, pinned: true, cascadeIndex: 0 },
      { type: 'pinned-divider', section: 'contacts' },
      { type: 'contact', data: c2, pinned: false, cascadeIndex: 1 },
    ];
    // c2 is at absolute index 3 (pinned-label, c1, divider, c2). The
    // virtualizer needs the absolute index, not "contact-N", because
    // scrollToIndex is positional across all items.
    expect(findRowIndex(items, 'contact', 'c2')).toBe(3);
  });

  it('finds an asset among asset items', () => {
    const items: PanelItem[] = [{ type: 'asset', data: a1, pinned: false, cascadeIndex: 0 }];
    expect(findRowIndex(items, 'asset', 'a1')).toBe(0);
  });
});

describe('PANEL_ITEM_ESTIMATES', () => {
  it('defines a positive estimate for every item type', () => {
    for (const type of [
      'contact',
      'asset',
      'pinned-label',
      'pinned-divider',
      'first-entry-caption',
    ] as const) {
      expect(PANEL_ITEM_ESTIMATES[type]).toBeGreaterThan(0);
    }
  });
});
