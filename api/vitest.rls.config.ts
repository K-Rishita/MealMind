import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/rls.test.ts'], testTimeout: 20000, hookTimeout: 30000 },
});
