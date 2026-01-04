/**
 * Percentile E2E Tests
 *
 * Tests percentile aggregations (p25, p50/median, p75, p90, p95, p99)
 * using the EasyTPL API with DuckDB.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { parse } from '../dist/parser/parser.js';
import { fromCSV, fromDuckDBTable } from '../dist/index.js';
import {
  findPercentileAggregations,
  findDimensions,
  generatePercentileSourceSQL,
  generatePercentileMalloySource,
  analyzeAndGeneratePercentileConfig,
} from '../dist/compiler/percentile-utils.js';
import * as path from 'path';

// Test data path
const TEST_DATA_PATH = path.join(process.cwd(), 'data/test_usa_names.csv');

describe('Percentile Utilities', () => {
  describe('findPercentileAggregations', () => {
    it('detects single percentile aggregation', () => {
      const stmt = parse('TABLE ROWS state * births.p50 COLS year;');
      const percentiles = findPercentileAggregations(stmt);

      expect(percentiles).toHaveLength(1);
      expect(percentiles[0].measure).toBe('births');
      expect(percentiles[0].method).toBe('p50');
      expect(percentiles[0].quantile).toBe(0.5);
      expect(percentiles[0].computedColumnName).toBe('__births_p50');
      expect(percentiles[0].measureName).toBe('births_p50');
    });

    it('detects median as p50 equivalent', () => {
      const stmt = parse('TABLE ROWS state * births.median COLS year;');
      const percentiles = findPercentileAggregations(stmt);

      expect(percentiles).toHaveLength(1);
      expect(percentiles[0].method).toBe('median');
      expect(percentiles[0].quantile).toBe(0.5);
    });

    it('detects multiple percentiles in multi-binding', () => {
      const stmt = parse('TABLE ROWS state * births.(p25 | p50 | p75) COLS year;');
      const percentiles = findPercentileAggregations(stmt);

      expect(percentiles).toHaveLength(3);
      const methods = percentiles.map(p => p.method);
      expect(methods).toContain('p25');
      expect(methods).toContain('p50');
      expect(methods).toContain('p75');
    });

    it('ignores non-percentile aggregations', () => {
      const stmt = parse('TABLE ROWS state * births.sum COLS year;');
      const percentiles = findPercentileAggregations(stmt);

      expect(percentiles).toHaveLength(0);
    });

    it('handles mixed percentile and non-percentile aggregations', () => {
      const stmt = parse('TABLE ROWS state * births.(sum | p50 | mean) COLS year;');
      const percentiles = findPercentileAggregations(stmt);

      // Only p50 should be detected as a percentile
      expect(percentiles).toHaveLength(1);
      expect(percentiles[0].method).toBe('p50');
    });
  });

  describe('findDimensions', () => {
    it('finds row dimensions', () => {
      const stmt = parse('TABLE ROWS state * births.p50;');
      const dims = findDimensions(stmt);

      expect(dims).toContain('state');
    });

    it('finds column dimensions', () => {
      const stmt = parse('TABLE ROWS state * births.p50 COLS year;');
      const dims = findDimensions(stmt);

      expect(dims).toContain('state');
      expect(dims).toContain('year');
    });

    it('finds multiple dimensions on each axis', () => {
      const stmt = parse('TABLE ROWS state * gender * births.p50 COLS year;');
      const dims = findDimensions(stmt);

      expect(dims).toContain('state');
      expect(dims).toContain('gender');
      expect(dims).toContain('year');
    });
  });

  describe('generatePercentileSourceSQL', () => {
    it('generates DuckDB SQL with window function', () => {
      const percentiles = [{
        measure: 'births',
        method: 'p50' as const,
        quantile: 0.5,
        computedColumnName: '__births_p50',
        measureName: 'births_p50',
      }];

      const sql = generatePercentileSourceSQL(
        'data/test.csv',
        percentiles,
        ['state', 'year'],
        'duckdb'
      );

      expect(sql).toContain('quantile_cont(births, 0.5)');
      expect(sql).toContain('PARTITION BY state, year');
      expect(sql).toContain('as __births_p50');
      expect(sql).toContain("FROM 'data/test.csv'");
    });

    it('generates BigQuery SQL with window function', () => {
      const percentiles = [{
        measure: 'income',
        method: 'p75' as const,
        quantile: 0.75,
        computedColumnName: '__income_p75',
        measureName: 'income_p75',
      }];

      const sql = generatePercentileSourceSQL(
        'project.dataset.table',
        percentiles,
        ['region'],
        'bigquery'
      );

      expect(sql).toContain('PERCENTILE_CONT(income, 0.75)');
      expect(sql).toContain('PARTITION BY region');
      expect(sql).toContain('as __income_p75');
      expect(sql).toContain('FROM `project.dataset.table`');
    });
  });

  describe('generatePercentileMalloySource', () => {
    it('generates Malloy source with derived SQL', () => {
      const percentiles = [{
        measure: 'births',
        method: 'p50' as const,
        quantile: 0.5,
        computedColumnName: '__births_p50',
        measureName: 'births_p50',
      }];

      const malloy = generatePercentileMalloySource(
        'data',
        "SELECT *, quantile_cont(births, 0.5) OVER () as __births_p50 FROM 'test.csv'",
        percentiles,
        'duckdb'
      );

      // The source just includes the SQL - no measure definitions
      // The computed columns are used directly in the transformed TPL
      expect(malloy).toContain('source: data is duckdb.sql(');
      expect(malloy).toContain('quantile_cont(births, 0.5)');
    });
  });

  describe('analyzeAndGeneratePercentileConfig', () => {
    it('returns hasPercentiles: false for non-percentile queries', () => {
      const stmt = parse('TABLE ROWS state * births.sum COLS year;');
      const config = analyzeAndGeneratePercentileConfig(
        stmt,
        'data/test.csv',
        'data',
        'duckdb',
        'TABLE ROWS state * births.sum COLS year;'
      );

      expect(config.hasPercentiles).toBe(false);
      expect(config.percentiles).toHaveLength(0);
    });

    it('returns full config for percentile queries', () => {
      const tpl = 'TABLE ROWS state * births.p50 COLS year;';
      const stmt = parse(tpl);
      const config = analyzeAndGeneratePercentileConfig(
        stmt,
        'data/test.csv',
        'data',
        'duckdb',
        tpl
      );

      expect(config.hasPercentiles).toBe(true);
      expect(config.percentiles).toHaveLength(1);
      expect(config.partitionColumns).toContain('state');
      expect(config.partitionColumns).toContain('year');
      expect(config.derivedSQL).toBeDefined();
      expect(config.derivedMalloySource).toBeDefined();
      expect(config.transformedTPL).toBeDefined();
      // TPL should be transformed to use computed column name with partition suffix and .min
      // The suffix is sorted dimension names (e.g., __births_p50__state_year)
      expect(config.transformedTPL).toContain('__births_p50__state_year.min');
      expect(config.transformedTPL).not.toContain('births.p50');
      // Should have partition levels info
      expect(config.partitionLevels).toBeDefined();
      expect(config.partitionLevels.length).toBeGreaterThan(0);
    });
  });
});

describe('Percentile E2E with DuckDB', () => {
  describe('Basic percentile queries', () => {
    it('executes p50 (median) query successfully', async () => {
      const tpl = fromCSV(TEST_DATA_PATH);
      const { html, grid } = await tpl.query('TABLE ROWS state[-3] * births.p50;');

      expect(html).toContain('<table');
      expect(grid).toBeDefined();
      // Should have some data (check row headers instead of rows property)
      expect(grid.rowHeaders).toBeDefined();
      expect(grid.rowHeaders!.length).toBeGreaterThan(0);
    });

    it('executes median query (alias for p50)', async () => {
      const tpl = fromCSV(TEST_DATA_PATH);
      const { html } = await tpl.query('TABLE ROWS state[-3] * births.median;');

      expect(html).toContain('<table');
    });

    it('executes p25 (first quartile) query', async () => {
      const tpl = fromCSV(TEST_DATA_PATH);
      const { html } = await tpl.query('TABLE ROWS state[-3] * births.p25;');

      expect(html).toContain('<table');
    });

    it('executes p75 (third quartile) query', async () => {
      const tpl = fromCSV(TEST_DATA_PATH);
      const { html } = await tpl.query('TABLE ROWS state[-3] * births.p75;');

      expect(html).toContain('<table');
    });
  });

  describe('Multiple percentiles', () => {
    it('executes IQR query (p25, p50, p75)', async () => {
      const tpl = fromCSV(TEST_DATA_PATH);
      const { html, grid } = await tpl.query(
        'TABLE ROWS state[-3] * births.(p25 | p50 | p75);'
      );

      expect(html).toContain('<table');
      // Should have columns for all three percentiles
      expect(grid).toBeDefined();
    });
  });

  describe('Percentiles with crosstab structure', () => {
    it('executes percentile with row and column dimensions', async () => {
      const tpl = fromCSV(TEST_DATA_PATH);
      const { html } = await tpl.query(
        'TABLE ROWS state[-3] * births.p50 COLS gender;'
      );

      expect(html).toContain('<table');
      // Should have F and M columns
      expect(html).toMatch(/[FM]/);
    });

    it('executes percentile with multiple row dimensions', async () => {
      const tpl = fromCSV(TEST_DATA_PATH);
      const { html } = await tpl.query(
        'TABLE ROWS state[-2] * gender * births.p50;'
      );

      expect(html).toContain('<table');
    });
  });

  describe('Mixed aggregations', () => {
    it('executes query with both percentile and regular aggregations', async () => {
      const tpl = fromCSV(TEST_DATA_PATH);
      const { html } = await tpl.query(
        'TABLE ROWS state[-3] * births.(sum | p50 | mean);'
      );

      expect(html).toContain('<table');
    });
  });

  describe('Percentiles with extend()', () => {
    it('extracts dimension mappings from extend text', () => {
      const tpl = fromCSV(TEST_DATA_PATH).extend(`
        dimension:
          sex is gender
          state_group is
            pick 'Large' when state = 'CA' or state = 'TX'
            pick 'Small' when state = 'VT' or state = 'WY'
            else 'Medium'
      `);

      const dimMap = tpl.getDimensionMap();
      // Simple alias: sqlExpression = rawColumn = 'gender'
      expect(dimMap.get('sex')?.rawColumn).toBe('gender');
      expect(dimMap.get('sex')?.sqlExpression).toBe('gender');
      // Pick expression: rawColumn = 'state', sqlExpression = CASE statement
      expect(dimMap.get('state_group')?.rawColumn).toBe('state');
      expect(dimMap.get('state_group')?.sqlExpression).toContain('CASE');
      expect(dimMap.get('state_group')?.sqlExpression).toContain("WHEN state = 'CA' OR state = 'TX' THEN 'Large'");
    });

    it('works with simple alias dimensions', async () => {
      // 'sex' is mapped to 'gender' - should partition by 'gender' in SQL
      const tpl = fromCSV(TEST_DATA_PATH).extend(`
        dimension:
          sex is gender
      `);

      const { html } = await tpl.query(
        'TABLE ROWS sex * births.p50;'
      );

      expect(html).toContain('<table');
      // Should have M and F values
      expect(html).toMatch(/[MF]/);
    });

    it('works with pick expression dimensions', async () => {
      // 'state_group' is mapped to 'state' - should partition by 'state' in SQL
      const tpl = fromCSV(TEST_DATA_PATH).extend(`
        dimension:
          state_group is
            pick 'Large' when state = 'CA' or state = 'TX'
            pick 'Small' when state = 'VT' or state = 'WY'
            else 'Medium'
      `);

      const { html } = await tpl.query(
        'TABLE ROWS state_group * births.p50;'
      );

      expect(html).toContain('<table');
      // Should have the computed group labels
      expect(html).toMatch(/Large|Small|Medium/);
    });

    // Complex computed dimensions (like floor(), math expressions) cannot be mapped
    it.skip('complex computed dimensions are not supported for percentile partitioning', async () => {
      const tpl = fromCSV(TEST_DATA_PATH).extend(`
        dimension:
          decade is floor(year / 10) * 10
      `);

      // This would not partition correctly because 'decade' can't be mapped to a single raw column
      const { html } = await tpl.query(
        'TABLE ROWS decade[-3] * births.p50;'
      );

      expect(html).toContain('<table');
    });

    it('works with extended model using raw column names', async () => {
      // Raw columns always work - no mapping needed
      const tpl = fromCSV(TEST_DATA_PATH);
      const { html } = await tpl.query(
        'TABLE ROWS year[-3] * births.p50;'
      );

      expect(html).toContain('<table');
    });
  });
});

describe('Percentile edge cases', () => {
  it('handles no dimensions (grand total percentile)', async () => {
    const tpl = fromCSV(TEST_DATA_PATH);
    // This tests percentile over the entire dataset
    const { html } = await tpl.query('TABLE ROWS births.p50;');

    expect(html).toContain('<table');
  });

  it('handles high percentiles (p90, p95, p99)', async () => {
    const tpl = fromCSV(TEST_DATA_PATH);
    const { html } = await tpl.query(
      'TABLE ROWS state[-3] * births.(p90 | p95 | p99);'
    );

    expect(html).toContain('<table');
  });
});

describe('Percentiles with ALL patterns', () => {
  it('correctly computes percentile for ALL column (COLS dim | ALL)', async () => {
    const tpl = fromCSV(TEST_DATA_PATH);
    const { html } = await tpl.query(
      'TABLE ROWS state[-3] * births.p50 COLS gender | ALL;'
    );

    expect(html).toContain('<table');
    // Should have Total column
    expect(html).toContain('Total');
    // The P50 in Total column should NOT be the min of gender P50s
    // It should be a value between the F and M values
  });

  it('correctly computes percentile for ALL row (ROWS dim | ALL)', async () => {
    const tpl = fromCSV(TEST_DATA_PATH);
    const { html } = await tpl.query(
      'TABLE ROWS (state[-3] | ALL "Total") * births.p50 COLS gender;'
    );

    expect(html).toContain('<table');
    // Should have Total row
    expect(html).toContain('Total');
  });

  it('handles multiple measures with ALL', async () => {
    const tpl = fromCSV(TEST_DATA_PATH);
    const { html } = await tpl.query(
      'TABLE ROWS state[-3] * births.(min | p50 | max) COLS gender | ALL;'
    );

    expect(html).toContain('<table');
    expect(html).toContain('Total');
    // Should have min, P50, and max labels
    expect(html).toContain('births min');
    expect(html).toContain('births P50');
    expect(html).toContain('births max');
  });

  it('handles nested ALL patterns', async () => {
    const tpl = fromCSV(TEST_DATA_PATH);
    const { html } = await tpl.query(
      'TABLE ROWS state[-2] * (gender | ALL) * births.p50;'
    );

    expect(html).toContain('<table');
  });
});

// BigQuery tests - require USE_LIVE_BIGQUERY=true environment variable
const USE_LIVE_BIGQUERY = process.env.USE_LIVE_BIGQUERY === 'true';
const BIGQUERY_TABLE = 'slite-development.tpl_test.test_usa_names';

describe.skipIf(!USE_LIVE_BIGQUERY)('Percentile E2E with BigQuery', () => {
  // Dynamic import of fromBigQueryTable since it requires credentials
  let fromBigQueryTable: typeof import('../dist/index.js').fromBigQueryTable;

  beforeAll(async () => {
    const module = await import('../dist/index.js');
    fromBigQueryTable = module.fromBigQueryTable;
  });

  describe('Basic percentile queries', () => {
    it('executes p50 (median) query successfully', async () => {
      const tpl = fromBigQueryTable({ table: BIGQUERY_TABLE });
      const { html, grid } = await tpl.query('TABLE ROWS state[-3] * births.p50;');

      expect(html).toContain('<table');
      expect(grid).toBeDefined();
      expect(grid.rowHeaders).toBeDefined();
      expect(grid.rowHeaders!.length).toBeGreaterThan(0);
    });

    it('executes median query (alias for p50)', async () => {
      const tpl = fromBigQueryTable({ table: BIGQUERY_TABLE });
      const { html } = await tpl.query('TABLE ROWS state[-3] * births.median;');

      expect(html).toContain('<table');
    });

    it('executes IQR query (p25, p50, p75)', async () => {
      const tpl = fromBigQueryTable({ table: BIGQUERY_TABLE });
      const { html, grid } = await tpl.query(
        'TABLE ROWS state[-3] * births.(p25 | p50 | p75);'
      );

      expect(html).toContain('<table');
      expect(grid).toBeDefined();
      // Should have labels with measure name
      expect(html).toMatch(/births P25|births P50|births P75/);
    });
  });

  describe('Percentiles with crosstab structure', () => {
    it('executes percentile with row and column dimensions', async () => {
      const tpl = fromBigQueryTable({ table: BIGQUERY_TABLE });
      const { html } = await tpl.query(
        'TABLE ROWS state[-3] * births.p50 COLS gender;'
      );

      expect(html).toContain('<table');
      // Should have F and M columns
      expect(html).toMatch(/[FM]/);
    });

    it('executes percentile with multiple row dimensions', async () => {
      const tpl = fromBigQueryTable({ table: BIGQUERY_TABLE });
      const { html } = await tpl.query(
        'TABLE ROWS state[-2] * gender * births.p50;'
      );

      expect(html).toContain('<table');
    });

    it('executes percentile with COLS dimension and multi-binding', async () => {
      const tpl = fromBigQueryTable({ table: BIGQUERY_TABLE });
      const { html, grid } = await tpl.query(
        'TABLE ROWS state[-3] COLS gender * births.(p25 | p50 | p75);'
      );

      expect(html).toContain('<table');
      // Should have 6 data columns (2 genders x 3 percentiles)
      expect(grid.colHeaders).toBeDefined();
    });
  });

  describe('Mixed aggregations', () => {
    it('executes query with both percentile and regular aggregations', async () => {
      const tpl = fromBigQueryTable({ table: BIGQUERY_TABLE });
      const { html } = await tpl.query(
        'TABLE ROWS state[-3] * births.(sum | p50 | mean);'
      );

      expect(html).toContain('<table');
      // Should have labels for all aggregations
      expect(html).toMatch(/births sum|births P50|births mean/);
    });
  });

  describe('Percentiles with WHERE clause', () => {
    it('applies WHERE filter to percentile computation', async () => {
      const tpl = fromBigQueryTable({ table: BIGQUERY_TABLE });
      const { html } = await tpl.query(
        "TABLE WHERE gender = 'M' ROWS state[-3] * births.p50;"
      );

      expect(html).toContain('<table');
      // Percentiles should be computed only over male records
    });
  });

  describe('High percentiles', () => {
    it('handles p90, p95, p99', async () => {
      const tpl = fromBigQueryTable({ table: BIGQUERY_TABLE });
      const { html } = await tpl.query(
        'TABLE ROWS state[-3] * births.(p90 | p95 | p99);'
      );

      expect(html).toContain('<table');
      expect(html).toMatch(/births P90|births P95|births P99/);
    });
  });
});
