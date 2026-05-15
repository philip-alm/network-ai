import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Playwright tests in apps/web/tests/ are driven by `playwright test`,
    // not vitest. Exclude them so `pnpm test` doesn't try to import their
    // @playwright/test fixtures.
    exclude: ['node_modules', '.next', 'tests/**'],
    include: ['app/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
  },
});
