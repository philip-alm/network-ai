import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';
import { resolve } from 'node:path';

// Load .env.test from repo root so SUPABASE_TEST_* vars are available.
dotenv.config({ path: resolve(__dirname, '../../.env.test') });

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['**/*.test.ts'],
    // DB tests use real network + real Postgres. Don't parallelize aggressively.
    poolOptions: { threads: { singleThread: true } },
    testTimeout: 15_000,
  },
});
