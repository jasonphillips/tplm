/**
 * End-to-End Tests for TPL Pipeline
 *
 * Tests the complete pipeline using DuckDB:
 *   TPL -> parse() -> AST -> buildTableSpec() -> TableSpec
 *       -> generateQueryPlan() -> QueryPlan
 *       -> generateMalloyQueries() -> Malloy
 *       -> executeMalloy() -> Results
 *       -> buildGridSpec() -> GridSpec
 *       -> renderGridToHTML() -> HTML
 *
 * Uses the new pipeline exclusively (no legacy compiler).
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

beforeAll(async () => {
  await createLocalConnection();
  DEFAULT_SOURCE = getDefaultSource();
});

/**
 * Helper function to run the full E2E pipeline
 */
async function runPipeline(tpl: string): Promise<{
  ast: ReturnType<typeof parse>;
  tableSpec: ReturnType<typeof buildTableSpec>;
  queryPlan: ReturnType<typeof generateQueryPlan>;
  malloyQueries: ReturnType<typeof generateMalloyQueries>;
  queryResults: Map<string, any[]>;
  gridSpec: ReturnType<typeof buildGridSpec>;
  html: string;
}> {
  // Parse TPL
  const ast = parse(tpl);

  // Build TableSpec
  const tableSpec = buildTableSpec(ast);

  // Generate QueryPlan
  const queryPlan = generateQueryPlan(tableSpec);

  // Generate Malloy queries
  const malloyQueries = generateMalloyQueries(queryPlan, 'names', { where: tableSpec.where });

  // Execute all queries
  const queryResults = new Map<string, any[]>();
  for (const queryInfo of malloyQueries) {
    const fullMalloy = `${DEFAULT_SOURCE}\n${queryInfo.malloy}`;
    const data = await executeMalloy(fullMalloy);
    queryResults.set(queryInfo.id, data);
  }

  // Build GridSpec
  const gridSpec = buildGridSpec(tableSpec, queryPlan, queryResults, malloyQueries);

  // Render to HTML
  const html = renderGridToHTML(gridSpec);

  return {
    ast,
    tableSpec,
    queryPlan,
    malloyQueries,
    queryResults,
    gridSpec,
    html,
  };
}

describe('E2E Pipeline Tests', () => {
  describe('1. Basic pivot table (ROWS dimension COLS dimension * aggregate)', () => {
    it('should render a basic pivot table with state rows and year columns', async () => {
      const tpl = 'TABLE ROWS state * births.sum COLS year;';
      const result = await runPipeline(tpl);

      // Verify parsing
      expect(result.ast.type).toBe('table');

      // Verify TableSpec structure
      expect(result.tableSpec.rowAxis).toBeDefined();
      expect(result.tableSpec.colAxis).toBeDefined();

      // Verify query generation
      expect(result.malloyQueries.length).toBeGreaterThan(0);
      // The query should reference state and year dimensions
      expect(result.malloyQueries[0].malloy).toContain('state');
      expect(result.malloyQueries[0].malloy).toContain('year');

      // Verify query execution returned data
      for (const [, data] of result.queryResults) {
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThan(0);
      }

      // Verify HTML output
      expect(result.html).toContain('<table');
      expect(result.html).toContain('</table>');
      // Should contain state values (from test data)
      expect(result.html).toMatch(/CA|TX|FL|VT|WY/);
      // Should contain numeric data values (formatted with commas)
      expect(result.html).toMatch(/\d{1,3}(,\d{3})*/);
    });

    it('should render basic pivot with gender and year', async () => {
      const tpl = 'TABLE ROWS gender * births.sum COLS year;';
      const result = await runPipeline(tpl);

      expect(result.html).toContain('<table');
      // Gender values
      expect(result.html).toMatch(/[MF]/);
      // Should contain numeric data values
      expect(result.html).toMatch(/\d{1,3}(,\d{3})*/);
    });
  });

  describe('2. Multiple row dimensions (ROWS dim1 * dim2 * aggregate COLS dim3)', () => {
    it('should render table with state and gender row dimensions', async () => {
      const tpl = 'TABLE ROWS state[-5] * gender * births.sum COLS year[-3];';
      const result = await runPipeline(tpl);

      // Verify query structure includes both dimensions
      const malloy = result.malloyQueries[0].malloy;
      expect(malloy).toContain('state');
      expect(malloy).toContain('gender');

      // Verify HTML contains expected dimensions
      expect(result.html).toContain('<table');
      // Should have state and gender values
      expect(result.html).toMatch(/CA|TX|FL|VT|WY/);
      expect(result.html).toMatch(/[MF]/);
    });

    it('should render table with name and state row dimensions', async () => {
      const tpl = 'TABLE ROWS name[-3] * state[-2] * births.sum COLS year[-2];';
      const result = await runPipeline(tpl);

      expect(result.html).toContain('<table');
      // Verify we have data rows
      const dataRowCount = (result.html.match(/<tr/g) || []).length;
      expect(dataRowCount).toBeGreaterThan(1); // At least header + 1 data row
    });
  });

  describe('3. Limits (ROWS state[-5] * births.sum COLS year[-3])', () => {
    it('should respect row and column limits', async () => {
      const tpl = 'TABLE ROWS state[-5] * births.sum COLS year[-3];';
      const result = await runPipeline(tpl);

      // Verify limits in generated Malloy
      const malloy = result.malloyQueries[0].malloy;
      expect(malloy).toContain('limit: 5');
      expect(malloy).toContain('limit: 3');

      // Verify order_by for descending (negative limit uses aggregate ordering)
      expect(malloy).toContain('order_by:');
      expect(malloy).toContain('desc');

      // Verify HTML output contains table with data
      expect(result.html).toContain('<table');
      expect(result.html).toMatch(/<tr/);
    });

    it('should respect limits with explicit ordering', async () => {
      const tpl = 'TABLE ROWS state[-5@births.sum] * births.sum COLS year[-3];';
      const result = await runPipeline(tpl);

      // Verify order by aggregate
      const malloy = result.malloyQueries[0].malloy;
      expect(malloy).toContain('order_by: births_sum desc');
      expect(malloy).toContain('limit: 5');
    });
  });

  describe('4. Row totals (ROWS state | ALL * aggregate COLS year)', () => {
    it('should generate row totals with ALL', async () => {
      const tpl = 'TABLE ROWS (state[-3] | ALL) * births.sum COLS year[-2];';
      const result = await runPipeline(tpl);

      // Row totals generate multiple queries (one for grouped, one for total)
      expect(result.malloyQueries.length).toBeGreaterThanOrEqual(1);

      // Verify HTML has table
      expect(result.html).toContain('<table');

      // Should have data including a total row
      expect(result.html).toContain('<tr');
    });

    it('should render row totals with custom label', async () => {
      const tpl = 'TABLE ROWS (state[-3] | ALL "Grand Total") * births.sum COLS year[-2];';
      const result = await runPipeline(tpl);

      expect(result.html).toContain('<table');
      // The label "Grand Total" should appear in the output
      expect(result.html).toContain('Grand Total');
    });
  });

  describe('5. Column totals (ROWS state COLS year | ALL)', () => {
    it('should generate column totals with ALL', async () => {
      const tpl = 'TABLE ROWS state[-3] * births.sum COLS year[-2] | ALL;';
      const result = await runPipeline(tpl);

      // Column totals also generate additional structure
      expect(result.malloyQueries.length).toBeGreaterThanOrEqual(1);

      // Verify HTML
      expect(result.html).toContain('<table');
      expect(result.html).toContain('<th');
    });

    it('should render column totals with custom label', async () => {
      const tpl = 'TABLE ROWS state[-3] * births.sum COLS year[-2] | ALL "Total";';
      const result = await runPipeline(tpl);

      expect(result.html).toContain('<table');
      // The label "Total" should appear in column headers
      expect(result.html).toContain('Total');
    });
  });

  describe('6. Sibling groups (ROWS (state | gender) * aggregate COLS year)', () => {
    it('should render sibling groups with different outer dimensions', async () => {
      const tpl = 'TABLE ROWS (state[-2] | gender) * births.sum COLS year[-2];';
      const result = await runPipeline(tpl);

      // Sibling groups generate multiple queries (one for each sibling)
      expect(result.malloyQueries.length).toBe(2);

      // First query should group by state
      expect(result.malloyQueries[0].malloy).toContain('group_by: state');

      // Second query should group by gender
      expect(result.malloyQueries[1].malloy).toContain('group_by: gender');

      // Verify HTML contains both dimension values
      expect(result.html).toContain('<table');
      // State values and gender values should both appear
      expect(result.html).toMatch(/CA|TX|FL|VT|WY/);
      expect(result.html).toMatch(/[MF]/);
    });

    it('should handle sibling groups with multiple aggregates', async () => {
      const tpl = 'TABLE ROWS (state[-2] | gender) * births.(sum | mean) COLS year[-2];';
      const result = await runPipeline(tpl);

      // Should have both aggregates
      const malloy = result.malloyQueries[0].malloy;
      expect(malloy).toContain('births_sum');
      expect(malloy).toContain('births_mean');

      expect(result.html).toContain('<table');
    });
  });

  describe('Additional E2E scenarios', () => {
    it('should handle FROM clause (source override)', async () => {
      // Note: FROM clause is parsed but we always use the default source for tests
      const tpl = 'TABLE FROM names ROWS state[-3] * births.sum COLS year[-2];';
      const result = await runPipeline(tpl);

      expect(result.ast.source).toBe('names');
      expect(result.html).toContain('<table');
    });

    it('should handle WHERE clause', async () => {
      // Use a non-reserved field in WHERE clause (gender is not a reserved word)
      const tpl = "TABLE FROM names WHERE gender = 'M' ROWS state[-3] * births.sum COLS year[-2];";
      const result = await runPipeline(tpl);

      expect(result.ast.where).toBeDefined();
      // WHERE clause should be in generated Malloy
      expect(result.malloyQueries[0].malloy).toContain('where:');
      expect(result.html).toContain('<table');
      // All results should be male (M)
      expect(result.html).not.toContain('>F<');
    });

    it('should handle multiple aggregates', async () => {
      const tpl = 'TABLE ROWS state[-3] * births.(sum | mean) COLS year[-2];';
      const result = await runPipeline(tpl);

      const malloy = result.malloyQueries[0].malloy;
      expect(malloy).toContain('births_sum is births.sum()');
      expect(malloy).toContain('births_mean is births.avg()');

      // Verify HTML contains aggregate labels as row headers (when rendered as row aggregates)
      expect(result.html).toContain('<table');
      // Check for both aggregate values exist (they become row headers)
      expect(result.html).toMatch(/births sum|births mean/i);
    });

    it('should handle rotated axis (COLS outer dimension)', async () => {
      const tpl = 'TABLE COLS state[-3] * births.sum ROWS year[-2];';
      const result = await runPipeline(tpl);

      expect(result.html).toContain('<table');
      // In rotated form, state should be in column headers
      expect(result.html).toMatch(/CA|TX|FL|VT|WY/);
    });

    it('should handle intermediate ALL (subtotals)', async () => {
      const tpl = 'TABLE ROWS state[-2] * (gender | ALL) * births.sum COLS year[-2];';
      const result = await runPipeline(tpl);

      // Intermediate ALL generates additional queries for subtotals
      expect(result.malloyQueries.length).toBeGreaterThanOrEqual(1);
      expect(result.html).toContain('<table');
    });

    it('should handle complex nested structure', async () => {
      const tpl = 'TABLE ROWS name[-2] * (gender | state[-2]) * births.sum COLS year[-2];';
      const result = await runPipeline(tpl);

      // Should have multiple queries for the sibling group
      expect(result.malloyQueries.length).toBe(2);
      expect(result.html).toContain('<table');
    });

    it('should handle labels on aggregates', async () => {
      const tpl = 'TABLE ROWS state[-3] * births.sum "Total Births" COLS year[-2];';
      const result = await runPipeline(tpl);

      expect(result.html).toContain('<table');
      // The aggregate label should be preserved in the TableSpec
      expect(result.tableSpec.aggregates[0]?.label).toBe('Total Births');
      // For a single aggregate with columns, the label doesn't create row headers
      // (that was a bug - ISSUE-010). The row headers should only show state values.
      expect(result.html).not.toContain('<th>Total Births</th>');
      // The grid renderer should include state values in output
      expect(result.html).toMatch(/CA|TX|FL|VT|WY/);
    });
  });

  describe('GridSpec cell lookup', () => {
    it('should support value-based cell lookup', async () => {
      const tpl = 'TABLE ROWS state[-3] * births.sum COLS year[-2];';
      const result = await runPipeline(tpl);

      // Get a sample state and year from the data
      const data = result.queryResults.get(result.malloyQueries[0].id);
      expect(data).toBeDefined();
      expect(data!.length).toBeGreaterThan(0);

      const firstRow = data![0];
      const state = firstRow.state;

      // Try to get a cell using the GridSpec lookup
      if (firstRow.by_year && firstRow.by_year.length > 0) {
        const year = firstRow.by_year[0].year;
        const rowValues = new Map([['state', state]]);
        const colValues = new Map([['year', year]]);

        const cell = result.gridSpec.getCell(rowValues, colValues, 'births_sum');
        expect(cell).toBeDefined();
        expect(cell.raw).toBeDefined();
      }
    });
  });

  describe('HTML structure validation', () => {
    it('should generate valid HTML table structure', async () => {
      const tpl = 'TABLE ROWS state[-3] * births.sum COLS year[-2];';
      const result = await runPipeline(tpl);

      // Basic HTML structure checks
      expect(result.html).toContain('<table');
      expect(result.html).toContain('</table>');
      expect(result.html).toContain('<thead>');
      expect(result.html).toContain('</thead>');
      expect(result.html).toContain('<tbody>');
      expect(result.html).toContain('</tbody>');
      expect(result.html).toContain('<tr>');
      expect(result.html).toContain('</tr>');
      expect(result.html).toContain('<th');
      expect(result.html).toContain('<td');

      // No broken colspan values
      expect(result.html).not.toContain('colspan="0"');
      expect(result.html).not.toContain('rowspan="0"');
    });

    it('should render cells with values', async () => {
      const tpl = 'TABLE ROWS state[-3] * births.sum COLS year[-2];';
      const result = await runPipeline(tpl);

      // Data cells should contain numeric values (with optional attributes)
      expect(result.html).toMatch(/<td[^>]*>[^<]*\d+[^<]*<\/td>/);
    });
  });
});
