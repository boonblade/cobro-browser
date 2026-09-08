import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/e2e/**'],
    environmentMatchGlobs: [['test/overlay/**', 'jsdom']],
  },
});
