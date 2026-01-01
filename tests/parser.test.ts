/**
 * Unified Parser Test Suite
 *
 * Tests both PEG (Peggy) and Chevrotain parsers to ensure parity.
 * All tests use the canonical TPL syntax as defined in the PEG grammar.
 */

import { describe, it, expect } from 'vitest';
import { parse as parsePeggy } from '../dist/parser/parser.js';
import { parse as parseChevrotain } from '../dist/parser/chevrotain-parser.js';

// Test both parsers with the same input
function testBothParsers(input: string, description?: string) {
  const testName = description || input;

  it(`PEG: ${testName}`, () => {
    expect(() => parsePeggy(input)).not.toThrow();
  });

  it(`Chevrotain: ${testName}`, () => {
    expect(() => parseChevrotain(input)).not.toThrow();
  });

  it(`Parity: ${testName}`, () => {
    const peggyAst = parsePeggy(input);
    const chevrotainAst = parseChevrotain(input);
    expect(chevrotainAst).toEqual(peggyAst);
  });
}

describe('TPL Parser - Basic Syntax', () => {
  testBothParsers(
    'TABLE ROWS region COLS year;',
    'Simple two-axis table'
  );

  testBothParsers(
    'TABLE COLS year ROWS region;',
    'COLS before ROWS (reversed order)'
  );

  testBothParsers(
    'TABLE ROWS region * revenue:currency * sum COLS fiscal_year;',
    'With measure format and aggregation'
  );

  testBothParsers(
    'TABLE ROWS region * state * city * revenue:currency * sum COLS year;',
    'Multi-level row dimensions'
  );

  testBothParsers(
    'TABLE ROWS region * revenue.sum COLS year;',
    'Binding syntax - single aggregation'
  );

  testBothParsers(
    'TABLE ROWS region * revenue.(sum | mean) COLS year;',
    'Binding syntax - multiple aggregations'
  );

  testBothParsers(
    'TABLE ROWS region * revenue.sum:currency COLS year;',
    'Binding with format'
  );
});

describe('TPL Parser - Labels (space + quoted string)', () => {
  testBothParsers(
    'TABLE ROWS region "Geographic Region" COLS year;',
    'Label on dimension'
  );

  testBothParsers(
    'TABLE ROWS region * sum "Total" COLS year;',
    'Label on aggregation'
  );

  testBothParsers(
    'TABLE ROWS region COLS year | ALL "Grand Total";',
    'Label on ALL'
  );

  testBothParsers(
    'TABLE ROWS state[-5] "US State" * births.sum COLS year;',
    'Label after limit annotation'
  );
});

describe('TPL Parser - Concatenation (| or THEN)', () => {
  testBothParsers(
    'TABLE ROWS region | state COLS year;',
    'Pipe concatenation'
  );

  testBothParsers(
    'TABLE ROWS region THEN state COLS year;',
    'THEN concatenation'
  );

  testBothParsers(
    'TABLE ROWS (region | state) * revenue.sum COLS year;',
    'Parenthesized concatenation with binding'
  );

  testBothParsers(
    'TABLE ROWS state[-5] | ALL COLS year;',
    'Dimension with total'
  );
});

describe('TPL Parser - Crossing (* or BY)', () => {
  testBothParsers(
    'TABLE ROWS region * state COLS year;',
    'Star crossing'
  );

  testBothParsers(
    'TABLE ROWS region BY state COLS year;',
    'BY crossing'
  );

  testBothParsers(
    'TABLE ROWS region BY state BY city COLS year;',
    'Multiple BY crossings'
  );
});

describe('TPL Parser - Limits', () => {
  testBothParsers(
    'TABLE ROWS companies[10] COLS year;',
    'Ascending limit'
  );

  testBothParsers(
    'TABLE ROWS companies[-10] COLS year;',
    'Descending limit (top N)'
  );

  testBothParsers(
    'TABLE ROWS companies[-10@revenue] COLS year;',
    'Limit with simple order-by field'
  );

  testBothParsers(
    'TABLE ROWS companies[-10@revenue.sum] * revenue.sum COLS year;',
    'Limit with aggregate order-by'
  );
});

describe('TPL Parser - ACROSS (cross-dimensional)', () => {
  testBothParsers(
    'TABLE ROWS name * state[-5@(births.sum ACROSS name)] COLS births.sum;',
    'ACROSS in limit order-by'
  );

  testBothParsers(
    'TABLE ROWS name * state[-3@(births.sum ACROSS name state)] COLS births.sum;',
    'ACROSS with multiple dimensions'
  );
});

describe('TPL Parser - FROM and WHERE', () => {
  testBothParsers(
    'TABLE FROM sales_data ROWS region COLS year;',
    'FROM clause'
  );

  testBothParsers(
    'TABLE FROM analytics.sales_data ROWS region COLS year;',
    'FROM with schema.table'
  );

  testBothParsers(
    'TABLE FROM sales WHERE year >= 2023 ROWS region COLS quarter;',
    'WHERE clause'
  );

  testBothParsers(
    'TABLE FROM sales WHERE year >= 2023 AND region != \'Unknown\' ROWS region COLS quarter;',
    'WHERE with AND'
  );
});

describe('TPL Parser - Formats', () => {
  testBothParsers(
    'TABLE ROWS region * revenue:currency * sum COLS year;',
    'Currency format'
  );

  testBothParsers(
    'TABLE ROWS region * rate:percent * mean COLS year;',
    'Percent format'
  );

  testBothParsers(
    'TABLE ROWS region * count:integer * sum COLS year;',
    'Integer format'
  );

  testBothParsers(
    'TABLE ROWS region * amount:decimal.2 * sum COLS year;',
    'Decimal format with precision'
  );

  testBothParsers(
    'TABLE ROWS region * (revenue | cost):comma.0 * sum COLS year;',
    'Comma format on group'
  );

  testBothParsers(
    "TABLE ROWS region * revenue:'$ #.2' * sum COLS year;",
    'Custom format with prefix and precision'
  );

  testBothParsers(
    "TABLE ROWS region * count:'#.0 units' * sum COLS year;",
    'Custom format with suffix'
  );

  testBothParsers(
    "TABLE ROWS region * amount:'€ #.2 M' * sum COLS year;",
    'Custom format with prefix, precision, and suffix'
  );
});

describe('TPL Parser - Order direction', () => {
  testBothParsers(
    'TABLE ROWS state ASC COLS year;',
    'ASC keyword'
  );

  testBothParsers(
    'TABLE ROWS state DESC COLS year;',
    'DESC keyword'
  );

  testBothParsers(
    'TABLE ROWS state DESC "US State" COLS year;',
    'DESC with label'
  );
});

describe('TPL Parser - Column totals', () => {
  testBothParsers(
    'TABLE ROWS state COLS year | ALL;',
    'Column total with ALL'
  );

  testBothParsers(
    'TABLE ROWS state COLS year[-5] | ALL "Total";',
    'Column total with label'
  );
});

describe('TPL Parser - Row totals', () => {
  testBothParsers(
    'TABLE ROWS (state | ALL) * births.sum COLS year;',
    'Row total with ALL'
  );

  testBothParsers(
    'TABLE ROWS (state[-5] | ALL "Grand Total") * births.sum COLS year;',
    'Row total with limit and label'
  );
});

describe('TPL Parser - Intermediate ALL (subtotals)', () => {
  testBothParsers(
    'TABLE ROWS state[-5] * (gender | ALL) * births.sum COLS year[-3];',
    'Intermediate ALL for subtotals'
  );

  testBothParsers(
    'TABLE ROWS state * (gender | ALL "Both Genders") * births.sum COLS year;',
    'Intermediate ALL with label'
  );
});

describe('TPL Parser - Group binding', () => {
  testBothParsers(
    'TABLE ROWS region * (revenue | cost).sum COLS year;',
    'Group binding with single aggregation'
  );

  testBothParsers(
    'TABLE ROWS region * (revenue | cost).(sum | mean) COLS year;',
    'Group binding with multiple aggregations'
  );
});

describe('TPL Parser - Complex expressions', () => {
  testBothParsers(
    'TABLE ROWS state[-10@births.sum] * (gender | ALL) * births.(sum | mean) COLS year[-5] | ALL "Total";',
    'Complex table with limits, intermediate ALL, multiple aggs, column total'
  );
});

// Test that specific invalid syntax fails
describe('TPL Parser - Invalid syntax detection', () => {
  it('PEG rejects = label syntax', () => {
    expect(() => parsePeggy('TABLE ROWS region="Label" COLS year;')).toThrow();
  });

  it('Chevrotain rejects = label syntax', () => {
    expect(() => parseChevrotain('TABLE ROWS region="Label" COLS year;')).toThrow();
  });

  it('PEG rejects space-separated items without pipe', () => {
    expect(() => parsePeggy('TABLE ROWS (a b).sum COLS year;')).toThrow();
  });

  it('Chevrotain rejects space-separated items without pipe', () => {
    expect(() => parseChevrotain('TABLE ROWS (a b).sum COLS year;')).toThrow();
  });
});
