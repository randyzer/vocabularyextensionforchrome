import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  webServer: {
    command: 'node scripts/serve-fixtures.mjs',
    url: 'http://127.0.0.1:4173/article.html',
    reuseExistingServer: false,
  },
  use: {
    trace: 'retain-on-failure',
  },
  workers: 1,
});
