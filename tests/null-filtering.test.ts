/**
 * NULL Filtering Tests
 *
 * Tests automatic exclusion of NULL values from dimension groupings
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
    it('should add NULL filters by default', () => {
      const tpl = 'TABLE ROWS occupation COLS education * income.sum;';
      const ast = parse(tpl);
      const spec = buildTableSpec(ast);

      // Should auto-generate NULL filters (with escaped field names for Malloy)
      expect(spec.where).toBe('occupation != null and education != null');
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

      // Should combine user's WHERE with NULL filters
      expect(spec.where).toBe('(income > 50000) AND (occupation != null and education != null)');
    });

    it('should handle single dimension', () => {
      const tpl = 'TABLE ROWS occupation * income.sum;';
      const ast = parse(tpl);
      const spec = buildTableSpec(ast);

      expect(spec.where).toBe('occupation != null');
    });

    it('should handle nested dimensions', () => {
      const tpl = 'TABLE ROWS occupation * gender * education COLS year * income.sum;';
      const ast = parse(tpl);
      const spec = buildTableSpec(ast);

      // All unique dimensions should be filtered (reserved words like 'year' escaped with backticks)
      expect(spec.where).toContain('occupation != null');
      expect(spec.where).toContain('gender != null');
      expect(spec.where).toContain('education != null');
      expect(spec.where).toContain('`year` != null');
    });

    it('should deduplicate dimensions', () => {
      const tpl = 'TABLE ROWS occupation | occupation COLS education * income.sum;';
      const ast = parse(tpl);
      const spec = buildTableSpec(ast);

      // occupation appears twice but should only filter once
      const occurrences = (spec.where?.match(/occupation != null/g) || []).length;
      expect(occurrences).toBe(1);
    });
  });

  describe('3. Interaction with existing features', () => {
    it('should work with dimension ordering', () => {
      const tpl = 'TABLE ROWS occupation@occupation_order.min * income.sum COLS education;';
      const ast = parse(tpl);
      const spec = buildTableSpec(ast);

      // Should filter both display dimensions (not ordering field)
      expect(spec.where).toBe('occupation != null and education != null');
    });

    it('should work with limits', () => {
      const tpl = 'TABLE ROWS occupation[-5@income.sum] COLS education * income.sum;';
      const ast = parse(tpl);
      const spec = buildTableSpec(ast);

      expect(spec.where).toBe('occupation != null and education != null');
    });

    it('should work with ALL (totals)', () => {
      const tpl = 'TABLE ROWS (occupation | ALL) * income.sum COLS education | ALL;';
      const ast = parse(tpl);
      const spec = buildTableSpec(ast);

      // ALL doesn't add a dimension to filter
      expect(spec.where).toBe('occupation != null and education != null');
    });

    it('should work with ACROSS percentages', () => {
      const tpl = 'TABLE ROWS occupation COLS education * (income.sum ACROSS COLS);';
      const ast = parse(tpl);
      const spec = buildTableSpec(ast);

      // Should filter dimensions used in percentage calculation
      // The WHERE clause will apply to both numerator and denominator in Malloy
      expect(spec.where).toBe('occupation != null and education != null');
    });
  });
});
