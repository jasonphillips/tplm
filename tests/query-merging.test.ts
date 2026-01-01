/**
 * Query Merging Tests
 *
 * Tests for the optimization that merges queries with the same row structure
 * but different column siblings into single queries with multiple nests.
 *
 * Background: When TPL has column siblings like `COLS gender | sector_label`,
 * it historically generated separate queries for each. But Malloy supports
 * multiple `nest:` clauses, so these can be merged into one query.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../dist/parser/index.js';
import {
  buildTableSpec,
  generateQueryPlan,
  generateMalloyQueries,
  countRawQueries,
} from '../dist/compiler/index.js';

/**
 * Helper to get query count from TPL
 */
function getQueryCount(tpl: string): { raw: number; deduplicated: number; malloy: number } {
  const ast = parse(tpl);
  const spec = buildTableSpec(ast);
  const rawCount = countRawQueries(spec);
  const plan = generateQueryPlan(spec);
  const queries = generateMalloyQueries(plan, 'test', {
    where: spec.where,
    firstAxis: spec.firstAxis
  });
  return {
    raw: rawCount,
    deduplicated: plan.queries.length,
    malloy: queries.length,
  };
}

/**
 * Helper to get generated Malloy queries
 */
function getMalloyQueries(tpl: string): string[] {
  const ast = parse(tpl);
  const spec = buildTableSpec(ast);
  const plan = generateQueryPlan(spec);
  const queries = generateMalloyQueries(plan, 'test', {
    where: spec.where,
    firstAxis: spec.firstAxis
  });
  return queries.map(q => q.malloy);
}

describe('Query Merging', () => {

  describe('Query counts after merging', () => {

    it('COLS with single dimension produces 1 query', () => {
      const counts = getQueryCount('TABLE ROWS occupation * income.sum COLS education;');
      expect(counts.deduplicated).toBe(1);
    });

    it('COLS with dimension | ALL produces 1 merged query', () => {
      // Same row structure, different column variants → merged
      const counts = getQueryCount('TABLE ROWS occupation * income.sum COLS education | ALL;');
      // Merged: 1 query with nest + outer aggregate
      expect(counts.raw).toBe(2);
      expect(counts.deduplicated).toBe(1);
    });

    it('COLS with dim1 | dim2 produces 1 merged query', () => {
      // Same row structure, different column nests → merged
      const counts = getQueryCount('TABLE ROWS occupation * income.sum COLS gender | sector_label;');
      // Merged: 1 query with two nests
      expect(counts.raw).toBe(2);
      expect(counts.deduplicated).toBe(1);
    });

    it('ROWS with (dim | ALL) and single COLS produces 2 queries', () => {
      // Row siblings with same column structure - different row structures can't merge
      const counts = getQueryCount('TABLE ROWS occupation * (gender | ALL) * income.sum COLS education;');
      // 2 row branches × 1 col branch = 2 queries (no col merging possible)
      expect(counts.deduplicated).toBe(2);
    });

    it('ROWS (dim | ALL) × COLS (dim | ALL) produces 2 merged queries', () => {
      // 2×2 matrix: 4 raw combinations
      // After row-based merge: 2 queries (one per row structure), each with 2 col variants
      const counts = getQueryCount('TABLE ROWS occupation * (gender | ALL) * income.sum COLS (education | ALL);');
      expect(counts.raw).toBe(4);
      expect(counts.deduplicated).toBe(2);  // Merged from 4 to 2
    });

    it('COLS with three siblings produces 1 merged query', () => {
      const counts = getQueryCount('TABLE ROWS occupation * income.sum COLS gender | sector_label | education;');
      expect(counts.raw).toBe(3);
      expect(counts.deduplicated).toBe(1);  // All 3 merged into 1
    });

  });

  describe('Query structure verification', () => {

    it('dim | ALL generates merged query with nest and outer aggregate', () => {
      const queries = getMalloyQueries('TABLE ROWS occupation * income.sum COLS education | ALL;');
      expect(queries).toHaveLength(1);

      const query = queries[0];
      // Should have nest: by_education for the dimension variant
      expect(query).toContain('nest: by_education');
      // Should have outer aggregate for the ALL variant
      expect(query).toMatch(/^\s*aggregate:/m);
    });

    it('dim1 | dim2 generates merged query with two nests', () => {
      const queries = getMalloyQueries('TABLE ROWS occupation * income.sum COLS gender | sector_label;');
      expect(queries).toHaveLength(1);

      const query = queries[0];
      // Single query should have both nests
      expect(query).toContain('nest: by_gender');
      expect(query).toContain('nest: by_sector_label');
    });

    it('merged query has correct row groupings', () => {
      const queries = getMalloyQueries('TABLE ROWS occupation * education * income.sum COLS gender | sector_label;');
      expect(queries).toHaveLength(1);

      const query = queries[0];
      // Should group by occupation, education
      expect(query).toContain('group_by: occupation, education');
    });

  });

  describe('Column limits prevent merging (require restructuring)', () => {

    it('COLS with limit in one sibling produces separate queries (not merged)', () => {
      // Column limits require restructured queries, which don't support merging
      const queries = getMalloyQueries('TABLE ROWS occupation * income.sum COLS education[-5] | ALL;');
      // The education variant has a limit, so it can't be merged with ALL
      expect(queries).toHaveLength(2);

      // One should have the limited nest
      const educationQuery = queries.find(q => q.includes('limit: 5'));
      expect(educationQuery).toBeTruthy();
    });

    it('COLS with different limits in siblings produces separate queries', () => {
      const queries = getMalloyQueries('TABLE ROWS occupation * income.sum COLS gender[-3] | education[-5];');
      // Both have limits, so they remain separate
      expect(queries).toHaveLength(2);

      // Check each query has its respective limit
      const genderQuery = queries.find(q => q.includes('limit: 3'));
      const educationQuery = queries.find(q => q.includes('limit: 5'));
      expect(genderQuery).toBeTruthy();
      expect(educationQuery).toBeTruthy();
    });

    it('COLS without limits still merges', () => {
      // Confirm that without limits, merging still works
      const queries = getMalloyQueries('TABLE ROWS occupation * income.sum COLS gender | education;');
      expect(queries).toHaveLength(1);
      expect(queries[0]).toContain('nest: by_gender');
      expect(queries[0]).toContain('nest: by_education');
    });

  });

  describe('Edge cases', () => {

    it('single COLS dimension (no siblings) is not affected by merging', () => {
      const queries = getMalloyQueries('TABLE ROWS occupation * income.sum COLS education;');
      expect(queries).toHaveLength(1);
      expect(queries[0]).toContain('nest: by_education');
    });

    it('no COLS produces single query with no nesting', () => {
      const queries = getMalloyQueries('TABLE ROWS occupation * income.sum;');
      expect(queries).toHaveLength(1);
      expect(queries[0]).not.toContain('nest:');
    });

    it('COLS ALL only produces query with aggregate only', () => {
      const queries = getMalloyQueries('TABLE ROWS occupation * income.sum COLS ALL;');
      expect(queries).toHaveLength(1);
      expect(queries[0]).not.toContain('nest:');
      expect(queries[0]).toMatch(/aggregate:/);
    });

    it('complex nested COLS (dim1 * dim2 | ALL) merges correctly', () => {
      // Hierarchical column with sibling total
      const queries = getMalloyQueries('TABLE ROWS occupation * income.sum COLS gender * education | ALL;');
      expect(queries).toHaveLength(1);

      const query = queries[0];
      // Should have both outer aggregate (for ALL) and nested structure (for gender * education)
      expect(query).toMatch(/aggregate:/);
      expect(query).toContain('nest: by_gender');
    });

    it('row-only merging does not happen (different row structures)', () => {
      // Row siblings cannot merge because they have different row groupings
      const counts = getQueryCount('TABLE ROWS (occupation | education) * income.sum;');
      // Two row branches = 2 queries (no merging possible)
      expect(counts.deduplicated).toBe(2);
    });

    it('mixed row and col siblings: col siblings merge within each row branch', () => {
      // 2 row branches × 2 col branches = 4 raw, but col branches merge
      const counts = getQueryCount('TABLE ROWS (occupation | ALL) * income.sum COLS gender | ALL;');
      expect(counts.raw).toBe(4);
      // After merging: 2 queries (one per row structure), each with merged col variants
      expect(counts.deduplicated).toBe(2);
    });

    it('multiple aggregates with merged columns', () => {
      // Multiple measures (aggregate siblings) + column siblings
      // Row aggregates (income.sum | income.mean) share the same row groupings (occupation)
      // so they can all be computed in a single merged query
      const queries = getMalloyQueries('TABLE ROWS occupation * (income.sum | income.mean) COLS gender | education;');
      expect(queries).toHaveLength(1);

      const query = queries[0];
      // Should have both aggregates
      expect(query).toContain('income_sum');
      expect(query).toContain('income_mean');
      // And both column nests
      expect(query).toContain('nest: by_gender');
      expect(query).toContain('nest: by_education');
    });

    it('nested row structure with column siblings', () => {
      // Deep row nesting + column siblings should still merge columns
      const queries = getMalloyQueries('TABLE ROWS state * county * income.sum COLS gender | education;');
      expect(queries).toHaveLength(1);

      const query = queries[0];
      expect(query).toContain('group_by: state');
      expect(query).toContain('nest: by_gender');
      expect(query).toContain('nest: by_education');
    });

    it('four column siblings merge into single query', () => {
      const queries = getMalloyQueries('TABLE ROWS occupation * income.sum COLS gender | education | state | age_group;');
      expect(queries).toHaveLength(1);

      const query = queries[0];
      expect(query).toContain('nest: by_gender');
      expect(query).toContain('nest: by_education');
      expect(query).toContain('nest: by_state');
      expect(query).toContain('nest: by_age_group');
    });

  });

});
