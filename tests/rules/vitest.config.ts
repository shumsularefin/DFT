import { defineConfig } from 'vitest/config';

// Rules tests run against the Firestore emulator only (npm run test:rules).
export default defineConfig({
  test: { include: ['tests/rules/**/*.test.ts'], environment: 'node', testTimeout: 20_000 },
});
