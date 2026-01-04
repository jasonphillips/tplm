/**
 * E2E tests for percentage aggregate syntax
 *
 * Tests the full pipeline from TPL parsing through Malloy execution
 * using the (aggregate ACROSS scope) syntax.
 *
 * ACROSS variants:
 * - ACROSS (or ACROSS ALL): cell percentage of grand total
 * - ACROSS COLS: row percentage (each row sums to 100%)
 * - ACROSS ROWS: column percentage (each column sums to 100%)
 * - ACROSS dimension: percentage within that dimension grouping
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { parse } from '../dist/parser/index.js';
import {
  buildTableSpec,
  generateQueryPlan,
  generateMalloyQueries,
  buildGridSpec,
} from '../dist/compiler/index.js';
import { renderGridToHTML } from '../dist/renderer/index.js';
import {
  createLocalConnection,
  getDefaultSource,
  executeMalloy,
} from '../dist/executor/index.js';

// Initialize DuckDB connection once before all tests
let DEFAULT_SOURCE: string;

beforeAll(() => {
  createLocalConnection();
  DEFAULT_SOURCE = getDefaultSource();
});

/**
 * Helper function to run the full pipeline and return results
 */
async function runPipeline(tpl: string): Promise<{
  malloy: string;
  html: string;
}> {
  const ast = parse(tpl);
  const tableSpec = buildTableSpec(ast);
  const queryPlan = generateQueryPlan(tableSpec);
  const malloyQueries = generateMalloyQueries(queryPlan, 'names', {
    where: tableSpec.where,
    firstAxis: tableSpec.firstAxis,
  });

  // Get the Malloy query
  const malloy = malloyQueries.map(q => q.malloy).join('\n\n');

  // Execute all queries
  const queryResults = new Map<string, any[]>();
  for (const queryInfo of malloyQueries) {
    const fullMalloy = `${DEFAULT_SOURCE}\n${queryInfo.malloy}`;
    const data = await executeMalloy(fullMalloy);
    queryResults.set(queryInfo.id, data);
  }

  // Build GridSpec and render
  const gridSpec = buildGridSpec(tableSpec, queryPlan, queryResults, malloyQueries);
  const html = renderGridToHTML(gridSpec);

  return { malloy, html };
}

describe('Percentage Aggregate E2E', () => {

  describe('Cell percentage (ACROSS ALL)', () => {
    it('computes cell percentage of grand total', async () => {
      // Simple case with just one row dimension and aggregate
      const tpl = 'TABLE ROWS state[-3] * (births.sum ACROSS):percent;';

      const { html, malloy } = await runPipeline(tpl);

      // Malloy should contain the percentage expression
      expect(malloy).toContain('100.0 * births.sum() / all(births.sum())');

      // HTML should be generated with percentage values
      expect(html).toContain('<table');
      expect(html).toMatch(/<td[^>]*>/); // td with optional attributes
      expect(html).toMatch(/%/); // Should contain percentage values
    });

    it('count ACROSS produces cell percentages', async () => {
      const tpl = 'TABLE ROWS state[-3] * (count ACROSS);';

      const { malloy } = await runPipeline(tpl);

      expect(malloy).toContain('100.0 * count() / all(count())');
    });
  });

  describe('Row percentage (ACROSS COLS)', () => {
    it('computes row percentage - each row sums to 100%', async () => {
      const tpl = 'TABLE ROWS state[-3] * (births.sum ACROSS COLS) COLS gender;';

      const { malloy } = await runPipeline(tpl);

      // Should use flat query with all dimensions in group_by
      expect(malloy).toContain('group_by: state, gender');
      // Should keep row dimension (state) grouped for denominator
      expect(malloy).toContain('100.0 * births.sum() / all(births.sum(), state)');
    });
  });

  describe('Column percentage (ACROSS ROWS)', () => {
    it('computes column percentage - each column sums to 100%', async () => {
      const tpl = 'TABLE ROWS state[-3] * (births.sum ACROSS ROWS) COLS gender;';

      const { malloy } = await runPipeline(tpl);

      // Should use flat query with all dimensions in group_by
      expect(malloy).toContain('group_by: state, gender');
      // Should keep column dimension (gender) grouped for denominator
      expect(malloy).toContain('100.0 * births.sum() / all(births.sum(), gender)');
    });
  });

  describe('Percentage within dimension (ACROSS dim)', () => {
    it('computes percentage within specified dimension', async () => {
      const tpl = 'TABLE ROWS state[-3] * (births.sum ACROSS gender) COLS gender;';

      const { malloy } = await runPipeline(tpl);

      // Should use flat query with all dimensions in group_by
      expect(malloy).toContain('group_by: state, gender');
      // Should keep specified dimension grouped for denominator
      expect(malloy).toContain('100.0 * births.sum() / all(births.sum(), gender)');
    });
  });

  describe('Percentage with format and label', () => {
    it('applies format to cell percentage', async () => {
      const tpl = 'TABLE ROWS state[-3] * (births.sum ACROSS):comma.1 "% of Total";';

      const { malloy, html } = await runPipeline(tpl);

      // Should still compute percentage
      expect(malloy).toContain('all(births.sum())');

      // HTML should be generated
      expect(html).toContain('<table');
    });
  });

  describe('Mixed aggregates', () => {
    it('supports both regular and percentage aggregates', async () => {
      // This tests having both regular sum and percentage sum
      const tpl = 'TABLE ROWS state[-3] * (births.sum | (births.sum ACROSS));';

      const { malloy, html } = await runPipeline(tpl);

      // Should have both regular sum and percentage
      expect(malloy).toContain('births.sum()');
      expect(malloy).toContain('all(births.sum())');

      // HTML should be generated
      expect(html).toContain('<table');
    });
  });
});
