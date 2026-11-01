import { defineConfig } from '@playwright/test';
import { FIXTURE_ORIGIN, MOCK_ORIGIN } from './configuration/extension.config';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: MOCK_ORIGIN,
    // Use the installed Chrome instead of downloading a Playwright browser runtime.
    channel: 'chrome',
    trace: 'retain-on-failure',
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  webServer: [
    {
      command: 'npm --prefix ../mock-website run dev -- --port 5173 --strictPort',
      url: MOCK_ORIGIN,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'node fixtures/server.mjs',
      url: `${FIXTURE_ORIGIN}/site-plain/`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
