/**
 * fixture-based tests for TPL
 *
 * iterates over .tpl files in fixtures/ and validates expected structure.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse } from '../dist/parser/index.js';
import {
  buildTableSpec,
  generateQueryPlan,
  generateMalloyQueries,
  collectDimensions,
  hasTotals,
} from '../dist/compiler/index.js';

interface FixtureCase {
  name: string;
  input: string;
  expected: {
    row_dimensions?: string[];
    col_dimensions?: string[];
    aggregates?: string[];
    query_count?: number;
    has_row_total?: boolean;
    has_col_total?: boolean;
  };
}

function parseFixture(content: string, filename: string): FixtureCase {
  const sections = content.split(/^---$/m).filter(s => s.trim());

  let input = '';
  const expected: FixtureCase['expected'] = {};

  for (const section of sections) {
    const trimmed = section.trim();

    if (trimmed.startsWith('input:')) {
      input = trimmed.replace(/^input:\s*/, '').trim();
    } else if (trimmed.startsWith('expected_structure:')) {
      const yamlText = trimmed.replace(/^expected_structure:\s*/, '');
      const lines = yamlText.split('\n');
      for (const line of lines) {
        const match = line.match(/^\s*(\w+):\s*(.+)$/);
        if (match) {
          const [, key, rawValue] = match;
          const value = rawValue.replace(/#.*$/, '').trim();
          if (value.startsWith('[')) {
            const arrayContent = value.slice(1, -1);
            const items = arrayContent.split(',').map(s => s.trim());
            (expected as any)[key] = items;
          } else if (value === 'true') {
            (expected as any)[key] = true;
          } else if (value === 'false') {
            (expected as any)[key] = false;
          } else if (!isNaN(Number(value))) {
            (expected as any)[key] = Number(value);
          }
        }
      }
    }
  }

  return { name: filename.replace('.tpl', ''), input, expected };
}

describe('Fixture Tests', () => {
  const fixturesDir = join(__dirname, 'fixtures');
  const files = readdirSync(fixturesDir).filter(f => f.endsWith('.tpl'));

  for (const file of files) {
    const content = readFileSync(join(fixturesDir, file), 'utf-8');
    const fixture = parseFixture(content, file);

    if (!fixture.input) {
      continue;
    }

    describe(fixture.name, () => {
      it('should parse without errors', () => {
        expect(() => parse(fixture.input)).not.toThrow();
      });

      it('should compile to expected structure', () => {
        const ast = parse(fixture.input);
        const tableSpec = buildTableSpec(ast);
        const queryPlan = generateQueryPlan(tableSpec);
        const malloyQueries = generateMalloyQueries(queryPlan, 'samples', {
          where: tableSpec.where,
          firstAxis: tableSpec.firstAxis,
        });

        if (fixture.expected.query_count !== undefined) {
          expect(malloyQueries.length).toBe(fixture.expected.query_count);
        }

        if (fixture.expected.row_dimensions !== undefined) {
          const rowDims = tableSpec.rowAxis ? collectDimensions(tableSpec.rowAxis) : [];
          expect(rowDims).toEqual(fixture.expected.row_dimensions);
        }

        if (fixture.expected.col_dimensions !== undefined) {
          const colDims = tableSpec.colAxis ? collectDimensions(tableSpec.colAxis) : [];
          expect(colDims).toEqual(fixture.expected.col_dimensions);
        }

        if (fixture.expected.aggregates !== undefined) {
          const aggNames = tableSpec.aggregates.map(a => a.name);
          expect(aggNames).toEqual(fixture.expected.aggregates);
        }

        if (fixture.expected.has_row_total !== undefined) {
          const rowHasTotal = tableSpec.rowAxis ? hasTotals(tableSpec.rowAxis) : false;
          expect(rowHasTotal).toBe(fixture.expected.has_row_total);
        }

        if (fixture.expected.has_col_total !== undefined) {
          const colHasTotal = tableSpec.colAxis ? hasTotals(tableSpec.colAxis) : false;
          expect(colHasTotal).toBe(fixture.expected.has_col_total);
        }
      });

      // malloy pattern tests removed - implementation details tested via e2e
    });
  }
});
