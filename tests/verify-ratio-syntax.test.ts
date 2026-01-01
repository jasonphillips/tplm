/**
 * Verify that multi-field ratio syntax works for ordering
 * e.g., state[-5@(a.sum / b.sum ACROSS name)]
 *
 * Also verify percentage aggregate syntax:
 * e.g., (count ACROSS), (income.sum ACROSS COLS)
 */

import { describe, it, expect } from 'vitest';
import { parse as parsePeggy } from '../dist/parser/parser.js';
import { parse as parseChevrotain } from '../dist/parser/chevrotain-parser.js';

describe('Multi-field ratio syntax verification', () => {
  const tpl = 'TABLE ROWS state[-5@(births.sum / deaths.sum ACROSS name)] COLS births.sum;';

  it('PEG parser handles explicit multi-field ratio', () => {
    const ast = parsePeggy(tpl);
    const limit = ast.rowAxis.groups[0].items[0].limit;

    expect(limit).toBeDefined();
    expect(limit.count).toBe(5);
    expect(limit.direction).toBe('desc');
    expect(limit.orderBy).toBeDefined();
    expect(limit.orderBy.type).toBe('ratioExpr');

    // Numerator: births.sum (no ungrouped dims)
    expect(limit.orderBy.numerator.type).toBe('aggregateExpr');
    expect(limit.orderBy.numerator.field).toBe('births');
    expect(limit.orderBy.numerator.function).toBe('sum');
    expect(limit.orderBy.numerator.ungroupedDimensions).toEqual([]);

    // Denominator: deaths.sum ACROSS name
    expect(limit.orderBy.denominator.type).toBe('aggregateExpr');
    expect(limit.orderBy.denominator.field).toBe('deaths');
    expect(limit.orderBy.denominator.function).toBe('sum');
    expect(limit.orderBy.denominator.ungroupedDimensions).toEqual(['name']);

    console.log('PEG orderBy:', JSON.stringify(limit.orderBy, null, 2));
  });

  it('Chevrotain parser handles explicit multi-field ratio', () => {
    const ast = parseChevrotain(tpl);
    const limit = ast.rowAxis.groups[0].items[0].limit;

    expect(limit).toBeDefined();
    expect(limit.count).toBe(5);
    expect(limit.direction).toBe('desc');
    expect(limit.orderBy).toBeDefined();
    expect(limit.orderBy.type).toBe('ratioExpr');

    // Numerator: births.sum (no ungrouped dims)
    expect(limit.orderBy.numerator.type).toBe('aggregateExpr');
    expect(limit.orderBy.numerator.field).toBe('births');
    expect(limit.orderBy.numerator.function).toBe('sum');
    expect(limit.orderBy.numerator.ungroupedDimensions).toEqual([]);

    // Denominator: deaths.sum ACROSS name
    expect(limit.orderBy.denominator.type).toBe('aggregateExpr');
    expect(limit.orderBy.denominator.field).toBe('deaths');
    expect(limit.orderBy.denominator.function).toBe('sum');
    expect(limit.orderBy.denominator.ungroupedDimensions).toEqual(['name']);

    console.log('Chevrotain orderBy:', JSON.stringify(limit.orderBy, null, 2));
  });

  it('Both parsers produce identical AST for multi-field ratio', () => {
    const pegAst = parsePeggy(tpl);
    const chevAst = parseChevrotain(tpl);
    expect(chevAst).toEqual(pegAst);
  });
});

describe('Percentage aggregate syntax verification', () => {
  // Helper to extract percentage aggregate from a potentially nested structure
  // After grammar changes, (count ACROSS) parses as a parenthesized axis containing
  // the percentageAggregate, so we need to unwrap it
  function extractPercentageAggregate(item: any): any {
    if (item.type === 'percentageAggregate') {
      return item;
    }
    // Parenthesized axis containing a single percentageAggregate
    if (item.type === 'axis' && item.groups?.length === 1 && item.groups[0].items?.length === 1) {
      return extractPercentageAggregate(item.groups[0].items[0]);
    }
    // Annotated group with inner axis
    if (item.type === 'annotatedGroup' && item.inner) {
      const inner = extractPercentageAggregate(item.inner);
      // Carry forward format/label from annotatedGroup to the inner percentageAggregate
      if (inner && inner.type === 'percentageAggregate') {
        if (item.format) inner.format = item.format;
        if (item.label) inner.label = item.label;
      }
      return inner;
    }
    return item;
  }

  const testCases = [
    {
      name: 'Cell percentage (grand total)',
      tpl: 'TABLE ROWS occupation * (count ACROSS) COLS education;',
      expected: {
        type: 'percentageAggregate',
        measure: undefined,
        method: 'count',
        denominatorScope: 'all',
      },
    },
    {
      name: 'Row percentage (across columns)',
      tpl: 'TABLE ROWS occupation * (income.sum ACROSS COLS) COLS education;',
      expected: {
        type: 'percentageAggregate',
        measure: 'income',
        method: 'sum',
        denominatorScope: 'cols',
      },
    },
    {
      name: 'Column percentage (across rows)',
      tpl: 'TABLE ROWS occupation * (count ACROSS ROWS) COLS education;',
      expected: {
        type: 'percentageAggregate',
        measure: undefined,
        method: 'count',
        denominatorScope: 'rows',
      },
    },
    {
      name: 'Percentage within dimension',
      tpl: 'TABLE ROWS occupation * (income.mean ACROSS gender) COLS education;',
      expected: {
        type: 'percentageAggregate',
        measure: 'income',
        method: 'mean',
        denominatorScope: ['gender'],
      },
    },
    {
      name: 'Percentage with format',
      tpl: 'TABLE ROWS occupation * (count ACROSS):percent COLS education;',
      expected: {
        type: 'percentageAggregate',
        measure: undefined,
        method: 'count',
        denominatorScope: 'all',
        format: { type: 'percent' },
      },
    },
    {
      name: 'Percentage with label',
      tpl: 'TABLE ROWS occupation * (count ACROSS) "Cell %" COLS education;',
      expected: {
        type: 'percentageAggregate',
        measure: undefined,
        method: 'count',
        denominatorScope: 'all',
        label: 'Cell %',
      },
    },
  ];

  for (const tc of testCases) {
    it(`PEG: ${tc.name}`, () => {
      const ast = parsePeggy(tc.tpl);
      // Find the percentage aggregate in the row axis (it's the second item after occupation)
      // Note: After grammar changes, we need to unwrap from nested axis structure
      const rawItem = ast.rowAxis.groups[0].items[1];
      const pctAgg = extractPercentageAggregate(rawItem);

      expect(pctAgg.type).toBe(tc.expected.type);
      expect(pctAgg.measure).toBe(tc.expected.measure);
      expect(pctAgg.method).toBe(tc.expected.method);
      expect(pctAgg.denominatorScope).toEqual(tc.expected.denominatorScope);
      if (tc.expected.format) {
        expect(pctAgg.format).toEqual(tc.expected.format);
      }
      if (tc.expected.label) {
        expect(pctAgg.label).toBe(tc.expected.label);
      }
    });

    it(`Chevrotain: ${tc.name}`, () => {
      const ast = parseChevrotain(tc.tpl);
      const rawItem = ast.rowAxis.groups[0].items[1];
      const pctAgg = extractPercentageAggregate(rawItem);

      expect(pctAgg.type).toBe(tc.expected.type);
      expect(pctAgg.measure).toBe(tc.expected.measure);
      expect(pctAgg.method).toBe(tc.expected.method);
      expect(pctAgg.denominatorScope).toEqual(tc.expected.denominatorScope);
      if (tc.expected.format) {
        expect(pctAgg.format).toEqual(tc.expected.format);
      }
      if (tc.expected.label) {
        expect(pctAgg.label).toBe(tc.expected.label);
      }
    });

    it(`Parity: ${tc.name}`, () => {
      const pegAst = parsePeggy(tc.tpl);
      const chevAst = parseChevrotain(tc.tpl);
      expect(chevAst).toEqual(pegAst);
    });
  }
});

describe('ACROSS with concatenation (previously failing case)', () => {
  // This was a bug where (income.sum ACROSS COLS | income.mean) would fail to parse
  // because the percentageAggregate rule consumed the enclosing parentheses

  it('PEG: Parses ACROSS with measure concatenation', () => {
    const tpl = 'TABLE ROWS occupation COLS education * (income.sum ACROSS COLS | income.mean);';
    const ast = parsePeggy(tpl);

    // Should parse successfully
    expect(ast.type).toBe('table');

    // Column axis should have one group with education * (...)
    expect(ast.colAxis.groups.length).toBe(1);
    const colGroup = ast.colAxis.groups[0];
    expect(colGroup.items.length).toBe(2); // education and (...)

    // The second item should be an axis with 2 groups (the concatenation)
    const innerAxis = colGroup.items[1];
    expect(innerAxis.type).toBe('axis');
    expect(innerAxis.groups.length).toBe(2);

    // First group: income.sum ACROSS COLS
    const firstGroup = innerAxis.groups[0];
    expect(firstGroup.items.length).toBe(1);
    expect(firstGroup.items[0].type).toBe('percentageAggregate');
    expect(firstGroup.items[0].measure).toBe('income');
    expect(firstGroup.items[0].method).toBe('sum');
    expect(firstGroup.items[0].denominatorScope).toBe('cols');

    // Second group: income.mean
    const secondGroup = innerAxis.groups[1];
    expect(secondGroup.items.length).toBe(1);
    expect(secondGroup.items[0].type).toBe('binding');
    expect(secondGroup.items[0].measure).toBe('income');
    expect(secondGroup.items[0].aggregations).toEqual([{ method: 'mean' }]);
  });

  it('Chevrotain: Parses ACROSS with measure concatenation', () => {
    const tpl = 'TABLE ROWS occupation COLS education * (income.sum ACROSS COLS | income.mean);';
    const ast = parseChevrotain(tpl);

    // Should parse successfully
    expect(ast.type).toBe('table');

    // Column axis should have one group with education * (...)
    expect(ast.colAxis.groups.length).toBe(1);
    const colGroup = ast.colAxis.groups[0];
    expect(colGroup.items.length).toBe(2); // education and (...)

    // The second item should be an axis with 2 groups (the concatenation)
    const innerAxis = colGroup.items[1];
    expect(innerAxis.type).toBe('axis');
    expect(innerAxis.groups.length).toBe(2);

    // First group: income.sum ACROSS COLS
    const firstGroup = innerAxis.groups[0];
    expect(firstGroup.items.length).toBe(1);
    expect(firstGroup.items[0].type).toBe('percentageAggregate');
    expect(firstGroup.items[0].measure).toBe('income');
    expect(firstGroup.items[0].method).toBe('sum');
    expect(firstGroup.items[0].denominatorScope).toBe('cols');

    // Second group: income.mean
    const secondGroup = innerAxis.groups[1];
    expect(secondGroup.items.length).toBe(1);
    expect(secondGroup.items[0].type).toBe('binding');
    expect(secondGroup.items[0].measure).toBe('income');
    expect(secondGroup.items[0].aggregations).toEqual([{ method: 'mean' }]);
  });

  it('Parity: ACROSS with measure concatenation', () => {
    const tpl = 'TABLE ROWS occupation COLS education * (income.sum ACROSS COLS | income.mean);';
    const pegAst = parsePeggy(tpl);
    const chevAst = parseChevrotain(tpl);
    expect(chevAst).toEqual(pegAst);
  });

  it('PEG: ACROSS without parentheses also works', () => {
    const tpl = 'TABLE ROWS occupation COLS education * income.sum ACROSS COLS;';
    const ast = parsePeggy(tpl);

    // Should parse successfully
    expect(ast.type).toBe('table');

    // Column axis should have one group
    const colGroup = ast.colAxis.groups[0];
    expect(colGroup.items.length).toBe(2);

    // Second item should be directly a percentageAggregate (not wrapped in axis)
    const pctAgg = colGroup.items[1];
    expect(pctAgg.type).toBe('percentageAggregate');
    expect(pctAgg.measure).toBe('income');
    expect(pctAgg.method).toBe('sum');
    expect(pctAgg.denominatorScope).toBe('cols');
  });
});
