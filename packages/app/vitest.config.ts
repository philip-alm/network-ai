import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    env: {
      // Smoke-only public env so `lib/env` can load during tests that don't
      // need a real Supabase. Tests that exercise auth provide their own
      // supabase mocks via vi.mock.
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_test',
    },
  },
});
