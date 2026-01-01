#!/usr/bin/env npx tsx
/**
 * Test script for the GridSpec builder.
 * Tests the full pipeline: TPL → TableSpec → QueryPlan → GridSpec
 */

import { parse } from '../dist/parser/index.js';
import { buildTableSpec, printTableSpec } from '../dist/compiler/table-spec-builder.js';
import { generateQueryPlan } from '../dist/compiler/query-plan-generator.js';
import { buildGridSpec, printGridSpec, QueryResults } from '../dist/compiler/grid-spec-builder.js';

// Mock data generator that produces data matching query structure
function generateMockResults(plan: ReturnType<typeof generateQueryPlan>): QueryResults {
  const results: QueryResults = new Map();

  const mockDimensionValues: Record<string, (string | number)[]> = {
    year: [2017, 2018, 2019],
    name: ['Olivia', 'Sophia', 'Emma'],
    state: ['CA', 'TX', 'NY'],
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
    // No row dimensions - just return aggregates or column pivots
    if (colDims.length === 0) {
      // Just aggregates
      const row: any = {};
      for (const agg of aggregateNames) {
        row[agg] = Math.floor(Math.random() * 10000);
      }
      return [row];
    } else {
      // Column pivots only
      return [buildColumnPivots(colDims, aggregateNames, mockValues, 0)];
    }
  }

  // Build nested row data
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
      // More row nesting
      const nestedKey = `by_${rowDims[depth + 1]}`;
      row[nestedKey] = buildNestedRowData(rowDims, colDims, aggregateNames, mockValues, depth + 1);
    } else if (colDims.length > 0) {
      // Column pivots at leaf
      Object.assign(row, buildColumnPivots(colDims, aggregateNames, mockValues, 0));
    } else {
      // Direct aggregates at leaf
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
      // More column nesting
      Object.assign(item, buildColumnPivots(colDims, aggregateNames, mockValues, depth + 1));
    } else {
      // Leaf - add aggregates
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
  'TABLE ROWS year * (gender | state) * births.sum;',
  'TABLE ROWS (year | ALL "Total") * births.sum;',
  // Labeled aggregate siblings - should appear as headers
  'TABLE ROWS year * (births.sum "Total" | births.mean "Average");',
  'TABLE ROWS year COLS births.sum "Sum" | births.mean "Mean";',
];

console.log('Testing GridSpec Builder\n');
console.log('='.repeat(60) + '\n');

for (const tpl of testCases) {
  console.log(`TPL: ${tpl}`);
  console.log('-'.repeat(60));

  try {
    // Parse
    const ast = parse(tpl);

    // Build TableSpec
    const spec = buildTableSpec(ast);

    // Generate Query Plan
    const plan = generateQueryPlan(spec);

    // Generate mock results
    const results = generateMockResults(plan);

    // Build GridSpec
    const grid = buildGridSpec(spec, plan, results);

    // Print results
    console.log('\nTableSpec:');
    console.log(printTableSpec(spec));

    console.log('\nQuery Plan:');
    for (const q of plan.queries) {
      console.log(`  ${q.id}: rows=[${q.rowGroupings.map(g => g.dimension).join('*')}] cols=[${q.colGroupings.map(g => g.dimension).join('*')}]`);
    }

    console.log('\n' + printGridSpec(grid));

    // Test cell lookup with value-based keys
    console.log('\nCell Lookup Test:');
    if (grid.rowHeaders.length > 0) {
      // Build dimension values from first row header path
      const rowValues = new Map<string, string | number>();
      const firstRow = grid.rowHeaders[0];
      if (firstRow.dimension && firstRow.dimension !== '_aggregate') {
        rowValues.set(firstRow.dimension, firstRow.value);
      }

      // Build column values from first column header (if any)
      const colValues = new Map<string, string | number>();
      if (grid.colHeaders.length > 0) {
        const firstCol = grid.colHeaders[0];
        if (firstCol.dimension && firstCol.dimension !== '_aggregate') {
          colValues.set(firstCol.dimension, firstCol.value);
        }
      }

      const cell = grid.getCell(rowValues, colValues);
      console.log(`  getCell({${Array.from(rowValues.entries()).map(([k,v]) => `${k}:${v}`).join(', ')}}, {${Array.from(colValues.entries()).map(([k,v]) => `${k}:${v}`).join(', ')}})`);
      console.log(`  = { raw: ${cell.raw}, formatted: "${cell.formatted}", aggregate: "${cell.aggregate}" }`);
    }

  } catch (error) {
    console.log(`  ERROR: ${error}`);
    if (error instanceof Error && error.stack) {
      console.log(error.stack.split('\n').slice(1, 4).join('\n'));
    }
  }

  console.log('\n' + '='.repeat(60) + '\n');
}
