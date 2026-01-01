/**
 * Debug script for GridSpec pipeline
 * Usage: npx tsx scripts/debug-grid.ts
 *
 * Uses ONLY the new QueryPlan-based pipeline (no legacy compiler).
 */

import { parse } from '../dist/parser/index.js';
import {
  buildTableSpec,
  generateQueryPlan,
  generateMalloyQueries,
  buildGridSpec,
  printTableSpec,
  printQueryPlan,
  printGridSpec,
} from '../dist/compiler/index.js';
import { renderGridToHTML } from '../dist/renderer/index.js';
import {
  createLocalConnection,
  getDefaultSource,
  executeMalloy,
} from '../dist/executor/index.js';

// Initialize DuckDB
createLocalConnection();
const DEFAULT_SOURCE = getDefaultSource();

async function testQuery(tpl: string) {
  console.log('='.repeat(70));
  console.log(`TPL: ${tpl}`);
  console.log('='.repeat(70));

  try {
    // Parse
    const ast = parse(tpl);

    // Build TableSpec
    const tableSpec = buildTableSpec(ast);
    console.log('\n--- TableSpec ---');
    console.log(printTableSpec(tableSpec));

    // Generate QueryPlan
    const queryPlan = generateQueryPlan(tableSpec);
    console.log('\n--- QueryPlan ---');
    console.log(printQueryPlan(queryPlan));

    // Generate Malloy queries from plan (single source of truth!)
    const malloyQueries = generateMalloyQueries(queryPlan, 'names', {
      where: tableSpec.where,
      firstAxis: tableSpec.firstAxis,
    });
    console.log('\n--- Generated Malloy Queries ---');
    for (const q of malloyQueries) {
      console.log(`\n  ${q.id}:`);
      console.log(q.malloy.split('\n').map(l => `    ${l}`).join('\n'));
    }

    // Execute queries
    console.log('\n--- Executing Queries ---');
    const queryResults = new Map<string, any[]>();
    for (const queryInfo of malloyQueries) {
      const fullMalloy = `${DEFAULT_SOURCE}\n${queryInfo.malloy}`;
      const data = await executeMalloy(fullMalloy);
      queryResults.set(queryInfo.id, data);
      console.log(`  ${queryInfo.id}: ${data.length} rows`);
      // Show first row structure for debugging
      if (data.length > 0) {
        console.log(`    First row keys: ${Object.keys(data[0]).join(', ')}`);
      }
    }

    // Build GridSpec (pass malloyQueries for axis inversion info)
    const gridSpec = buildGridSpec(tableSpec, queryPlan, queryResults, malloyQueries);
    console.log('\n--- GridSpec ---');
    console.log(printGridSpec(gridSpec));

    // Render HTML
    const html = renderGridToHTML(gridSpec);
    console.log('\n--- HTML Output ---');
    console.log(html);

    // Show some cell lookups - use values that exist in top-2 names
    console.log('\n--- Cell Lookup Tests ---');
    // Test a few different cell lookups using actual data values
    const testLookups = [
      // For row query: name*gender with year column
      { row: { name: 'Liam', gender: 'M' }, col: { year: 2019 }, agg: 'births_sum' },
      // For row query: name*gender with everything column (total)
      { row: { name: 'Liam', gender: 'M' }, col: {}, agg: 'births_sum' },
      // For row query: name*state with year column
      { row: { name: 'Noah', state: 'CA' }, col: { year: 2019 }, agg: 'births_sum' },
    ];
    for (const lookup of testLookups) {
      const rowValues = new Map(Object.entries(lookup.row));
      const colValues = new Map(Object.entries(lookup.col));
      const cell = gridSpec.getCell(rowValues as any, colValues as any, lookup.agg);
      console.log(`  getCell(${JSON.stringify(lookup.row)}, ${JSON.stringify(lookup.col)}, ${lookup.agg})`);
      console.log(`    => raw=${cell.raw}, formatted="${cell.formatted}"`);
    }

  } catch (error) {
    console.error('ERROR:', error);
    if (error instanceof Error && error.stack) {
      console.error(error.stack.split('\n').slice(1, 5).join('\n'));
    }
  }

  console.log('\n');
}

// Test cases
const testCases = [
  // Declaration order test: ROWS first (state limits should be global)
  'TABLE ROWS state[-3] * births.sum COLS year[-5];',

  // Declaration order test: COLS first (year limits should be global)
  'TABLE COLS year[-5] ROWS state[-3] * births.sum;',

  // // More complex: User's query with ROWS first
  // 'TABLE ROWS name[-2] * (gender | state) * (births.sum | births.mean) COLS year[-3] | ALL "everything";',

  // // More complex: User's query with COLS first
  // 'TABLE COLS name[-2] * (gender | state) * (births.sum | births.mean) ROWS year[-3] | ALL "everything";',
];

async function main() {
  for (const tpl of testCases) {
    await testQuery(tpl);
  }
}

main().catch(console.error);
