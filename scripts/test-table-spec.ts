#!/usr/bin/env npx tsx
/**
 * Test script for the new TableSpec structure.
 * Tests various TPL patterns to verify the tree structure is correct.
 */

import { parse } from '../dist/parser/index.js';
import { buildTableSpec, printTableSpec } from '../dist/compiler/table-spec-builder.js';
import { printAxisTree, collectBranches, serializeTreePath } from '../dist/compiler/table-spec.js';
import { generateQueryPlan, printQueryPlan, countRawQueries } from '../dist/compiler/query-plan-generator.js';

const testCases = [
  // Basic cases
  'TABLE ROWS year * births.sum;',
  'TABLE ROWS year * gender * births.sum;',

  // Siblings (|)
  'TABLE ROWS year | gender;',
  'TABLE ROWS (year | gender) * births.sum;',
  'TABLE ROWS year * (gender | state) * births.sum;',

  // Outer siblings with shared inner
  'TABLE ROWS (gender | name) * state * births.sum;',

  // ALL/totals
  'TABLE ROWS year | ALL;',
  'TABLE ROWS (year | ALL) * births.sum;',
  'TABLE ROWS year * (gender | ALL) * births.sum;',
  'TABLE ROWS year * (gender | ALL "Both") * births.sum;',

  // Column pivots
  'TABLE ROWS year COLS state;',
  'TABLE ROWS year * births.sum COLS state;',
  'TABLE ROWS year COLS state | ALL;',
  'TABLE ROWS year COLS (state | ALL "Total");',

  // Limits
  'TABLE ROWS year[-5] * births.sum;',
  'TABLE ROWS year * state[-3] * births.sum;',

  // Multiple aggregates
  'TABLE ROWS year * (births.sum | births.mean);',
  'TABLE ROWS year * births.(sum | mean);',

  // Aggregate siblings on columns
  'TABLE ROWS year COLS births.sum | births.mean;',

  // Complex: outer siblings, inner nesting, totals
  'TABLE ROWS year * (gender | state) COLS births.sum | births.mean;',
  'TABLE ROWS (year | ALL) * (gender | state) * births.sum;',
];

console.log('Testing TableSpec Builder\n');
console.log('='.repeat(60) + '\n');

for (const tpl of testCases) {
  console.log(`TPL: ${tpl}`);
  console.log('-'.repeat(60));

  try {
    const ast = parse(tpl);
    const spec = buildTableSpec(ast);

    console.log(printTableSpec(spec));

    // Show branches
    console.log('\n  Row Branches:');
    if (spec.rowAxis) {
      const rowBranches = collectBranches(spec.rowAxis);
      for (const branch of rowBranches) {
        console.log(`    ${serializeTreePath(branch)}`);
      }
    }

    if (spec.colAxis) {
      console.log('  Column Branches:');
      const colBranches = collectBranches(spec.colAxis);
      for (const branch of colBranches) {
        console.log(`    ${serializeTreePath(branch)}`);
      }
    }

    // Test query plan generation and deduplication
    const rawCount = countRawQueries(spec);
    const plan = generateQueryPlan(spec);
    const dedupedCount = plan.queries.length;
    const savings = rawCount - dedupedCount;

    console.log(`\n  Query Plan:`);
    console.log(`    Raw queries: ${rawCount}`);
    console.log(`    Deduplicated: ${dedupedCount}`);
    if (savings > 0) {
      console.log(`    Saved: ${savings} duplicate queries (${Math.round(savings/rawCount*100)}%)`);
    }

    for (const q of plan.queries) {
      const rowDims = q.rowGroupings.map(g => g.dimension).join('*') || (q.isRowTotal ? 'TOTAL' : '-');
      const colDims = q.colGroupings.map(g => g.dimension).join('*') || (q.hasColTotal ? 'TOTAL' : '-');
      console.log(`    ${q.id}: rows=[${rowDims}] cols=[${colDims}]`);
    }

  } catch (error) {
    console.log(`  ERROR: ${error}`);
  }

  console.log('\n' + '='.repeat(60) + '\n');
}
