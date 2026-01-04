/**
 * NULL Filtering Tests
 *
 * Tests automatic exclusion of NULL values from dimension groupings.
 *
 * NOTE: As of the fix for the concatenation bug, column dimensions get their
 * NULL filters added at the nest level (per column section) rather than in
 * the global WHERE clause. This ensures that concatenated column sections
 * like `COLS (gender | occupation)` only filter on their own dimensions.
 *
 * The global WHERE clause now only contains:
 * 1. User-specified WHERE conditions
 * 2. Row dimension NULL filters
 *
 * Column dimension NULL filters are added in query-plan-generator.ts when
 * building the nest clauses.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../dist/parser/index.js';
import { buildTableSpec } from '../dist/compiler/index.js';

describe('NULL Filtering', () => {
  describe('1. Parser - includeNulls option', () => {
    it('should parse includeNulls:false option', () => {
      const tpl = 'TABLE OPTIONS includeNulls:false ROWS state * births.sum COLS year;';
      const ast = parse(tpl);

      expect(ast.options).toHaveProperty('includeNulls', false);
    });

    it('should parse includeNulls:true option', () => {
      const tpl = 'TABLE OPTIONS includeNulls:true ROWS state * births.sum COLS year;';
      const ast = parse(tpl);

      expect(ast.options).toHaveProperty('includeNulls', true);
    });

    it('should default to undefined when not specified', () => {
      const tpl = 'TABLE ROWS state * births.sum COLS year;';
      const ast = parse(tpl);

      expect(ast.options.includeNulls).toBeUndefined();
    });
  });

  describe('2. Compiler - automatic NULL filters', () => {
    it('should add NULL filters for row dimensions by default', () => {
      const tpl = 'TABLE ROWS occupation COLS education * income.sum;';
      const ast = parse(tpl);
      const spec = buildTableSpec(ast);

      // Only row dimensions in global WHERE - column dimensions filtered in nests
      expect(spec.where).toBe('occupation is not null');
    });

    it('should NOT add NULL filters when includeNulls:true', () => {
      const tpl = 'TABLE OPTIONS includeNulls:true ROWS occupation COLS education * income.sum;';
      const ast = parse(tpl);
      const spec = buildTableSpec(ast);

      // Should not add filters
      expect(spec.where).toBeUndefined();
    });

    it('should merge with existing WHERE clause', () => {
      const tpl = 'TABLE WHERE income > 50000 ROWS occupation COLS education * income.sum;';
      const ast = parse(tpl);
      const spec = buildTableSpec(ast);

      // Should combine user's WHERE with row dimension NULL filters only
      expect(spec.where).toBe('(income > 50000) AND (occupation is not null)');
    });

    it('should handle single dimension', () => {
      const tpl = 'TABLE ROWS occupation * income.sum;';
      const ast = parse(tpl);
      const spec = buildTableSpec(ast);

      expect(spec.where).toBe('occupation is not null');
    });

    it('should handle nested row dimensions', () => {
      const tpl = 'TABLE ROWS occupation * gender * education COLS year * income.sum;';
      const ast = parse(tpl);
      const spec = buildTableSpec(ast);

      // Only row dimensions in global WHERE - column dimensions filtered in nests
      expect(spec.where).toContain('occupation is not null');
      expect(spec.where).toContain('gender is not null');
      expect(spec.where).toContain('education is not null');
      // year is a COLS dimension - filtered at nest level, not global WHERE
      expect(spec.where).not.toContain('year');
    });

    it('should deduplicate row dimensions', () => {
      const tpl = 'TABLE ROWS occupation | occupation COLS education * income.sum;';
      const ast = parse(tpl);
      const spec = buildTableSpec(ast);

      // occupation appears twice but should only filter once, education is in COLS
      expect(spec.where).toBe('occupation is not null');
    });
  });

  describe('3. Interaction with existing features', () => {
    it('should work with dimension ordering', () => {
      const tpl = 'TABLE ROWS occupation@occupation_order.min * income.sum COLS education;';
      const ast = parse(tpl);
      const spec = buildTableSpec(ast);

      // Only row dimensions in global WHERE
      expect(spec.where).toBe('occupation is not null');
    });

    it('should work with limits', () => {
      const tpl = 'TABLE ROWS occupation[-5@income.sum] COLS education * income.sum;';
      const ast = parse(tpl);
      const spec = buildTableSpec(ast);

      // Only row dimensions in global WHERE
      expect(spec.where).toBe('occupation is not null');
    });

    it('should work with ALL (totals)', () => {
      const tpl = 'TABLE ROWS (occupation | ALL) * income.sum COLS education | ALL;';
      const ast = parse(tpl);
      const spec = buildTableSpec(ast);

      // ALL doesn't add a dimension to filter, only row dimensions in global WHERE
      expect(spec.where).toBe('occupation is not null');
    });

    it('should work with ACROSS percentages', () => {
      const tpl = 'TABLE ROWS occupation COLS education * (income.sum ACROSS COLS);';
      const ast = parse(tpl);
      const spec = buildTableSpec(ast);

      // Only row dimensions in global WHERE - column dimensions filtered in nests
      expect(spec.where).toBe('occupation is not null');
    });
  });

  describe('4. Column concatenation bug fix', () => {
    it('should NOT include all column dimensions in global WHERE for concatenated columns', () => {
      // This test verifies the fix for the concatenation bug where
      // COLS (gender | occupation) was incorrectly filtering the gender section
      // by occupation IS NOT NULL, causing rows to be lost.
      const tpl = 'TABLE ROWS education COLS (gender | occupation) * n;';
      const ast = parse(tpl);
      const spec = buildTableSpec(ast);

      // Global WHERE should only contain row dimension (education)
      // Column dimensions (gender, occupation) are filtered at nest level
      expect(spec.where).toBe('education is not null');
      expect(spec.where).not.toContain('gender');
      expect(spec.where).not.toContain('occupation');
    });

    it('should work correctly with row-only queries', () => {
      const tpl = 'TABLE ROWS (occupation | education) * income.sum;';
      const ast = parse(tpl);
      const spec = buildTableSpec(ast);

      // Both row dimensions should be in the global WHERE
      expect(spec.where).toContain('occupation is not null');
      expect(spec.where).toContain('education is not null');
    });

    it('should work correctly with nested row and column dimensions', () => {
      const tpl = 'TABLE ROWS state COLS (gender | occupation) * income.sum;';
      const ast = parse(tpl);
      const spec = buildTableSpec(ast);

      // Only row dimensions in global WHERE
      // Column dimensions (gender, occupation) are filtered at nest level
      expect(spec.where).toBe('state is not null');
      expect(spec.where).not.toContain('gender');
      expect(spec.where).not.toContain('occupation');
    });
  });
});
