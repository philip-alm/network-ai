import { describe, expect, it } from 'vitest';
import * as types from './index';

describe('@network-ai/types', () => {
  it('module loads without throwing', () => {
    expect(typeof types).toBe('object');
  });
});
