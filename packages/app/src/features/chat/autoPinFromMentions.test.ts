/**
 * Auto-pin contract: every contact named via [Name](contact:UUID) in
 * the final assistant text MUST end up in the right pane's pinned set.
 * The agent has historically been unreliable about this (RULE 1 in the
 * system prompt was honored ~60% of the time); these tests lock in
 * the UI-side enforcement so the rate is 100%.
 */

import { describe, expect, it } from 'vitest';
import { computeAutoPinUpdate, extractMentionedContactIds } from './autoPinFromMentions';

const naomi = '11111111-1111-4111-8111-111111111111';
const august = '22222222-2222-4222-8222-222222222222';
const albin = '33333333-3333-4333-8333-333333333333';

describe('extractMentionedContactIds', () => {
  it('returns empty for plain text', () => {
    expect(extractMentionedContactIds('no mentions here')).toEqual([]);
  });

  it('returns empty for asset mentions (assets are not pinned here)', () => {
    const txt = 'You have [Podcast studio](asset:99999999-9999-4999-8999-999999999999).';
    expect(extractMentionedContactIds(txt)).toEqual([]);
  });

  it('extracts a single contact mention', () => {
    const txt = `Naomi's your strongest path: [Naomi Davis](contact:${naomi}).`;
    expect(extractMentionedContactIds(txt)).toEqual([naomi]);
  });

  it('extracts multiple contact mentions in order of appearance', () => {
    const txt = `Top picks: [Naomi Davis](contact:${naomi}), [August Nilsson](contact:${august}), [Albin Holm](contact:${albin}).`;
    expect(extractMentionedContactIds(txt)).toEqual([naomi, august, albin]);
  });

  it('dedupes repeats (a contact mentioned twice only pins once)', () => {
    const txt = `[Naomi Davis](contact:${naomi}) … later, [Naomi Davis](contact:${naomi}) again.`;
    expect(extractMentionedContactIds(txt)).toEqual([naomi]);
  });

  it('normalizes uppercase UUIDs to lowercase', () => {
    const upper = naomi.toUpperCase();
    expect(extractMentionedContactIds(`[N](contact:${upper})`)).toEqual([naomi]);
  });

  it('ignores malformed UUIDs', () => {
    expect(extractMentionedContactIds('[N](contact:not-a-uuid)')).toEqual([]);
    expect(extractMentionedContactIds('[N](contact:1234)')).toEqual([]);
  });

  it('ignores external links (no contact protocol)', () => {
    expect(extractMentionedContactIds('[website](https://example.com)')).toEqual([]);
  });

  it('handles empty / null / undefined safely', () => {
    expect(extractMentionedContactIds('')).toEqual([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(extractMentionedContactIds(null as any)).toEqual([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(extractMentionedContactIds(undefined as any)).toEqual([]);
  });
});

describe('computeAutoPinUpdate', () => {
  it('returns null when no mentions in text', () => {
    expect(computeAutoPinUpdate('no mentions', [])).toBeNull();
  });

  it('returns null when every mention is already pinned (no-op)', () => {
    const txt = `[Naomi Davis](contact:${naomi})`;
    expect(computeAutoPinUpdate(txt, [naomi])).toBeNull();
  });

  it('adds a fresh mention to the end, preserving existing pin order', () => {
    const txt = `[August Nilsson](contact:${august})`;
    expect(computeAutoPinUpdate(txt, [naomi])).toEqual({
      nextPinned: [naomi, august],
      added: [august],
    });
  });

  it('only appends ids that were not already pinned', () => {
    const txt = `Top picks: [Naomi Davis](contact:${naomi}), [August Nilsson](contact:${august}), [Albin Holm](contact:${albin}).`;
    expect(computeAutoPinUpdate(txt, [august])).toEqual({
      nextPinned: [august, naomi, albin],
      added: [naomi, albin],
    });
  });

  it('preserves existing-pin order when ALL mentions are new', () => {
    const txt = `[Naomi Davis](contact:${naomi}), [August Nilsson](contact:${august}).`;
    const existing = [albin];
    expect(computeAutoPinUpdate(txt, existing)).toEqual({
      nextPinned: [albin, naomi, august],
      added: [naomi, august],
    });
  });

  it('returns null when existing pins are empty AND text has no mentions', () => {
    expect(computeAutoPinUpdate('', [])).toBeNull();
  });
});
