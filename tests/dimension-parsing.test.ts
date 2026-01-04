/**
 * Dimension Parsing Test Suite
 *
 * Tests the DIMENSION statement parsing in Chevrotain parser.
 * DIMENSION is only supported in Chevrotain (not Peggy).
 */

import { describe, it, expect } from 'vitest';
import {
  parseProgram,
  parse,
  type TPLProgram,
  type DimensionDef,
} from '../dist/parser/chevrotain-parser.js';

describe('DIMENSION Parsing - Simple Aliases', () => {
  it('parses simple dimension alias', () => {
    const input = `
      DIMENSION gender FROM gendchar;
      TABLE ROWS gender COLS year;
    `;
    const program = parseProgram(input);

    expect(program.dimensions).toHaveLength(1);
    expect(program.dimensions[0]).toEqual({
      type: 'dimension_def',
      name: 'gender',
      sourceColumn: 'gendchar',
    });
    expect(program.tables).toHaveLength(1);
  });

  it('parses multiple dimension aliases', () => {
    const input = `
      DIMENSION gender FROM gendchar;
      DIMENSION state FROM stfips;
      TABLE ROWS gender * state COLS year;
    `;
    const program = parseProgram(input);

    expect(program.dimensions).toHaveLength(2);
    expect(program.dimensions[0].name).toBe('gender');
    expect(program.dimensions[0].sourceColumn).toBe('gendchar');
    expect(program.dimensions[1].name).toBe('state');
    expect(program.dimensions[1].sourceColumn).toBe('stfips');
  });
});

describe('DIMENSION Parsing - Bucketed Dimensions', () => {
  it('parses bucketed dimension with simple conditions', () => {
    const input = `
      DIMENSION education FROM educ
        '<HS' WHEN < 12
        'HS' WHEN = 12
        'College' WHEN >= 13
      ;
      TABLE ROWS education COLS year;
    `;
    const program = parseProgram(input);

    expect(program.dimensions).toHaveLength(1);
    const dim = program.dimensions[0];
    expect(dim.name).toBe('education');
    expect(dim.sourceColumn).toBe('educ');
    expect(dim.buckets).toHaveLength(3);
    expect(dim.buckets![0]).toEqual({ label: '<HS', condition: '< 12' });
    expect(dim.buckets![1]).toEqual({ label: 'HS', condition: '= 12' });
    expect(dim.buckets![2]).toEqual({ label: 'College', condition: '>= 13' });
  });

  it('parses bucketed dimension with AND conditions', () => {
    const input = `
      DIMENSION ageGroup FROM age
        'Child' WHEN < 18
        'Adult' WHEN >= 18 AND < 65
        'Senior' WHEN >= 65
      ;
      TABLE ROWS ageGroup COLS year;
    `;
    const program = parseProgram(input);

    expect(program.dimensions).toHaveLength(1);
    const dim = program.dimensions[0];
    expect(dim.buckets).toHaveLength(3);
    expect(dim.buckets![1].label).toBe('Adult');
    expect(dim.buckets![1].condition).toMatch(/>=\s*18\s*AND\s*<\s*65/i);
  });

  it('parses bucketed dimension with ELSE NULL', () => {
    const input = `
      DIMENSION status FROM statusCode
        'Active' WHEN = 1
        'Inactive' WHEN = 0
        ELSE NULL
      ;
      TABLE ROWS status COLS year;
    `;
    const program = parseProgram(input);

    const dim = program.dimensions[0];
    expect(dim.elseValue).toBe(null);
  });

  it('parses bucketed dimension with ELSE string value', () => {
    const input = `
      DIMENSION status FROM statusCode
        'Active' WHEN = 1
        'Inactive' WHEN = 0
        ELSE 'Unknown'
      ;
      TABLE ROWS status COLS year;
    `;
    const program = parseProgram(input);

    const dim = program.dimensions[0];
    expect(dim.elseValue).toBe('Unknown');
  });
});

describe('DIMENSION Parsing - Complex Cases', () => {
  it('parses dimensions interleaved with tables', () => {
    const input = `
      DIMENSION education FROM educ
        '<HS' WHEN < 12
        'HS' WHEN = 12
        'College' WHEN >= 13
      ;

      TABLE ROWS education COLS gender;

      DIMENSION region FROM regcode
        'Northeast' WHEN = 1
        'South' WHEN = 2
        'Midwest' WHEN = 3
        'West' WHEN = 4
      ;

      TABLE ROWS region COLS year;
    `;
    const program = parseProgram(input);

    expect(program.dimensions).toHaveLength(2);
    expect(program.tables).toHaveLength(2);
  });

  it('parses numeric conditions with comparison operators', () => {
    const input = `
      DIMENSION income FROM inc
        'Low' WHEN < 25000
        'Middle' WHEN >= 25000 AND <= 75000
        'High' WHEN > 75000
      ;
      TABLE ROWS income COLS year;
    `;
    const program = parseProgram(input);

    const dim = program.dimensions[0];
    expect(dim.buckets).toHaveLength(3);
    expect(dim.buckets![0].condition).toMatch(/<\s*25000/);
    expect(dim.buckets![2].condition).toMatch(/>\s*75000/);
  });
});

describe('DIMENSION Parsing - Backward Compatibility', () => {
  it('parse() returns first table when DIMENSIONs present', () => {
    const input = `
      DIMENSION gender FROM gendchar;
      TABLE ROWS gender COLS year;
    `;
    const table = parse(input);

    // Should return TPLStatement, not TPLProgram
    expect(table.type).toBe('table');
    expect(table.rowAxis).toBeDefined();
  });

  it('parse() works with TABLE-only input', () => {
    const input = 'TABLE ROWS region COLS year;';
    const table = parse(input);

    expect(table.type).toBe('table');
    expect(table.rowAxis).toBeDefined();
  });

  it('parse() throws on DIMENSION-only input (no TABLE)', () => {
    const input = 'DIMENSION gender FROM gendchar;';
    expect(() => parse(input)).toThrow('No TABLE statement found');
  });
});

describe('DIMENSION Parsing - Edge Cases', () => {
  it('handles empty program', () => {
    const program = parseProgram('');
    expect(program.dimensions).toHaveLength(0);
    expect(program.tables).toHaveLength(0);
  });

  it('handles whitespace-only program', () => {
    const program = parseProgram('   \n\n   ');
    expect(program.dimensions).toHaveLength(0);
    expect(program.tables).toHaveLength(0);
  });

  it('handles dimension names that are SQL reserved words', () => {
    // 'union' is a SQL reserved word
    const input = `
      DIMENSION status FROM statusField
        'yes' WHEN = 1
        'no' WHEN = 0
      ;
      TABLE ROWS status COLS year;
    `;
    const program = parseProgram(input);
    expect(program.dimensions[0].name).toBe('status');
  });
});
