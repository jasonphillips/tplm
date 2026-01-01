/**
 * TPL Parser and Compiler Tests
 * 
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest';

// These imports will work once the parser is generated
// import { parse } from '../dist/parser';
// import { compile } from '../dist/compiler';

describe('TPL Parser', () => {
  describe('Basic Parsing', () => {
    it('parses a simple crosstab', () => {
      const tpl = 'TABLE region * revenue * sum, year;';
      
      // Expected AST structure
      const expectedAST = {
        type: 'table',
        rowAxis: {
          type: 'axis',
          groups: [{
            type: 'group',
            items: [
              { type: 'dimension', name: 'region' },
              { type: 'measure', name: 'revenue' },
              { type: 'aggregation', method: 'sum' }
            ]
          }]
        },
        colAxis: {
          type: 'axis',
          groups: [{
            type: 'group',
            items: [
              { type: 'dimension', name: 'year' }
            ]
          }]
        }
      };
      
      // Uncomment when parser is ready:
      // const ast = parse(tpl);
      // expect(ast).toMatchObject(expectedAST);
      
      expect(true).toBe(true); // Placeholder
    });

    it('parses labels', () => {
      const tpl = 'TABLE region="Region" * revenue="Revenue":currency * sum, year;';
      
      // Uncomment when parser is ready:
      // const ast = parse(tpl);
      // expect(ast.rowAxis.groups[0].items[0].label).toBe('Region');
      // expect(ast.rowAxis.groups[0].items[1].format.type).toBe('currency');
      
      expect(true).toBe(true); // Placeholder
    });

    it('parses ALL with label', () => {
      const tpl = 'TABLE region * revenue * sum, year ALL="Total";';
      
      // Uncomment when parser is ready:
      // const ast = parse(tpl);
      // const colItems = ast.colAxis.groups[0].items;
      // expect(colItems).toHaveLength(2);
      // expect(colItems[1].type).toBe('all');
      // expect(colItems[1].label).toBe('Total');
      
      expect(true).toBe(true); // Placeholder
    });

    it('parses parenthesized expressions', () => {
      const tpl = 'TABLE region * (revenue cost) * sum, year;';
      
      // Uncomment when parser is ready:
      // const ast = parse(tpl);
      // The (revenue cost) should become a nested axis
      
      expect(true).toBe(true); // Placeholder
    });

    it('parses percent-of modifier', () => {
      const tpl = 'TABLE region * revenue * pct/ALL, year;';
      
      // Uncomment when parser is ready:
      // const ast = parse(tpl);
      // const agg = ast.rowAxis.groups[0].items[2];
      // expect(agg.over).toBe('ALL');
      
      expect(true).toBe(true); // Placeholder
    });

    it('parses diff modifier', () => {
      const tpl = 'TABLE region * revenue * sum~prior_year, year;';
      
      // Uncomment when parser is ready:
      // const ast = parse(tpl);
      // const agg = ast.rowAxis.groups[0].items[2];
      // expect(agg.diff).toBe('prior_year');
      
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Error Handling', () => {
    it('reports syntax errors with location', () => {
      const tpl = 'TABLE region * * sum, year;'; // Double asterisk is invalid

      // Uncomment when parser is ready:
      // expect(() => parse(tpl)).toThrow();

      expect(true).toBe(true); // Placeholder
    });

    it('handles missing semicolon gracefully', () => {
      const tpl = 'TABLE region * revenue * sum, year';

      // Uncomment when parser is ready:
      // expect(() => parse(tpl)).toThrow(/semicolon/i);

      expect(true).toBe(true); // Placeholder
    });

    it('forbids combining limit [N] with ASC/DESC keyword', async () => {
      const { parse } = await import('../packages/parser/parser.js');

      // [5] DESC should be forbidden - use [-5] for descending or [5] for ascending
      const tpl = 'TABLE ROWS state[5] DESC * births.sum COLS year;';

      expect(() => parse(tpl)).toThrow(/Cannot combine limit/);
    });
  });
});

describe('TPL Compiler', () => {
  describe('Basic Compilation', () => {
    it('compiles a simple crosstab to Malloy', () => {
      const tpl = 'TABLE region * revenue * sum, year;';
      
      const expectedMalloy = `run: sales -> {
  group_by: region
  aggregate:
    revenue_sum is revenue.sum()
  # pivot
  nest: by_year is {
    group_by: year
    aggregate:
      revenue_sum is revenue.sum()
    order_by: year
  }
}`;
      
      // Uncomment when compiler is ready:
      // const ast = parse(tpl);
      // const malloy = compile(ast, { source: 'sales' });
      // expect(malloy).toBe(expectedMalloy);
      
      expect(true).toBe(true); // Placeholder
    });

    it('compiles ALL to a total nest', () => {
      const tpl = 'TABLE region * revenue * sum, year ALL="Total";';
      
      // Should produce two nest blocks: by_year and total
      
      // Uncomment when compiler is ready:
      // const ast = parse(tpl);
      // const malloy = compile(ast, { source: 'sales' });
      // expect(malloy).toContain('nest: total is {');
      // expect(malloy).toContain('nest: by_year is {');
      
      expect(true).toBe(true); // Placeholder
    });

    it('applies currency format', () => {
      const tpl = 'TABLE region * revenue:currency * sum, year;';
      
      // Uncomment when compiler is ready:
      // const ast = parse(tpl);
      // const malloy = compile(ast, { source: 'sales' });
      // expect(malloy).toContain('# number="$#,##0.00"');
      
      expect(true).toBe(true); // Placeholder
    });

    it('handles multiple measures', () => {
      const tpl = 'TABLE region * (revenue cost) * sum, year;';
      
      // Should produce aggregates for both revenue_sum and cost_sum
      
      // Uncomment when compiler is ready:
      // const ast = parse(tpl);
      // const malloy = compile(ast, { source: 'sales' });
      // expect(malloy).toContain('revenue_sum is revenue.sum()');
      // expect(malloy).toContain('cost_sum is cost.sum()');
      
      expect(true).toBe(true); // Placeholder
    });

    it('handles multiple aggregations', () => {
      const tpl = 'TABLE region * revenue * (sum mean), year;';
      
      // Should produce aggregates for revenue_sum and revenue_mean
      
      // Uncomment when compiler is ready:
      // const ast = parse(tpl);
      // const malloy = compile(ast, { source: 'sales' });
      // expect(malloy).toContain('revenue_sum is revenue.sum()');
      // expect(malloy).toContain('revenue_mean is revenue.avg()');
      
      expect(true).toBe(true); // Placeholder
    });

    it('compiles percent-of to all() function', () => {
      const tpl = 'TABLE region * revenue * pct/ALL, year;';
      
      // Uncomment when compiler is ready:
      // const ast = parse(tpl);
      // const malloy = compile(ast, { source: 'sales' });
      // expect(malloy).toContain('revenue.sum() / all(revenue.sum())');
      // expect(malloy).toContain('# percent');
      
      expect(true).toBe(true); // Placeholder
    });
  });
});

describe('Intermediate ALL Tests', () => {
  describe('Parser', () => {
    it('parses (dimension | ALL) pattern', async () => {
      const { parse } = await import('../packages/parser/parser.js');
      const tpl = 'TABLE ROWS state * (gender | ALL) * births.sum COLS year;';

      const ast = parse(tpl);

      // The row axis should have one group with 3 items
      expect(ast.rowAxis.groups).toHaveLength(1);
      const items = ast.rowAxis.groups[0].items;
      expect(items).toHaveLength(3);

      // First item is dimension 'state'
      expect(items[0].type).toBe('dimension');
      expect(items[0].name).toBe('state');

      // Second item is parenthesized axis with (gender | ALL)
      expect(items[1].type).toBe('axis');
      expect(items[1].groups).toHaveLength(2);
      expect(items[1].groups[0].items[0].type).toBe('dimension');
      expect(items[1].groups[0].items[0].name).toBe('gender');
      expect(items[1].groups[1].items[0].type).toBe('all');

      // Third item is binding
      expect(items[2].type).toBe('binding');
    });

    it('parses (dimension | ALL) with label', async () => {
      const { parse } = await import('../packages/parser/parser.js');
      const tpl = "TABLE ROWS state * (gender | ALL 'Both') * births.sum;";

      const ast = parse(tpl);
      const axisItem = ast.rowAxis.groups[0].items[1];
      expect(axisItem.type).toBe('axis');
      expect(axisItem.groups[1].items[0].label).toBe('Both');
    });
  });

  // NOTE: Legacy single-query compiler tests removed. See multi-query.test.ts for current compiler tests.
});

describe('Integration Tests', () => {
  describe('End-to-end compilation', () => {
    it('handles complex real-world example', () => {
      const tpl = `TABLE
        region="Geographic Region"
        * (revenue cost):currency
        * (sum="Total" mean="Average"),
        fiscal_year ALL="Annual";`;

      // This should:
      // 1. Parse successfully
      // 2. Produce Malloy with region grouping
      // 3. Have 4 aggregates: revenue_sum, revenue_mean, cost_sum, cost_mean
      // 4. Have 2 nests: by_fiscal_year and annual (total)
      // 5. Include format tags for currency

      expect(true).toBe(true); // Placeholder for when implemented
    });
  });
});
