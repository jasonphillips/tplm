#!/usr/bin/env npx tsx
/**
 * Test script for the GridSpec-based renderer.
 * Tests the full pipeline: TPL → TableSpec → QueryPlan → GridSpec → HTML
 */

import { parse } from '../dist/parser/index.js';
import { buildTableSpec } from '../dist/compiler/table-spec-builder.js';
import { generateQueryPlan } from '../dist/compiler/query-plan-generator.js';
import { buildGridSpec, QueryResults } from '../dist/compiler/grid-spec-builder.js';
import { renderGridToHTML } from '../dist/renderer/grid-renderer.js';

// Mock data generator that produces data matching query structure
function generateMockResults(plan: ReturnType<typeof generateQueryPlan>): QueryResults {
  const results: QueryResults = new Map();

  const mockDimensionValues: Record<string, (string | number)[]> = {
    year: [2020, 2021],
    name: ['Olivia', 'Sophia'],
    state: ['CA', 'TX'],
    gender: ['F', 'M'],
  };

  for (const query of plan.queries) {
    const data = generateQueryData(
      query.rowGroupings.map(g => g.dimension),
      query.colGroupings.map(g => g.dimension),
      query.aggregates.map(a => a.name),
      mockDimensionValues
    );
    results.set(query.id, data);
  }

  return results;
}

function generateQueryData(
  rowDims: string[],
  colDims: string[],
  aggregateNames: string[],
  mockValues: Record<string, (string | number)[]>
): any[] {
  if (rowDims.length === 0) {
    if (colDims.length === 0) {
      const row: any = {};
      for (const agg of aggregateNames) {
        row[agg] = Math.floor(Math.random() * 10000);
      }
      return [row];
    } else {
      return [buildColumnPivots(colDims, aggregateNames, mockValues, 0)];
    }
  }

  return buildNestedRowData(rowDims, colDims, aggregateNames, mockValues, 0);
}

function buildNestedRowData(
  rowDims: string[],
  colDims: string[],
  aggregateNames: string[],
  mockValues: Record<string, (string | number)[]>,
  depth: number
): any[] {
  const currentDim = rowDims[depth];
  const values = mockValues[currentDim] || ['A', 'B'];
  const rows: any[] = [];

  for (const value of values) {
    const row: any = { [currentDim]: value };

    if (depth + 1 < rowDims.length) {
      const nestedKey = `by_${rowDims[depth + 1]}`;
      row[nestedKey] = buildNestedRowData(rowDims, colDims, aggregateNames, mockValues, depth + 1);
    } else if (colDims.length > 0) {
      Object.assign(row, buildColumnPivots(colDims, aggregateNames, mockValues, 0));
    } else {
      for (const agg of aggregateNames) {
        row[agg] = Math.floor(Math.random() * 10000);
      }
    }

    rows.push(row);
  }

  return rows;
}

function buildColumnPivots(
  colDims: string[],
  aggregateNames: string[],
  mockValues: Record<string, (string | number)[]>,
  depth: number
): any {
  const currentDim = colDims[depth];
  const values = mockValues[currentDim] || ['A', 'B'];
  const nestedKey = `by_${currentDim}`;

  const pivots = values.map(value => {
    const item: any = { [currentDim]: value };

    if (depth + 1 < colDims.length) {
      Object.assign(item, buildColumnPivots(colDims, aggregateNames, mockValues, depth + 1));
    } else {
      for (const agg of aggregateNames) {
        item[agg] = Math.floor(Math.random() * 10000);
      }
    }

    return item;
  });

  return { [nestedKey]: pivots };
}

// Test cases
const testCases = [
  'TABLE ROWS year * births.sum;',
  'TABLE ROWS year * gender * births.sum;',
  'TABLE ROWS year COLS state * births.sum;',
  'TABLE ROWS (year | ALL "Total") * births.sum;',
];

console.log('Testing GridSpec Renderer\n');

for (const tpl of testCases) {
  console.log('='.repeat(70));
  console.log(`TPL: ${tpl}`);
  console.log('-'.repeat(70));

  try {
    const ast = parse(tpl);
    const spec = buildTableSpec(ast);
    const plan = generateQueryPlan(spec);
    const results = generateMockResults(plan);
    const grid = buildGridSpec(spec, plan, results);

    const html = renderGridToHTML(grid);

    console.log('\nGenerated HTML:');
    console.log(html);
    console.log('');

  } catch (error) {
    console.log(`ERROR: ${error}`);
    if (error instanceof Error && error.stack) {
      console.log(error.stack.split('\n').slice(1, 5).join('\n'));
    }
    console.log('');
  }
}

console.log('='.repeat(70));
