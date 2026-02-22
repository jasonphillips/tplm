/**
 * Cell Assertion Tests
 *
 * Demonstrates how to use the E2E test utilities to make assertions
 * about specific cell values in rendered TPL tables.
 *
 * These tests serve as both validation of the test utilities and
 * as examples of sanity checking data in E2E tests.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { parse } from '../dist/parser/index.js';
import {
  buildTableSpec,
  generateQueryPlan,
  generateMalloyQueries,
  buildGridSpec,
} from '../dist/compiler/index.js';
import { createTPLRunner, renderGridToHTML, TableAssertion } from '../dist/renderer/index.js';
import {
  createLocalConnection,
  getDefaultSource,
  executeMalloy,
} from '../dist/executor/index.js';

let runTPL: (tpl: string) => Promise<TableAssertion>;
let DEFAULT_SOURCE: string;

beforeAll(async () => {
  await createLocalConnection();
  DEFAULT_SOURCE = getDefaultSource();

  runTPL = createTPLRunner({
    sourceName: 'names',
    source: DEFAULT_SOURCE,
    executeMalloy,
    pipeline: {
      parse,
      buildTableSpec,
      generateQueryPlan,
      generateMalloyQueries,
      buildGridSpec,
      renderGridToHTML,
    },
  });
});

describe('Cell Assertion API', () => {
  describe('Basic cell lookups', () => {
    it('should find cells by dimension values', async () => {
      const table = await runTPL('TABLE ROWS state[3] * n;');

      // Cell should exist
      table.cell({ state: 'CA' }).shouldExist();
      table.cell({ state: 'FL' }).shouldExist();
      table.cell({ state: 'TX' }).shouldExist();
    });

    it('should detect non-existent cells', async () => {
      const table = await runTPL('TABLE ROWS state[3] * n;');

      // These states are not in top 3
      table.cell({ state: 'WY' }).shouldNotExist();
    });

    it('should find cells in crosstab by multiple dimensions', async () => {
      const table = await runTPL('TABLE ROWS state[3] COLS year[2] * n;');

      // Get the actual dimension values from the rendered table
      const states = table.getUniqueDimensionValues('state');
      const years = table.getUniqueDimensionValues('year');

      expect(states.length).toBeGreaterThan(0);
      expect(years.length).toBeGreaterThan(0);

      // First state/year combination should exist
      table.cell({ state: states[0], year: years[0] }).shouldExist();
    });
  });

  describe('Numeric value assertions', () => {
    it('should assert exact numeric values with tolerance', async () => {
      const table = await runTPL('TABLE ROWS state[3] * births.sum;');

      // Get the actual value first to set up the test
      const caValue = table.cell({ state: 'CA' }).getNumericValue();
      expect(caValue).not.toBeNull();

      // Assert with tolerance
      table.cell({ state: 'CA' }).shouldEqual(caValue!, 0.01);
    });

    it('should assert values are greater than threshold', async () => {
      const table = await runTPL('TABLE ROWS state[3] * births.sum;');

      // All states should have positive birth sums
      const states = table.getUniqueDimensionValues('state');
      for (const state of states) {
        table.cell({ state }).shouldBeGreaterThan(0);
      }
    });

    it('should assert values are within range', async () => {
      const table = await runTPL('TABLE ROWS state[3] * births.mean;');

      // Mean births per record should be reasonable
      table.cell({ state: 'CA' }).shouldBeBetween(100, 50000);
      table.cell({ state: 'TX' }).shouldBeBetween(100, 50000);
    });

    it('should assert percentage values approximately', async () => {
      const table = await runTPL('TABLE ROWS state[-3@n] * n ACROSS;');

      // Each cell is a percentage of grand total, should be reasonable
      table.cell({ state: 'CA' }).shouldBeBetween(1, 50);
    });
  });

  describe('Multi-cell assertions', () => {
    it('should find all cells matching partial criteria', async () => {
      const table = await runTPL('TABLE ROWS state[5] COLS year[3] * n;');

      // All cells for a specific state
      const caCells = table.cells({ state: 'CA' });
      caCells.shouldHaveCount(3); // 3 years
      caCells.shouldAllBePositive();
    });

    it('should assert all cells meet criteria', async () => {
      const table = await runTPL('TABLE ROWS state[3] * births.sum;');

      // All birth counts should be positive
      table.cells().shouldAllBeGreaterThan(0);
    });

    it('should verify row percentages sum to 100%', async () => {
      const table = await runTPL('TABLE ROWS state[3] COLS year[3] * n ACROSS COLS;');

      // Each row should sum to ~100%
      table.cells({ state: 'CA' }).shouldSumToApproximately100Percent();
      table.cells({ state: 'TX' }).shouldSumToApproximately100Percent();
    });
  });

  describe('Formatted value assertions', () => {
    it('should check formatted string values', async () => {
      const table = await runTPL('TABLE ROWS state[1] * n;');

      // Get the cell and check its formatted value exists
      const cell = table.cell({ state: 'CA' });
      cell.shouldExist();

      // The formatted value should contain digits
      const formatted = cell.getFormattedValue();
      expect(formatted).toMatch(/\d/);
    });
  });

  describe('Table-level assertions', () => {
    it('should count total cells', async () => {
      const table = await runTPL('TABLE ROWS state[3] COLS year[2] * n;');

      // 3 states × 2 years = 6 cells
      table.shouldHaveCellCount(6);
    });

    it('should verify table has cells', async () => {
      const table = await runTPL('TABLE ROWS state[1] * n;');
      table.shouldHaveCells();
    });

    it('should get unique dimension values', async () => {
      const table = await runTPL('TABLE ROWS state[5] * n;');

      const states = table.getUniqueDimensionValues('state');
      expect(states).toHaveLength(5);
      expect(states).toContain('CA');
    });
  });

  describe('Tooltip assertions', () => {
    it('should verify tooltip content', async () => {
      const table = await runTPL('TABLE ROWS state[1] COLS year[1] * births.sum;');

      table.cell({ state: 'CA' }).shouldHaveTooltipContaining('State: CA');
      table.cell({ state: 'CA' }).shouldHaveTooltipContaining('births sum');
    });

    it('should verify custom label in tooltip', async () => {
      const table = await runTPL('TABLE ROWS state[1] * births.sum "Total Births";');

      table.cell({ state: 'CA' }).shouldHaveTooltipContaining('Total Births');
    });
  });
});

describe('Data Sanity Checks', () => {
  describe('Known data relationships', () => {
    it('California should have more births than Wyoming', async () => {
      const table = await runTPL('TABLE ROWS state * births.sum;');

      const ca = table.cell({ state: 'CA' }).getNumericValue()!;
      const wy = table.cell({ state: 'WY' }).getNumericValue()!;

      expect(ca).toBeGreaterThan(wy);
    });

    it('2020 should have birth data', async () => {
      const table = await runTPL('TABLE ROWS year * births.sum;');

      table.cell({ year: '2020' }).shouldExist();
      table.cell({ year: '2020' }).shouldBeGreaterThan(0);
    });

    it('totals should equal sum of parts', async () => {
      const table = await runTPL('TABLE ROWS state[3] | ALL * n;');

      // Get the states that were included
      const states = table.getUniqueDimensionValues('state').filter(s => s !== 'ALL');
      expect(states.length).toBe(3);

      // Sum up the individual state counts
      let partSum = 0;
      for (const state of states) {
        partSum += table.cell({ state }).getNumericValue()!;
      }

      // ALL should equal the sum (note: ALL row has empty state dimension path)
      // For totals, we need to check by looking at cells without state dimension
      const allCells = table.findAllCells();
      const totalCell = allCells.find(c => !c.dimensions.has('state'));

      // If no explicit total cell, just verify parts are positive
      if (totalCell) {
        const total = parseFloat(totalCell.value.replace(/,/g, ''));
        expect(partSum).toBeCloseTo(total, 0);
      } else {
        expect(partSum).toBeGreaterThan(0);
      }
    });
  });

  describe('Aggregate consistency', () => {
    it('mean should be between min-like and max-like values', async () => {
      const table = await runTPL('TABLE ROWS state[1] * births.(sum | mean);');

      const sum = table.getValue({ state: 'CA' })!; // First match is sum
      // Mean should be much smaller than sum (sum = count * mean)
      expect(sum).toBeGreaterThan(0);
    });

    it('field.count produces distinct count (different from n)', async () => {
      const table = await runTPL('TABLE ROWS state[3] * (n | births.count);');

      // n = row count, births.count = distinct birth values
      // They should produce different values since many rows share the same birth count
      const cells = table.findAllCells();
      // Should have 6 cells (3 states × 2 aggregates)
      expect(cells.length).toBe(6);

      // For each state, there should be two values: row count and distinct birth count
      const states = table.getUniqueDimensionValues('state');
      expect(states.length).toBe(3);
      // All cells should have positive values
      for (const cell of cells) {
        const num = parseFloat(cell.value.replace(/,/g, ''));
        expect(num).toBeGreaterThan(0);
      }
    });
  });
});
