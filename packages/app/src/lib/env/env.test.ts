import { afterEach, describe, expect, it, vi } from 'vitest';

const PUBLIC = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_test',
};

async function loadEnv() {
  vi.resetModules();
  const mod = await import('./index');
  // Reset the lazy cache so stubbed vars are picked up.
  mod.__resetEnvCacheForTests();
  // Touch a property to force evaluation, then return a snapshot.
  return {
    supabaseUrl: mod.env.supabaseUrl,
    supabasePublishableKey: mod.env.supabasePublishableKey,
    openrouterApiKey: mod.env.openrouterApiKey,
    supabaseSecretKey: mod.env.supabaseSecretKey,
  };
}

describe('env', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('parses NEXT_PUBLIC_* vars', async () => {
    Object.entries(PUBLIC).forEach(([k, v]) => vi.stubEnv(k, v));
    const env = await loadEnv();
    expect(env.supabaseUrl).toBe(PUBLIC.NEXT_PUBLIC_SUPABASE_URL);
    expect(env.supabasePublishableKey).toBe(PUBLIC.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  });

  it('falls back to EXPO_PUBLIC_* vars when NEXT_PUBLIC_* are empty', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', 'https://expo.supabase.co');
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'sb_publishable_expo');
    const env = await loadEnv();
    expect(env.supabaseUrl).toBe('https://expo.supabase.co');
    expect(env.supabasePublishableKey).toBe('sb_publishable_expo');
  });

  it('exposes server-only vars as null when absent', async () => {
    Object.entries(PUBLIC).forEach(([k, v]) => vi.stubEnv(k, v));
    const env = await loadEnv();
    expect(env.openrouterApiKey).toBeNull();
    expect(env.supabaseSecretKey).toBeNull();
  });

  it('exposes server-only vars when set', async () => {
    Object.entries(PUBLIC).forEach(([k, v]) => vi.stubEnv(k, v));
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-v1-test');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_test');
    const env = await loadEnv();
    expect(env.openrouterApiKey).toBe('sk-or-v1-test');
    expect(env.supabaseSecretKey).toBe('sb_secret_test');
  });

  it('throws a clear error when required vars are missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_ANON_KEY', '');
    await expect(loadEnv()).rejects.toThrow(/Required public env vars/);
  });
});
