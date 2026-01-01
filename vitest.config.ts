import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: [
      '**/node_modules/**',
      '**/legacy/**',  // Legacy packages have their own outdated dependencies
      '**/dist/**',    // Compiled output, not source tests
    ],
  },
});
