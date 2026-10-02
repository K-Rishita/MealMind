import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // RLS tests need a running Supabase; they run separately via `npm run test:rls`.
    exclude: ['**/node_modules/**', 'dist/**', 'test/rls.test.ts'],
  },
});
