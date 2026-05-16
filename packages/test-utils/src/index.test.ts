import { describe, expect, it } from 'vitest';
import * as testUtils from './index';

describe('@reknowable/test-utils', () => {
  it('module loads without throwing', () => {
    expect(typeof testUtils).toBe('object');
  });
});
