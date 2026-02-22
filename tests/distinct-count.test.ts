/**
 * Distinct Count Tests
 *
 * Tests that field-bound count (e.g., name.count) produces a distinct count
 * of field values, while standalone count/n produces a row count.
 *
 * In Malloy: count() = row count, count(field) = COUNT(DISTINCT field)
 * In TPL:    count/n  = row count, field.count  = distinct count
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../dist/parser/index.js';
import {
  buildTableSpec,
  generateQueryPlan,
  generateMalloyQueries,
} from '../dist/compiler/index.js';
import { fromCSV } from '../dist/index.js';
import * as path from 'path';

const TEST_DATA_PATH = path.join(process.cwd(), 'data/test_usa_names.csv');

// Test data: 175 rows, 7 names, 5 states, 2 genders, 5 years

describe('Distinct Count', () => {
  describe('Malloy generation', () => {
    it('standalone count generates count()', () => {
      const ast = parse('TABLE ROWS state * count;');
      const spec = buildTableSpec(ast);
      const plan = generateQueryPlan(spec);
      const queries = generateMalloyQueries(plan, 'data');

      expect(queries[0].malloy).toContain('count is count()');
    });

    it('field.count generates count(field) for distinct count', () => {
      const ast = parse('TABLE ROWS state * name.count;');
      const spec = buildTableSpec(ast);
      const plan = generateQueryPlan(spec);
      const queries = generateMalloyQueries(plan, 'data');

      expect(queries[0].malloy).toContain('name_count is count(name)');
    });

    it('n generates count() (standalone alias)', () => {
      const ast = parse('TABLE ROWS state * n;');
      const spec = buildTableSpec(ast);
      const plan = generateQueryPlan(spec);
      const queries = generateMalloyQueries(plan, 'data');

      expect(queries[0].malloy).toContain('count is count()');
    });

    it('field-bound count in multi-binding generates count(field)', () => {
      const ast = parse('TABLE ROWS state * name.(count | min);');
      const spec = buildTableSpec(ast);
      const plan = generateQueryPlan(spec);
      const queries = generateMalloyQueries(plan, 'data');

      expect(queries[0].malloy).toContain('name_count is count(name)');
      expect(queries[0].malloy).toContain('name_min is name.min()');
    });

    it('standalone count alongside field.count generates both forms', () => {
      const ast = parse('TABLE ROWS state * (n | name.count);');
      const spec = buildTableSpec(ast);
      const plan = generateQueryPlan(spec);
      const queries = generateMalloyQueries(plan, 'data');

      expect(queries[0].malloy).toContain('count is count()');
      expect(queries[0].malloy).toContain('name_count is count(name)');
    });
  });

  describe('E2E: distinct count values', () => {
    it('field.count returns distinct count, not row count', async () => {
      const tpl = fromCSV(TEST_DATA_PATH);

      // Compare row count vs distinct count per gender
      const { grid } = await tpl.query('TABLE ROWS gender * (n | name.count);');

      // For each gender, row count should be > distinct name count
      for (const header of grid.rowHeaders) {
        const genderVal = new Map([['gender', header.value]]);
        const rowCount = grid.getCell(genderVal, new Map(), '__pending___count');
        const distinctCount = grid.getCell(genderVal, new Map(), 'name_count');
        expect(rowCount.raw).toBeGreaterThan(distinctCount.raw!);
      }
    });

    it('distinct count by group has correct values', async () => {
      const tpl = fromCSV(TEST_DATA_PATH);
      const { grid } = await tpl.query('TABLE ROWS gender * name.count;');

      // Female: Ava, Emma, Isabella, Olivia, Sophia = 5
      // Male: Liam, Noah = 2
      const values = grid.rowHeaders.map(h => {
        const cell = grid.getCell(new Map([['gender', h.value]]), new Map(), 'name_count');
        return cell.raw;
      });
      expect(values.sort()).toEqual([2, 5]);
    });

    it('standalone count and field.count side by side', async () => {
      const tpl = fromCSV(TEST_DATA_PATH);
      const { grid, html } = await tpl.query('TABLE ROWS state * (n | name.count);');

      expect(html).toContain('<table');
      // Each state has 35 rows (175/5) and 7 distinct names
      for (const header of grid.rowHeaders) {
        const stateVal = new Map([['state', header.value]]);
        const rowCount = grid.getCell(stateVal, new Map(), '__pending___count');
        const distinctCount = grid.getCell(stateVal, new Map(), 'name_count');
        expect(rowCount.raw).toBe(35);
        expect(distinctCount.raw).toBe(7);
      }
    });

    it('field.count with COLS dimension', async () => {
      const tpl = fromCSV(TEST_DATA_PATH);
      const { html, grid } = await tpl.query('TABLE ROWS state * name.count COLS gender;');

      expect(html).toContain('<table');
      expect(grid.colHeaders).toBeDefined();
      // Should have F and M columns
      expect(html).toMatch(/[FM]/);
    });

    it('multiple field.count columns', async () => {
      const tpl = fromCSV(TEST_DATA_PATH);
      const { html, grid } = await tpl.query(
        'TABLE ROWS state * (name.count | year.count);'
      );

      expect(html).toContain('<table');
      // Each state should have 7 distinct names and 5 distinct years
      for (const header of grid.rowHeaders) {
        const stateVal = new Map([['state', header.value]]);
        const nameCount = grid.getCell(stateVal, new Map(), 'name_count');
        const yearCount = grid.getCell(stateVal, new Map(), 'year_count');
        expect(nameCount.raw).toBe(7);
        expect(yearCount.raw).toBe(5);
      }
    });
  });

  describe('Ordering by distinct count', () => {
    it('top-N by distinct count', async () => {
      const tpl = fromCSV(TEST_DATA_PATH);
      const { grid } = await tpl.query('TABLE ROWS state[-3@name.count] * name.count;');

      expect(grid.rowHeaders!.length).toBe(3);
    });

    it('ascending order by distinct count', async () => {
      const tpl = fromCSV(TEST_DATA_PATH);
      const { grid } = await tpl.query('TABLE ROWS state[3@name.count] * name.count;');

      expect(grid.rowHeaders!.length).toBe(3);
      const values = grid.rowHeaders.map(h => {
        const cell = grid.getCell(new Map([['state', h.value]]), new Map(), 'name_count');
        return cell.raw!;
      });
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
      }
    });

    it('order by distinct count, show other aggregates', async () => {
      const tpl = fromCSV(TEST_DATA_PATH);
      const { grid, html } = await tpl.query(
        'TABLE ROWS state[-3@name.count] * (name.count | births.sum);'
      );

      expect(grid.rowHeaders!.length).toBe(3);
      expect(html).toContain('<table');
    });

    it('descending sort by distinct count (no limit)', async () => {
      const tpl = fromCSV(TEST_DATA_PATH);
      const { grid } = await tpl.query('TABLE ROWS state DESC@name.count * name.count;');

      const values = grid.rowHeaders.map(h => {
        const cell = grid.getCell(new Map([['state', h.value]]), new Map(), 'name_count');
        return cell.raw!;
      });
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
      }
    });
  });

  describe('Grid labels', () => {
    it('standalone count labeled as N', async () => {
      const tpl = fromCSV(TEST_DATA_PATH);
      const { html } = await tpl.query('TABLE ROWS state * count;');

      expect(html).toMatch(/>N</);
    });

    it('field.count labeled as "field N"', async () => {
      const tpl = fromCSV(TEST_DATA_PATH);
      const { html } = await tpl.query('TABLE ROWS state * name.count;');

      expect(html).toContain('name N');
    });

    it('both standalone and field.count have distinct labels', async () => {
      const tpl = fromCSV(TEST_DATA_PATH);
      const { html } = await tpl.query('TABLE ROWS state * (n | name.count);');

      expect(html).toMatch(/>N</);
      expect(html).toContain('name N');
    });
  });

  describe('Distinct count with percentages', () => {
    it('(field.count ACROSS) produces percentage of distinct values', async () => {
      const tpl = fromCSV(TEST_DATA_PATH);
      const { html } = await tpl.query('TABLE ROWS gender * (name.count ACROSS);');

      expect(html).toContain('<table');
      // Female has 5/7 = 71.4%, Male has 2/7 = 28.6%
      expect(html).toContain('%');
    });
  });
});
