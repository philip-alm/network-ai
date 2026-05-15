import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PUBLIC = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_test',
};

beforeEach(() => {
  Object.entries(PUBLIC).forEach(([k, v]) => vi.stubEnv(k, v));
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('lib/supabase', () => {
  it('createSupabaseClient returns a configured client', async () => {
    const { createSupabaseClient } = await import('./index');
    const client = createSupabaseClient();
    expect(client).toBeDefined();
    // Smoke: the rest endpoint URL hangs off the client's internals.
    expect(client.auth).toBeDefined();
    expect(client.from).toBeTypeOf('function');
  });

  it('getBrowserSupabase returns the same instance across calls', async () => {
    // Stub window so the browser-only guard passes.
    vi.stubGlobal('window', {});
    const { getBrowserSupabase, __resetBrowserSupabaseForTests } = await import('./index');
    __resetBrowserSupabaseForTests();
    const a = getBrowserSupabase();
    const b = getBrowserSupabase();
    expect(a).toBe(b);
    vi.unstubAllGlobals();
  });

  it('getBrowserSupabase throws outside a browser', async () => {
    // jsdom provides `window` by default; temporarily un-define it.
    const originalWindow = globalThis.window;
    // @ts-expect-error deliberate teardown
    delete globalThis.window;
    try {
      const { getBrowserSupabase } = await import('./index');
      expect(() => getBrowserSupabase()).toThrow(/outside a browser/);
    } finally {
      globalThis.window = originalWindow;
    }
  });
});
