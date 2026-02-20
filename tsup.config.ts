import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['packages/index.ts'],
  format: ['cjs'],
  dts: false,
  shims: true,
  splitting: false,
  external: [
    '@malloydata/malloy',
    '@malloydata/db-duckdb',
    '@malloydata/db-bigquery',
    'chevrotain',
  ],
  outDir: 'dist',
});
