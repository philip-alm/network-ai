import { describe, expect, it } from 'vitest';
import * as ui from './index';

describe('@reknowable/ui', () => {
  it('module loads without throwing', () => {
    expect(typeof ui).toBe('object');
  });
});
