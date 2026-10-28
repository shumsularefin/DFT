import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Only unit tests: the default pattern would also collect Playwright specs (tests/e2e)
// and the node:test guard tests (scripts/guard).
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'scripts/build/**/*.test.ts'],
    environment: 'node',
  },
});
