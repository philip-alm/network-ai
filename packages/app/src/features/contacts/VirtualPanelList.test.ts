import { describe, expect, it } from 'vitest';
import { buildPanelItems, panelItemKey, PANEL_ITEM_ESTIMATES } from './VirtualPanelList';
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
  it('produces empty array when both lists are empty', () => {
    const items = buildPanelItems({
      view: 'both',
      visibleContacts: [],
      visibleAssets: [],
      pinnedContactIds: new Set(),
      pinnedAssetIds: new Set(),
      showContacts: true,
      showAssets: true,
      showFirstEntryCaption: false,
      assetsTotal: 0,
    });
    expect(items).toEqual([]);
  });

  it('contacts-only view skips the asset section header', () => {
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
      assetsTotal: 0,
    });
    expect(items.map((i) => i.type)).toEqual(['contact', 'contact']);
  });

  it('view=both inserts an asset-section-header BEFORE the first asset', () => {
    const c = makeContact({ id: 'c1' });
    const a = makeAsset({ id: 'a1' });
    const items = buildPanelItems({
      view: 'both',
      visibleContacts: [c],
      visibleAssets: [a],
      pinnedContactIds: new Set(),
      pinnedAssetIds: new Set(),
      showContacts: true,
      showAssets: true,
      showFirstEntryCaption: false,
      assetsTotal: 5,
    });
    expect(items.map((i) => i.type)).toEqual(['contact', 'asset-section-header', 'asset']);
    const header = items.find((i) => i.type === 'asset-section-header');
    expect(header).toBeDefined();
    if (header && header.type === 'asset-section-header') {
      expect(header.total).toBe(5);
      expect(header.visible).toBe(1);
    }
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
      assetsTotal: 0,
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

  it('cascadeIndex is sequential across pinned + rest, contacts + assets', () => {
    const c1 = makeContact({ id: '1' });
    const c2 = makeContact({ id: '2' });
    const a1 = makeAsset({ id: '3' });
    const a2 = makeAsset({ id: '4' });
    const items = buildPanelItems({
      view: 'both',
      visibleContacts: [c1, c2],
      visibleAssets: [a1, a2],
      pinnedContactIds: new Set(['1']),
      pinnedAssetIds: new Set(),
      showContacts: true,
      showAssets: true,
      showFirstEntryCaption: false,
      assetsTotal: 2,
    });
    const cascadeIndices = items
      .filter((i) => i.type === 'contact' || i.type === 'asset')
      .map((i) => (i.type === 'contact' || i.type === 'asset' ? i.cascadeIndex : -1));
    expect(cascadeIndices).toEqual([0, 1, 2, 3]);
  });

  it('hides asset section when assets list is empty even in view=both', () => {
    const c = makeContact();
    const items = buildPanelItems({
      view: 'both',
      visibleContacts: [c],
      visibleAssets: [],
      pinnedContactIds: new Set(),
      pinnedAssetIds: new Set(),
      showContacts: true,
      showAssets: true,
      showFirstEntryCaption: false,
      assetsTotal: 0,
    });
    expect(items.map((i) => i.type)).toEqual(['contact']);
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
      assetsTotal: 0,
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
    expect(panelItemKey({ type: 'asset-section-header', total: 0, visible: 0 })).toBe('ash');
    expect(panelItemKey({ type: 'first-entry-caption' })).toBe('fec');
  });
});

describe('PANEL_ITEM_ESTIMATES', () => {
  it('defines a positive estimate for every item type', () => {
    for (const type of [
      'contact',
      'asset',
      'pinned-label',
      'pinned-divider',
      'asset-section-header',
      'first-entry-caption',
    ] as const) {
      expect(PANEL_ITEM_ESTIMATES[type]).toBeGreaterThan(0);
    }
  });
});
