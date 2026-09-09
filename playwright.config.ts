import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'test/e2e',
  timeout: 30_000,
  use: { headless: true, locale: 'ko-KR' },
  webServer: {
    command: 'node test/fixtures/serve.mjs',
    port: 4173,
    reuseExistingServer: true,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' }, testMatch: /overlay\.spec\.ts/ },
  ],
});
