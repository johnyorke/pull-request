import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/games/pull-request/',
  test: {
    include: ['src/test/**/*.test.ts'],
  },
});
