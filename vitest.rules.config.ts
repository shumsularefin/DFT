import { defineConfig } from 'vitest/config';

// Rules tests only. They need the Firestore emulator: npm run test:rules
export default defineConfig({
  test: { include: ['tests/rules/**/*.test.ts'], environment: 'node', testTimeout: 30000 },
});
