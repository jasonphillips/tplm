/**
 * Date Normalization Tests
 *
 * Tests that Date objects in query results are properly normalized to
 * formatted strings before header extraction and cell indexing.
 *
 * Malloy's toObject() returns JS Date objects for date/timestamp columns.
 * Without normalization, these cause:
 * - Verbose column headers (Date.toString() output)
 * - Failed Set-based deduplication (reference equality)
 * - Failed parent value matching (reference equality)
 * - Broken cell lookup (header keys vs cell index keys mismatch)
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../dist/parser/index.js';
import { buildTableSpec, generateQueryPlan, buildGridSpec } from '../dist/compiler/index.js';
import { renderGridToHTML } from '../dist/renderer/index.js';
import type { QueryResults } from '../dist/compiler/grid-spec-builder.js';

/**
 * Helper: collect all leaf header nodes (nodes with no children) from a header tree.
 */
function collectLeafHeaders(headers: any[]): any[] {
  const leaves: any[] = [];
  for (const h of headers) {
    if (h.children && h.children.length > 0) {
      leaves.push(...collectLeafHeaders(h.children));
    } else {
      leaves.push(h);
    }
  }
  return leaves;
}

describe('Date normalization in grid-spec-builder', () => {
  describe('Date objects as column dimension values', () => {
    it('normalizes date-only values to YYYY-MM-DD in column headers', () => {
      const ast = parse('TABLE ROWS state * revenue.sum COLS month;');
      const spec = buildTableSpec(ast);
      const plan = generateQueryPlan(spec);

      // Simulate Malloy results with Date objects (midnight UTC = date-only)
      const mockResults: QueryResults = new Map([
        ['q0', [
          {
            state: 'CA',
            by_month: [
              { month: new Date('2025-08-01T00:00:00.000Z'), revenue_sum: 1000 },
              { month: new Date('2025-09-01T00:00:00.000Z'), revenue_sum: 1100 },
            ],
          },
          {
            state: 'TX',
            by_month: [
              { month: new Date('2025-08-01T00:00:00.000Z'), revenue_sum: 900 },
              { month: new Date('2025-09-01T00:00:00.000Z'), revenue_sum: 950 },
            ],
          },
        ]],
      ]);

      const grid = buildGridSpec(spec, plan, mockResults);

      // Column headers should contain formatted date strings, not verbose Date.toString()
      const colLeaves = collectLeafHeaders(grid.colHeaders);
      const colValues = colLeaves.map((h) => h.value);

      expect(colValues).toContain('2025-08-01');
      expect(colValues).toContain('2025-09-01');

      // Should NOT contain verbose Date string fragments
      for (const val of colValues) {
        expect(val).not.toContain('GMT');
        expect(val).not.toContain('Coordinated Universal Time');
      }
    });

    it('normalizes timestamp values to YYYY-MM-DD HH:MM:SS in column headers', () => {
      const ast = parse('TABLE ROWS state * revenue.sum COLS event_time;');
      const spec = buildTableSpec(ast);
      const plan = generateQueryPlan(spec);

      // Simulate Malloy results with timestamps (non-midnight)
      const mockResults: QueryResults = new Map([
        ['q0', [
          {
            state: 'CA',
            by_event_time: [
              { event_time: new Date('2025-08-01T14:30:00.000Z'), revenue_sum: 500 },
              { event_time: new Date('2025-08-01T18:00:00.000Z'), revenue_sum: 600 },
            ],
          },
        ]],
      ]);

      const grid = buildGridSpec(spec, plan, mockResults);

      const colLeaves = collectLeafHeaders(grid.colHeaders);
      const colValues = colLeaves.map((h) => h.value);

      expect(colValues).toContain('2025-08-01 14:30:00');
      expect(colValues).toContain('2025-08-01 18:00:00');
    });

    it('deduplicates identical dates across rows', () => {
      const ast = parse('TABLE ROWS state * revenue.sum COLS month;');
      const spec = buildTableSpec(ast);
      const plan = generateQueryPlan(spec);

      // Two rows with the same date values (different Date object instances)
      const mockResults: QueryResults = new Map([
        ['q0', [
          {
            state: 'CA',
            by_month: [
              { month: new Date('2025-08-01T00:00:00.000Z'), revenue_sum: 1000 },
            ],
          },
          {
            state: 'TX',
            by_month: [
              { month: new Date('2025-08-01T00:00:00.000Z'), revenue_sum: 900 },
            ],
          },
        ]],
      ]);

      const grid = buildGridSpec(spec, plan, mockResults);

      // Should have exactly one column header for 2025-08-01 (deduplicated)
      const colLeaves = collectLeafHeaders(grid.colHeaders);
      const dateHeaders = colLeaves.filter((h) => h.value === '2025-08-01');
      expect(dateHeaders.length).toBe(1);
    });
  });

  describe('Date objects as row dimension values', () => {
    it('normalizes date-only values in row headers', () => {
      const ast = parse('TABLE ROWS month * revenue.sum;');
      const spec = buildTableSpec(ast);
      const plan = generateQueryPlan(spec);

      const mockResults: QueryResults = new Map([
        ['q0', [
          { month: new Date('2025-08-01T00:00:00.000Z'), revenue_sum: 1000 },
          { month: new Date('2025-09-01T00:00:00.000Z'), revenue_sum: 1100 },
        ]],
      ]);

      const grid = buildGridSpec(spec, plan, mockResults);

      const rowValues = grid.rowHeaders.map((h) => h.value);
      expect(rowValues).toContain('2025-08-01');
      expect(rowValues).toContain('2025-09-01');
    });
  });

  describe('Cell lookup with date dimensions', () => {
    it('cell lookup works when column dimension is a date', () => {
      const ast = parse('TABLE ROWS state * revenue.sum COLS month;');
      const spec = buildTableSpec(ast);
      const plan = generateQueryPlan(spec);

      const mockResults: QueryResults = new Map([
        ['q0', [
          {
            state: 'CA',
            by_month: [
              { month: new Date('2025-08-01T00:00:00.000Z'), revenue_sum: 1000 },
              { month: new Date('2025-09-01T00:00:00.000Z'), revenue_sum: 1100 },
            ],
          },
          {
            state: 'TX',
            by_month: [
              { month: new Date('2025-08-01T00:00:00.000Z'), revenue_sum: 900 },
              { month: new Date('2025-09-01T00:00:00.000Z'), revenue_sum: 950 },
            ],
          },
        ]],
      ]);

      const grid = buildGridSpec(spec, plan, mockResults);

      // Look up specific cells using normalized date strings
      const caAug = grid.getCell(
        new Map([['state', 'CA']]),
        new Map([['month', '2025-08-01']]),
        'revenue_sum',
      );
      expect(caAug.raw).toBe(1000);

      const txSep = grid.getCell(
        new Map([['state', 'TX']]),
        new Map([['month', '2025-09-01']]),
        'revenue_sum',
      );
      expect(txSep.raw).toBe(950);
    });

    it('cell lookup works when row dimension is a date', () => {
      const ast = parse('TABLE ROWS month * revenue.sum COLS state;');
      const spec = buildTableSpec(ast);
      const plan = generateQueryPlan(spec);

      const mockResults: QueryResults = new Map([
        ['q0', [
          {
            month: new Date('2025-08-01T00:00:00.000Z'),
            by_state: [
              { state: 'CA', revenue_sum: 1000 },
              { state: 'TX', revenue_sum: 900 },
            ],
          },
          {
            month: new Date('2025-09-01T00:00:00.000Z'),
            by_state: [
              { state: 'CA', revenue_sum: 1100 },
              { state: 'TX', revenue_sum: 950 },
            ],
          },
        ]],
      ]);

      const grid = buildGridSpec(spec, plan, mockResults);

      const augCA = grid.getCell(
        new Map([['month', '2025-08-01']]),
        new Map([['state', 'CA']]),
        'revenue_sum',
      );
      expect(augCA.raw).toBe(1000);

      const sepTX = grid.getCell(
        new Map([['month', '2025-09-01']]),
        new Map([['state', 'TX']]),
        'revenue_sum',
      );
      expect(sepTX.raw).toBe(950);
    });
  });

  describe('HTML rendering with date dimensions', () => {
    it('renders clean date strings in column headers', () => {
      const ast = parse('TABLE ROWS state * revenue.sum COLS month;');
      const spec = buildTableSpec(ast);
      const plan = generateQueryPlan(spec);

      const mockResults: QueryResults = new Map([
        ['q0', [
          {
            state: 'CA',
            by_month: [
              { month: new Date('2025-08-01T00:00:00.000Z'), revenue_sum: 1000 },
              { month: new Date('2025-09-01T00:00:00.000Z'), revenue_sum: 1100 },
            ],
          },
        ]],
      ]);

      const grid = buildGridSpec(spec, plan, mockResults);
      const html = renderGridToHTML(grid);

      // HTML should contain clean date strings
      expect(html).toContain('2025-08-01');
      expect(html).toContain('2025-09-01');

      // HTML should NOT contain verbose Date.toString() output
      expect(html).not.toContain('GMT');
      expect(html).not.toContain('Coordinated Universal Time');
    });

    it('renders non-empty cell values (not broken by key mismatch)', () => {
      const ast = parse('TABLE ROWS state * revenue.sum COLS month;');
      const spec = buildTableSpec(ast);
      const plan = generateQueryPlan(spec);

      const mockResults: QueryResults = new Map([
        ['q0', [
          {
            state: 'CA',
            by_month: [
              { month: new Date('2025-08-01T00:00:00.000Z'), revenue_sum: 1000 },
            ],
          },
        ]],
      ]);

      const grid = buildGridSpec(spec, plan, mockResults);
      const html = renderGridToHTML(grid);

      // The cell value should appear in the HTML (not empty due to lookup mismatch)
      expect(html).toContain('1,000');
    });
  });

  describe('Mixed date and non-date dimensions', () => {
    it('handles date columns alongside string row dimensions', () => {
      const ast = parse('TABLE ROWS state * gender * revenue.sum COLS month;');
      const spec = buildTableSpec(ast);
      const plan = generateQueryPlan(spec);

      const mockResults: QueryResults = new Map([
        ['q0', [
          {
            state: 'CA',
            by_gender: [
              {
                gender: 'M',
                by_month: [
                  { month: new Date('2025-08-01T00:00:00.000Z'), revenue_sum: 500 },
                ],
              },
              {
                gender: 'F',
                by_month: [
                  { month: new Date('2025-08-01T00:00:00.000Z'), revenue_sum: 600 },
                ],
              },
            ],
          },
        ]],
      ]);

      const grid = buildGridSpec(spec, plan, mockResults);

      // Column should be clean date
      const colLeaves = collectLeafHeaders(grid.colHeaders);
      expect(colLeaves[0].value).toBe('2025-08-01');

      // Cell lookup should work
      const cell = grid.getCell(
        new Map([['state', 'CA'], ['gender', 'M']]),
        new Map([['month', '2025-08-01']]),
        'revenue_sum',
      );
      expect(cell.raw).toBe(500);
    });
  });
});
