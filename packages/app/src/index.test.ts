import { describe, expect, it } from 'vitest';
import { helloFromAppPackage } from './index';

describe('@network-ai/app', () => {
  it('exports a working smoke function', () => {
    expect(helloFromAppPackage()).toBe('Hello from packages/app');
  });
});
