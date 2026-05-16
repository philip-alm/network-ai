/**
 * Regression tests for filter-defaulting helpers in tools.ts.
 *
 * Production bug: the agent sent `contactFilter: { tags: ['podcast'] }`
 * (a partial — every other facet implicitly empty). The whole-object
 * `patch.contactFilter ?? defaults` fallback didn't fire because the
 * patch was truthy, and downstream `.length` access on undefined
 * arrays crashed with "Cannot read properties of undefined".
 *
 * These tests lock in that the fill helpers always return a complete,
 * length-safe filter object regardless of how partial the input is.
 */

import { describe, expect, it } from 'vitest';
import { fillContactFilter, fillAssetFilter } from './tools';

describe('fillContactFilter', () => {
  it('returns full defaults for null/undefined input', () => {
    const blank = {
      tags: [],
      tagsAll: [],
      cities: [],
      warmth: [],
      hasAssets: null,
      updatedWithinDays: null,
    };
    expect(fillContactFilter(undefined)).toEqual(blank);
    expect(fillContactFilter(null)).toEqual(blank);
    expect(fillContactFilter({})).toEqual(blank);
  });

  it('preserves the supplied tag filter and defaults the rest', () => {
    const result = fillContactFilter({ tags: ['podcast'] });
    expect(result.tags).toEqual(['podcast']);
    // Every other field is the array/null default — safe to .length.
    expect(result.tagsAll).toEqual([]);
    expect(result.cities).toEqual([]);
    expect(result.warmth).toEqual([]);
    expect(result.hasAssets).toBeNull();
    expect(result.updatedWithinDays).toBeNull();
  });

  it('rejects non-arrays where arrays are expected (defensive)', () => {
    // The LLM occasionally sends a single string where an array is
    // expected. Better to drop it than crash downstream.
    const result = fillContactFilter({
      tags: 'podcast' as unknown as string[],
      warmth: 5 as unknown as number[],
    });
    expect(result.tags).toEqual([]);
    expect(result.warmth).toEqual([]);
  });

  it('passes hasAssets and updatedWithinDays through unchanged', () => {
    expect(fillContactFilter({ hasAssets: true }).hasAssets).toBe(true);
    expect(fillContactFilter({ hasAssets: false }).hasAssets).toBe(false);
    expect(fillContactFilter({ updatedWithinDays: 30 }).updatedWithinDays).toBe(30);
  });
});

describe('fillAssetFilter', () => {
  it('returns full defaults for null/undefined/empty', () => {
    const blank = {
      tags: [],
      tagsAll: [],
      ownerIds: [],
      hasOwner: null,
      availabilityContains: '',
      updatedWithinDays: null,
    };
    expect(fillAssetFilter(undefined)).toEqual(blank);
    expect(fillAssetFilter(null)).toEqual(blank);
    expect(fillAssetFilter({})).toEqual(blank);
  });

  it('preserves availabilityContains string and defaults the rest', () => {
    const result = fillAssetFilter({ availabilityContains: 'tuesday' });
    expect(result.availabilityContains).toBe('tuesday');
    expect(result.tags).toEqual([]);
    expect(result.ownerIds).toEqual([]);
  });

  it('defaults availabilityContains to "" when given non-string', () => {
    const result = fillAssetFilter({
      availabilityContains: 42 as unknown as string,
    });
    expect(result.availabilityContains).toBe('');
  });
});
