import { defineConfig } from '@playwright/test';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ts = new Date().toISOString().replace(/[:.]/g, '-');
const reportDir = join(homedir(), 'Documents', 'network-ai-debug', `browser-${ts}`);

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: join(reportDir, 'report.json') }]],
  outputDir: join(reportDir, 'output'),
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  timeout: 90_000,
  expect: { timeout: 30_000 },
});
