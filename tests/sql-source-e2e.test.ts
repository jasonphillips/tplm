/**
 * SQL Source E2E Tests
 *
 * Tests the fromDuckDBSQL() and fromConnectionSQL() APIs that allow querying
 * arbitrary SQL results (e.g., JOINs, CTEs) instead of just tables/files.
 */

import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { fromDuckDBSQL, fromCSV } from '../dist/index.js';
import {
  generatePercentileSourceSQL,
  generateMultiLevelPercentileSQL,
  sqlSource,
  tableSource,
} from '../dist/compiler/percentile-utils.js';
import * as path from 'path';

const NAMES_PATH = path.join(process.cwd(), 'data/test_usa_names.csv');
const METADATA_PATH = path.join(process.cwd(), 'data/state_metadata.csv');

// ---------------------------------------------------------------------------
// Unit tests: percentile SQL generation with SQL sources
// ---------------------------------------------------------------------------

describe('Percentile SQL generation with SQL sources', () => {
  it('generatePercentileSourceSQL wraps SQL as subquery', () => {
    const sql = generatePercentileSourceSQL(
      sqlSource('SELECT a.*, b.region FROM sales a JOIN regions b ON a.rid = b.id'),
      [
        {
          measure: 'revenue',
          method: 'p50' as const,
          quantile: 0.5,
          computedColumnName: '__revenue_p50',
          measureName: 'revenue_p50',
        },
      ],
      ['region'],
      'duckdb'
    );

    expect(sql).toContain('FROM (SELECT a.*, b.region FROM sales a JOIN regions b ON a.rid = b.id) _src');
    expect(sql).toContain('quantile_cont(revenue, 0.5)');
    expect(sql).toContain('PARTITION BY region');
  });

  it('generatePercentileSourceSQL with table source (backwards compat)', () => {
    const sql = generatePercentileSourceSQL(
      'data/test.csv',
      [
        {
          measure: 'births',
          method: 'p50' as const,
          quantile: 0.5,
          computedColumnName: '__births_p50',
          measureName: 'births_p50',
        },
      ],
      ['state'],
      'duckdb'
    );

    expect(sql).toContain("FROM 'data/test.csv'");
  });

  it('generatePercentileSourceSQL wraps SQL with BigQuery dialect', () => {
    const sql = generatePercentileSourceSQL(
      sqlSource('SELECT * FROM `project.dataset.table` WHERE id > 0'),
      [
        {
          measure: 'income',
          method: 'p75' as const,
          quantile: 0.75,
          computedColumnName: '__income_p75',
          measureName: 'income_p75',
        },
      ],
      ['region'],
      'bigquery'
    );

    expect(sql).toContain('FROM (SELECT * FROM `project.dataset.table` WHERE id > 0) _src');
    expect(sql).toContain('PERCENTILE_CONT(income, 0.75)');
  });

  it('generateMultiLevelPercentileSQL wraps SQL as subquery', () => {
    const sql = generateMultiLevelPercentileSQL(
      sqlSource('SELECT * FROM t1 JOIN t2 ON t1.id = t2.id'),
      [
        {
          measure: 'revenue',
          method: 'p50' as const,
          quantile: 0.5,
          computedColumnName: '__revenue_p50',
          measureName: 'revenue_p50',
        },
      ],
      [{ dimensions: ['region'], suffix: '__region' }],
      'duckdb'
    );

    expect(sql).toContain('FROM (SELECT * FROM t1 JOIN t2 ON t1.id = t2.id) _src');
  });

  it('generateMultiLevelPercentileSQL with WHERE clause on SQL source', () => {
    const sql = generateMultiLevelPercentileSQL(
      sqlSource('SELECT * FROM t1 JOIN t2 ON t1.id = t2.id'),
      [
        {
          measure: 'revenue',
          method: 'p50' as const,
          quantile: 0.5,
          computedColumnName: '__revenue_p50',
          measureName: 'revenue_p50',
        },
      ],
      [{ dimensions: ['region'], suffix: '__region' }],
      'duckdb',
      'region = \'West\''
    );

    expect(sql).toContain(') _src WHERE');
    expect(sql).toContain("region = 'West'");
  });
});

// ---------------------------------------------------------------------------
// Validation tests
// ---------------------------------------------------------------------------

describe('SQL validation', () => {
  it('throws on triple-quote in SQL', () => {
    expect(() => fromDuckDBSQL('SELECT """bad"""')).toThrow(/triple-quotes/);
  });
});

// ---------------------------------------------------------------------------
// E2E: fromDuckDBSQL with simple SQL
// ---------------------------------------------------------------------------

describe('fromDuckDBSQL - basic queries', () => {
  it('queries a simple SELECT from a CSV file', async () => {
    const tpl = fromDuckDBSQL(`SELECT * FROM '${NAMES_PATH}'`);
    const { html, grid } = await tpl.query('TABLE ROWS state[-3] * births.sum;');

    expect(html).toContain('<table');
    expect(grid.rowHeaders).toBeDefined();
    expect(grid.rowHeaders!.length).toBe(3);
  });

  it('queries a SQL source with computed columns', async () => {
    const tpl = fromDuckDBSQL(`
      SELECT *,
        CASE WHEN state IN ('CA','TX','NY','FL','PA') THEN 'Large'
             ELSE 'Small' END as state_size
      FROM '${NAMES_PATH}'
    `);
    const { html } = await tpl.query('TABLE ROWS state_size * births.sum;');

    expect(html).toContain('<table');
    expect(html).toContain('Large');
    expect(html).toContain('Small');
  });

  it('queries a SQL source with WHERE clause in TPL', async () => {
    const tpl = fromDuckDBSQL(`SELECT * FROM '${NAMES_PATH}'`);
    const { html } = await tpl.query(
      "TABLE WHERE gender = 'M' ROWS state[-3] * births.sum;"
    );

    expect(html).toContain('<table');
    expect(html).toContain('<td');  // Has data cells
  });

  it('queries SQL source with column pivots', async () => {
    const tpl = fromDuckDBSQL(`SELECT * FROM '${NAMES_PATH}'`);
    const { html } = await tpl.query(
      'TABLE ROWS state[-3] * births.sum COLS gender;'
    );

    expect(html).toContain('<table');
    expect(html).toMatch(/[FM]/);
  });
});

// ---------------------------------------------------------------------------
// E2E: fromDuckDBSQL with JOINs
// ---------------------------------------------------------------------------

describe('fromDuckDBSQL - JOIN queries', () => {
  it('queries a JOIN of two CSV files', async () => {
    const tpl = fromDuckDBSQL(`
      SELECT a.state, a.gender, a.births, a.name, a.year, b.region, b.population_rank
      FROM '${NAMES_PATH}' a
      INNER JOIN '${METADATA_PATH}' b ON a.state = b.state
    `);
    const { html, grid } = await tpl.query('TABLE ROWS region * births.sum;');

    expect(html).toContain('<table');
    // Should have the region values from the joined table
    expect(html).toMatch(/West|South|Northeast|Midwest/);
    expect(grid.rowHeaders).toBeDefined();
    expect(grid.rowHeaders!.length).toBeGreaterThan(0);
  });

  it('queries a JOIN with column pivot', async () => {
    const tpl = fromDuckDBSQL(`
      SELECT a.state, a.gender, a.births, a.name, a.year, b.region
      FROM '${NAMES_PATH}' a
      JOIN '${METADATA_PATH}' b ON a.state = b.state
    `);
    const { html } = await tpl.query(
      'TABLE ROWS region * births.sum COLS gender;'
    );

    expect(html).toContain('<table');
    expect(html).toMatch(/[FM]/);
    expect(html).toMatch(/West|South/);
  });

  it('queries a JOIN with limits and ordering', async () => {
    const tpl = fromDuckDBSQL(`
      SELECT a.state, a.gender, a.births, a.name, a.year, b.region
      FROM '${NAMES_PATH}' a
      JOIN '${METADATA_PATH}' b ON a.state = b.state
    `);
    const { html, grid } = await tpl.query(
      'TABLE ROWS region[-3@births.sum] * births.sum;'
    );

    expect(html).toContain('<table');
    expect(grid.rowHeaders!.length).toBe(3);
  });

  it('queries a JOIN with multiple aggregates', async () => {
    const tpl = fromDuckDBSQL(`
      SELECT a.state, a.gender, a.births, a.name, a.year, b.region, b.population_rank
      FROM '${NAMES_PATH}' a
      JOIN '${METADATA_PATH}' b ON a.state = b.state
    `);
    const { html } = await tpl.query(
      'TABLE ROWS region * births.(sum | mean);'
    );

    expect(html).toContain('<table');
    expect(html).toContain('births sum');
    expect(html).toContain('births mean');
  });

  it('queries a JOIN with ALL totals', async () => {
    const tpl = fromDuckDBSQL(`
      SELECT a.state, a.gender, a.births, b.region
      FROM '${NAMES_PATH}' a
      JOIN '${METADATA_PATH}' b ON a.state = b.state
    `);
    const { html } = await tpl.query(
      'TABLE ROWS region * births.sum COLS gender | ALL;'
    );

    expect(html).toContain('<table');
    expect(html).toContain('Total');
  });
});

// ---------------------------------------------------------------------------
// E2E: fromDuckDBSQL with extend()
// ---------------------------------------------------------------------------

describe('fromDuckDBSQL - extend()', () => {
  it('extends a SQL-backed source with computed dimensions', async () => {
    const tpl = fromDuckDBSQL(`
      SELECT a.state, a.gender, a.births, a.name, a.year, b.region
      FROM '${NAMES_PATH}' a
      JOIN '${METADATA_PATH}' b ON a.state = b.state
    `).extend(`
      dimension:
        sex is gender
    `);

    const { html } = await tpl.query('TABLE ROWS sex * births.sum;');

    expect(html).toContain('<table');
    expect(html).toMatch(/[FM]/);
  });

  it('preserves sourceSQL through extend()', () => {
    const sql = `SELECT * FROM '${NAMES_PATH}'`;
    const tpl = fromDuckDBSQL(sql);
    const extended = tpl.extend(`dimension: sex is gender`);

    expect(extended.getSourceSQL()).toBe(sql);
  });

  it('extend() model contains correct SQL source syntax', () => {
    const sql = `SELECT a.*, b.region FROM '${NAMES_PATH}' a JOIN '${METADATA_PATH}' b ON a.state = b.state`;
    const tpl = fromDuckDBSQL(sql);
    const extended = tpl.extend(`dimension: sex is gender`);

    const model = extended.getModel();
    expect(model).toContain('duckdb.sql("""');
    expect(model).toContain('extend {');
    expect(model).toContain('dimension:');
    expect(model).toContain('sex is gender');
  });

  it('extend() handles SQL with parentheses correctly', () => {
    // SQL with parentheses that would break the old regex
    const sql = `SELECT * FROM (SELECT state, births FROM '${NAMES_PATH}' WHERE births > 100) subq`;
    const tpl = fromDuckDBSQL(sql);
    const extended = tpl.extend(`dimension: doubled_births is births * 2`);

    const model = extended.getModel();
    expect(model).toContain('duckdb.sql("""');
    expect(model).toContain('""")');
    expect(model).toContain('extend {');
    expect(model).toContain('doubled_births');
  });

  it('extend() can chain multiple times on SQL source', () => {
    const tpl = fromDuckDBSQL(`SELECT * FROM '${NAMES_PATH}'`)
      .extend(`dimension: sex is gender`)
      .extend(`dimension: st is state`);

    const model = tpl.getModel();
    expect(model).toContain('sex is gender');
    expect(model).toContain('st is state');
    expect(tpl.getSourceSQL()).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// E2E: fromDuckDBSQL with percentiles
// ---------------------------------------------------------------------------

describe('fromDuckDBSQL - percentile queries', () => {
  it('computes percentiles on a SQL source', async () => {
    const tpl = fromDuckDBSQL(`SELECT * FROM '${NAMES_PATH}'`);
    const { html, grid } = await tpl.query('TABLE ROWS state[-3] * births.p50;');

    expect(html).toContain('<table');
    expect(grid.rowHeaders).toBeDefined();
    expect(grid.rowHeaders!.length).toBe(3);
  });

  it('computes multiple percentiles (IQR) on a SQL source', async () => {
    const tpl = fromDuckDBSQL(`SELECT * FROM '${NAMES_PATH}'`);
    const { html } = await tpl.query(
      'TABLE ROWS state[-3] * births.(p25 | p50 | p75);'
    );

    expect(html).toContain('<table');
    expect(html).toContain('births P25');
    expect(html).toContain('births P50');
    expect(html).toContain('births P75');
  });

  it('computes percentiles on a JOIN result', async () => {
    const tpl = fromDuckDBSQL(`
      SELECT a.state, a.gender, a.births, a.name, a.year, b.region
      FROM '${NAMES_PATH}' a
      JOIN '${METADATA_PATH}' b ON a.state = b.state
    `);
    const { html, grid } = await tpl.query('TABLE ROWS region * births.p50;');

    expect(html).toContain('<table');
    expect(html).toMatch(/West|South|Northeast|Midwest/);
    expect(grid.rowHeaders!.length).toBeGreaterThan(0);
  });

  it('computes percentiles on a JOIN with column pivot', async () => {
    const tpl = fromDuckDBSQL(`
      SELECT a.state, a.gender, a.births, b.region
      FROM '${NAMES_PATH}' a
      JOIN '${METADATA_PATH}' b ON a.state = b.state
    `);
    const { html } = await tpl.query(
      'TABLE ROWS region * births.p50 COLS gender;'
    );

    expect(html).toContain('<table');
    expect(html).toMatch(/[FM]/);
  });

  it('computes mixed aggregations with percentiles on SQL source', async () => {
    const tpl = fromDuckDBSQL(`SELECT * FROM '${NAMES_PATH}'`);
    const { html } = await tpl.query(
      'TABLE ROWS state[-3] * births.(sum | p50 | mean);'
    );

    expect(html).toContain('<table');
  });

  it('computes percentiles with ALL patterns on SQL source', async () => {
    const tpl = fromDuckDBSQL(`SELECT * FROM '${NAMES_PATH}'`);
    const { html } = await tpl.query(
      'TABLE ROWS state[-3] * births.p50 COLS gender | ALL;'
    );

    expect(html).toContain('<table');
    expect(html).toContain('Total');
  });

  it('computes percentiles on extended SQL source', async () => {
    const tpl = fromDuckDBSQL(`
      SELECT a.state, a.gender, a.births, a.name, a.year, b.region
      FROM '${NAMES_PATH}' a
      JOIN '${METADATA_PATH}' b ON a.state = b.state
    `).extend(`
      dimension: sex is gender
    `);

    const { html } = await tpl.query('TABLE ROWS sex * births.p50;');

    expect(html).toContain('<table');
    expect(html).toMatch(/[FM]/);
  });
});

// ---------------------------------------------------------------------------
// E2E: equivalence between table and SQL source
// ---------------------------------------------------------------------------

describe('SQL source equivalence with table source', () => {
  it('produces same results as fromCSV for a simple query', async () => {
    const csvTpl = fromCSV(NAMES_PATH);
    const sqlTpl = fromDuckDBSQL(`SELECT * FROM '${NAMES_PATH}'`);

    const csvResult = await csvTpl.query('TABLE ROWS state[-5] * births.sum;');
    const sqlResult = await sqlTpl.query('TABLE ROWS state[-5] * births.sum;');

    // Both should produce valid tables
    expect(csvResult.html).toContain('<table');
    expect(sqlResult.html).toContain('<table');

    // Row headers should be the same
    expect(sqlResult.grid.rowHeaders!.length).toBe(csvResult.grid.rowHeaders!.length);
  });

  it('produces same results for percentile queries', async () => {
    const csvTpl = fromCSV(NAMES_PATH);
    const sqlTpl = fromDuckDBSQL(`SELECT * FROM '${NAMES_PATH}'`);

    const csvResult = await csvTpl.query('TABLE ROWS state[-3] * births.p50;');
    const sqlResult = await sqlTpl.query('TABLE ROWS state[-3] * births.p50;');

    expect(csvResult.html).toContain('<table');
    expect(sqlResult.html).toContain('<table');
    expect(sqlResult.grid.rowHeaders!.length).toBe(csvResult.grid.rowHeaders!.length);
  });
});

// ---------------------------------------------------------------------------
// BigQuery conditional tests (run with USE_LIVE_BIGQUERY=true)
// ---------------------------------------------------------------------------

const USE_LIVE_BIGQUERY = process.env.USE_LIVE_BIGQUERY === 'true';
const BIGQUERY_TABLE = process.env.BIGQUERY_TEST_TABLE || 'bigquery-public-data.usa_names.usa_1910_current';

function loadBigQueryCredentials(): { projectId?: string } {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './config/dev-credentials.json';
  try {
    const creds = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(credentialsPath);
    }
    return { projectId: process.env.BIGQUERY_PROJECT_ID ?? creds.project_id };
  } catch {
    return { projectId: process.env.BIGQUERY_PROJECT_ID };
  }
}

describe.skipIf(!USE_LIVE_BIGQUERY)('fromConnectionSQL with BigQuery', () => {
  let fromConnectionSQL: typeof import('../dist/index.js').fromConnectionSQL;
  let BigQueryConnection: any;

  beforeAll(async () => {
    const module = await import('../dist/index.js');
    fromConnectionSQL = module.fromConnectionSQL;
    const bqModule = await import('@malloydata/db-bigquery');
    BigQueryConnection = bqModule.BigQueryConnection;
  });

  function makeBigQueryConnection() {
    const { projectId } = loadBigQueryCredentials();
    const config: Record<string, string> = {};
    if (projectId) config.projectId = projectId;
    return new BigQueryConnection('bigquery', {}, config);
  }

  it('queries a BigQuery SQL source', async () => {
    const connection = makeBigQueryConnection();
    const tpl = fromConnectionSQL({
      connection,
      sql: `SELECT state, gender, number as births, name, year FROM \`${BIGQUERY_TABLE}\``,
      dialect: 'bigquery',
    });
    const { html, grid } = await tpl.query('TABLE ROWS state[-3] * births.sum;');

    expect(html).toContain('<table');
    expect(grid.rowHeaders!.length).toBe(3);
  });

  it('queries a BigQuery SQL source with percentiles', async () => {
    const connection = makeBigQueryConnection();
    const tpl = fromConnectionSQL({
      connection,
      sql: `SELECT state, gender, number as births, name, year FROM \`${BIGQUERY_TABLE}\``,
      dialect: 'bigquery',
    });
    const { html } = await tpl.query('TABLE ROWS state[-3] * births.p50;');

    expect(html).toContain('<table');
  });
});
