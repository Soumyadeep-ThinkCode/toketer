import { defineConfig } from 'vitest/config';

/**
 * Vitest runs only the pure, host-independent logic (pricing math, attribution
 * mappers, currency formatting). Modules that import the `vscode` API are never
 * part of these tests, which keeps the unit suite fast and runnable in CI.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
