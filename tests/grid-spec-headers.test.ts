/**
 * Grid Spec Header Tests
 *
 * Tests for header level generation, including:
 * - Custom labels on dimensions without siblings
 * - Empty labels (suppressLabel) suppressing header levels
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../dist/parser/index.js';
import { buildTableSpec, generateQueryPlan, buildGridSpec } from '../dist/compiler/index.js';
import type { QueryResults } from '../dist/compiler/grid-spec-builder.js';

describe('Grid Spec Header Building', () => {
  describe('Custom labels on dimensions without siblings', () => {
    it('creates sibling-label header for dimension with custom label (no siblings)', () => {
      const ast = parse('TABLE ROWS state * births.sum COLS year "Year";');
      const spec = buildTableSpec(ast);
      const plan = generateQueryPlan(spec);

      // Mock results - nest key uses dimension name (by_year), but data key uses label (Year)
      const mockResults: QueryResults = new Map([
        ['q0', [
          { state: 'CA', by_year: [{ Year: 2020, births_sum: 1000 }, { Year: 2021, births_sum: 1100 }] },
          { state: 'TX', by_year: [{ Year: 2020, births_sum: 900 }, { Year: 2021, births_sum: 950 }] }
        ]]
      ]);

      const grid = buildGridSpec(spec, plan, mockResults);

      // Should have a sibling-label header for the column axis
      expect(grid.colHeaders.length).toBe(1);
      expect(grid.colHeaders[0].type).toBe('sibling-label');
      expect(grid.colHeaders[0].value).toBe('Year');
      expect(grid.colHeaders[0].label).toBe('Year');

      // Should have children (dimension values) nested under the sibling-label
      expect(grid.colHeaders[0].children).toBeDefined();
      expect(grid.colHeaders[0].children!.length).toBe(2);
      expect(grid.colHeaders[0].children![0].type).toBe('dimension');
    });

    it('creates sibling-label header for row dimension with custom label (no siblings)', () => {
      const ast = parse('TABLE ROWS state "State" * births.sum COLS year;');
      const spec = buildTableSpec(ast);
      const plan = generateQueryPlan(spec);

      const mockResults: QueryResults = new Map([
        ['q0', [
          { State: 'CA', by_year: [{ year: 2020, births_sum: 1000 }] },
          { State: 'TX', by_year: [{ year: 2020, births_sum: 900 }] }
        ]]
      ]);

      const grid = buildGridSpec(spec, plan, mockResults);

      // Should have a sibling-label header for the row axis
      expect(grid.rowHeaders.length).toBe(1);
      expect(grid.rowHeaders[0].type).toBe('sibling-label');
      expect(grid.rowHeaders[0].value).toBe('State');
      expect(grid.rowHeaders[0].label).toBe('State');
    });

    it('does NOT create extra header level for dimension without custom label', () => {
      const ast = parse('TABLE ROWS state * births.sum COLS year;');
      const spec = buildTableSpec(ast);
      const plan = generateQueryPlan(spec);

      const mockResults: QueryResults = new Map([
        ['q0', [
          { state: 'CA', by_year: [{ year: 2020, births_sum: 1000 }] },
          { state: 'TX', by_year: [{ year: 2020, births_sum: 900 }] }
        ]]
      ]);

      const grid = buildGridSpec(spec, plan, mockResults);

      // Column headers should be dimension values directly (no sibling-label wrapper)
      expect(grid.colHeaders.length).toBe(1);
      expect(grid.colHeaders[0].type).toBe('dimension');
      expect(grid.colHeaders[0].value).toBe('2020');
    });
  });

  describe('Empty label suppresses header level', () => {
    it('suppresses sibling-label when label is empty string', () => {
      const ast = parse('TABLE ROWS (state "" | ALL) * births.sum COLS year;');
      const spec = buildTableSpec(ast);
      const plan = generateQueryPlan(spec);

      const mockResults: QueryResults = new Map([
        ['q0', [
          { state: 'CA', by_year: [{ year: 2020, births_sum: 1000 }] },
          { state: 'TX', by_year: [{ year: 2020, births_sum: 900 }] }
        ]],
        ['q1', [
          { by_year: [{ year: 2020, births_sum: 1900 }] }
        ]]
      ]);

      const grid = buildGridSpec(spec, plan, mockResults);

      // Row headers should NOT have an empty sibling-label
      const emptySiblingLabels = grid.rowHeaders.filter(
        h => h.type === 'sibling-label' && h.value === ''
      );
      expect(emptySiblingLabels.length).toBe(0);

      // State dimension values should appear directly
      const stateHeaders = grid.rowHeaders.filter(
        h => h.type === 'dimension' && h.dimension === 'state'
      );
      expect(stateHeaders.length).toBeGreaterThan(0);
    });

    it('still shows sibling-label for non-empty labels in same group', () => {
      const ast = parse('TABLE ROWS (state "" | gender "Gender") * births.sum COLS year;');
      const spec = buildTableSpec(ast);
      const plan = generateQueryPlan(spec);

      const mockResults: QueryResults = new Map([
        ['q0', [
          { state: 'CA', by_year: [{ year: 2020, births_sum: 1000 }] },
        ]],
        ['q1', [
          { Gender: 'F', by_year: [{ year: 2020, births_sum: 500 }] },
          { Gender: 'M', by_year: [{ year: 2020, births_sum: 500 }] }
        ]]
      ]);

      const grid = buildGridSpec(spec, plan, mockResults);

      // Should have sibling-label for "Gender" but not for empty state label
      const genderLabel = grid.rowHeaders.find(
        h => h.type === 'sibling-label' && h.value === 'Gender'
      );
      expect(genderLabel).toBeDefined();

      // Should NOT have empty sibling-label for state
      const emptyLabels = grid.rowHeaders.filter(
        h => h.type === 'sibling-label' && h.value === ''
      );
      expect(emptyLabels.length).toBe(0);
    });
  });

  describe('Labels in sibling contexts (with | operator)', () => {
    it('creates sibling-label headers for dimension siblings with labels', () => {
      const ast = parse('TABLE ROWS (state "State" | gender "Gender") * births.sum COLS year;');
      const spec = buildTableSpec(ast);
      const plan = generateQueryPlan(spec);

      const mockResults: QueryResults = new Map([
        ['q0', [
          { State: 'CA', by_year: [{ year: 2020, births_sum: 1000 }] },
        ]],
        ['q1', [
          { Gender: 'F', by_year: [{ year: 2020, births_sum: 500 }] },
        ]]
      ]);

      const grid = buildGridSpec(spec, plan, mockResults);

      // Should have sibling-labels for both dimensions
      const stateLabel = grid.rowHeaders.find(
        h => h.type === 'sibling-label' && h.value === 'State'
      );
      const genderLabel = grid.rowHeaders.find(
        h => h.type === 'sibling-label' && h.value === 'Gender'
      );

      expect(stateLabel).toBeDefined();
      expect(genderLabel).toBeDefined();
    });

    it('uses dimension name as default sibling-label when no label provided', () => {
      const ast = parse('TABLE ROWS (state | gender) * births.sum COLS year;');
      const spec = buildTableSpec(ast);
      const plan = generateQueryPlan(spec);

      const mockResults: QueryResults = new Map([
        ['q0', [
          { state: 'CA', by_year: [{ year: 2020, births_sum: 1000 }] },
        ]],
        ['q1', [
          { gender: 'F', by_year: [{ year: 2020, births_sum: 500 }] },
        ]]
      ]);

      const grid = buildGridSpec(spec, plan, mockResults);

      // Should have sibling-labels with dimension names as values
      const stateLabel = grid.rowHeaders.find(
        h => h.type === 'sibling-label' && h.value === 'state'
      );
      const genderLabel = grid.rowHeaders.find(
        h => h.type === 'sibling-label' && h.value === 'gender'
      );

      expect(stateLabel).toBeDefined();
      expect(genderLabel).toBeDefined();
    });
  });

  describe('Header depths', () => {
    it('places sibling-label at correct depth with dimension values nested below', () => {
      const ast = parse('TABLE ROWS state * births.sum COLS year "Year";');
      const spec = buildTableSpec(ast);
      const plan = generateQueryPlan(spec);

      const mockResults: QueryResults = new Map([
        ['q0', [
          { state: 'CA', by_year: [{ Year: 2020, births_sum: 1000 }, { Year: 2021, births_sum: 1100 }] },
        ]]
      ]);

      const grid = buildGridSpec(spec, plan, mockResults);

      // Sibling-label should be at depth 0
      const siblingLabel = grid.colHeaders[0];
      expect(siblingLabel.type).toBe('sibling-label');
      expect(siblingLabel.depth).toBe(0);

      // Dimension values should be at depth 1 (when children exist)
      if (siblingLabel.children && siblingLabel.children.length > 0) {
        for (const child of siblingLabel.children) {
          expect(child.type).toBe('dimension');
          expect(child.depth).toBe(1);
        }
      }
    });

    it('suppressed label does not add extra depth', () => {
      const ast = parse('TABLE ROWS (state "" | ALL) * births.sum COLS year;');
      const spec = buildTableSpec(ast);
      const plan = generateQueryPlan(spec);

      const mockResults: QueryResults = new Map([
        ['q0', [
          { state: 'CA', by_year: [{ year: 2020, births_sum: 1000 }] },
        ]],
        ['q1', [
          { by_year: [{ year: 2020, births_sum: 1000 }] }
        ]]
      ]);

      const grid = buildGridSpec(spec, plan, mockResults);

      // State dimension headers should be at depth 0 (not wrapped in sibling-label)
      const stateHeaders = grid.rowHeaders.filter(
        h => h.type === 'dimension' && h.dimension === 'state'
      );

      for (const header of stateHeaders) {
        expect(header.depth).toBe(0);
      }
    });
  });

  describe('OPTIONS rowHeaders:above (corner-style row headers)', () => {
    it('parses OPTIONS rowHeaders:above syntax', () => {
      const ast = parse('TABLE OPTIONS rowHeaders:above ROWS state * births.sum;');
      expect(ast.options.rowHeaders).toBe('above');
    });

    it('parses OPTIONS rowHeaders:left syntax', () => {
      const ast = parse('TABLE OPTIONS rowHeaders:left ROWS state * births.sum;');
      expect(ast.options.rowHeaders).toBe('left');
    });

    it('defaults to empty options when OPTIONS not specified', () => {
      const ast = parse('TABLE ROWS state * births.sum;');
      expect(ast.options).toEqual({});
    });

    it('sets useCornerRowHeaders=true when option is above and no siblings at root', () => {
      const ast = parse('TABLE OPTIONS rowHeaders:above ROWS state "State" * gender "Gender" * births.sum COLS year;');
      const spec = buildTableSpec(ast);
      const plan = generateQueryPlan(spec);

      const mockResults: QueryResults = new Map([
        ['q0', [
          { State: 'CA', by_gender: [
            { Gender: 'F', by_year: [{ year: 2020, births_sum: 500 }] },
            { Gender: 'M', by_year: [{ year: 2020, births_sum: 600 }] }
          ]}
        ]]
      ]);

      const grid = buildGridSpec(spec, plan, mockResults);

      expect(grid.useCornerRowHeaders).toBe(true);
      expect(grid.cornerRowLabels).toBeDefined();
      expect(grid.cornerRowLabels!.length).toBe(2);
      expect(grid.cornerRowLabels![0]).toEqual({ dimension: 'state', label: 'State' });
      expect(grid.cornerRowLabels![1]).toEqual({ dimension: 'gender', label: 'Gender' });
    });

    it('sets useCornerRowHeaders=false when option is left', () => {
      const ast = parse('TABLE OPTIONS rowHeaders:left ROWS state "State" * births.sum COLS year;');
      const spec = buildTableSpec(ast);
      const plan = generateQueryPlan(spec);

      const mockResults: QueryResults = new Map([
        ['q0', [
          { State: 'CA', by_year: [{ year: 2020, births_sum: 1000 }] }
        ]]
      ]);

      const grid = buildGridSpec(spec, plan, mockResults);

      expect(grid.useCornerRowHeaders).toBe(false);
      expect(grid.cornerRowLabels).toBeUndefined();
    });

    it('falls back to useCornerRowHeaders=false when siblings at root (silent fallback)', () => {
      const ast = parse('TABLE OPTIONS rowHeaders:above ROWS (state | region) * births.sum COLS year;');
      const spec = buildTableSpec(ast);
      const plan = generateQueryPlan(spec);

      const mockResults: QueryResults = new Map([
        ['q0', [
          { state: 'CA', by_year: [{ year: 2020, births_sum: 1000 }] }
        ]],
        ['q1', [
          { region: 'West', by_year: [{ year: 2020, births_sum: 2000 }] }
        ]]
      ]);

      const grid = buildGridSpec(spec, plan, mockResults);

      // Should fall back to left-style even though above was requested
      expect(grid.useCornerRowHeaders).toBe(false);
      expect(grid.options.rowHeaders).toBe('above'); // Option is preserved
    });

    it('falls back to useCornerRowHeaders=false when siblings deeper in tree (not at root)', () => {
      // Regression test: siblings can exist at any level, not just root
      const ast = parse('TABLE OPTIONS rowHeaders:above ROWS employment * (marital_status | gender) * births.sum COLS year;');
      const spec = buildTableSpec(ast);
      const plan = generateQueryPlan(spec);

      const mockResults: QueryResults = new Map([
        ['q0', [
          { employment: 'Employed', by_marital_status: [
            { marital_status: 'Married', by_year: [{ year: 2020, births_sum: 1000 }] }
          ]}
        ]],
        ['q1', [
          { employment: 'Employed', by_gender: [
            { gender: 'F', by_year: [{ year: 2020, births_sum: 500 }] }
          ]}
        ]]
      ]);

      const grid = buildGridSpec(spec, plan, mockResults);

      // Should fall back to left-style because siblings exist (even though not at root)
      expect(grid.useCornerRowHeaders).toBe(false);
      expect(grid.options.rowHeaders).toBe('above'); // Option is preserved
    });

    it('uses dimension name as label when no custom label provided', () => {
      const ast = parse('TABLE OPTIONS rowHeaders:above ROWS state * births.sum;');
      const spec = buildTableSpec(ast);
      const plan = generateQueryPlan(spec);

      const mockResults: QueryResults = new Map([
        ['q0', [
          { state: 'CA', births_sum: 1000 }
        ]]
      ]);

      const grid = buildGridSpec(spec, plan, mockResults);

      expect(grid.useCornerRowHeaders).toBe(true);
      expect(grid.cornerRowLabels![0]).toEqual({ dimension: 'state', label: 'state' });
    });

    it('OPTIONS works with FROM and WHERE clauses', () => {
      const ast = parse('TABLE OPTIONS rowHeaders:above FROM mydata WHERE year > 2000 ROWS state * births.sum;');
      expect(ast.options.rowHeaders).toBe('above');
      expect(ast.source).toBe('mydata');
      expect(ast.where).toBe('year > 2000');
    });

    it('OPTIONS works with COLS before ROWS', () => {
      const ast = parse('TABLE OPTIONS rowHeaders:above COLS year ROWS state * births.sum;');
      expect(ast.options.rowHeaders).toBe('above');
      expect(ast.firstAxis).toBe('col');
    });
  });
});
