import { describe, expect, it } from 'vitest';
import * as types from './index';

describe('@reknowable/types', () => {
  it('module loads without throwing', () => {
    expect(typeof types).toBe('object');
  });
});
