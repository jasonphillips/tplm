#!/usr/bin/env npx tsx
/**
 * TPL Debug Script - Unified end-to-end testing
 *
 * Uses the new pipeline (TableSpec → QueryPlan → GridSpec) with local DuckDB.
 * Default dataset: Employment survey sample data (6,639 records)
 *
 * Usage:
 *   npx tsx scripts/tpl-debug.ts "TABLE ROWS gender * income.sum COLS education;"
 *   npx tsx scripts/tpl-debug.ts --ast "TABLE ROWS occupation * count;"
 *   npx tsx scripts/tpl-debug.ts --spec "TABLE ROWS gender * income.sum;"
 *   npx tsx scripts/tpl-debug.ts --plan "TABLE ROWS education[-3] COLS gender;"
 *   npx tsx scripts/tpl-debug.ts --malloy "TABLE ROWS occupation * income.mean;"
 *   npx tsx scripts/tpl-debug.ts --grid "TABLE ROWS gender * income.sum COLS education;"
 *   npx tsx scripts/tpl-debug.ts --data "TABLE ROWS gender * count COLS year[-3];"
 *   npx tsx scripts/tpl-debug.ts --html "TABLE ROWS occupation[-5] * income.sum;"  (default)
 *   npx tsx scripts/tpl-debug.ts --all "TABLE ROWS gender * income.sum COLS education;"
 *   npx tsx scripts/tpl-debug.ts --schema   # Show available dimensions/measures
 *
 * Output Modes:
 *   --ast     Show parsed AST (no execution)
 *   --spec    Show TableSpec intermediate representation
 *   --plan    Show QueryPlan with query signatures
 *   --malloy  Show generated Malloy queries
 *   --grid    Show GridSpec structure (after execution)
 *   --data    Show raw JSON query results
 *   --html    Show rendered HTML table (default)
 *   --all     Show all stages for full debugging
 *   --schema  Show available dimensions and measures
 *
 * ============================================================
 * AVAILABLE DATA (Employment Survey - 6,639 records)
 * ============================================================
 *
 * DIMENSIONS (for grouping):
 *   gender          - Male, Female
 *   education       - <HS, HS, College (3 categories)
 *   education_detail - <HS, HS graduate, Some College, College Grad, Some Graduate
 *   occupation      - Managerial, Professional, Technical, Sales, Clerical,
 *                     Services, Manufacturing, Transport, Farming
 *   employment      - Full-time, Part-time
 *   marital_status  - Married, Widowed, Divorced/Sep., Never Married
 *   sector_label    - Private, Public
 *   union_status    - Union, Non-Union
 *   country         - North America, South America, Other
 *   customer_type   - Retail, Wholesale (string column)
 *   company_size    - Small, Large (string column)
 *   year            - 1988, 1996 (survey years)
 *   age             - numeric (18-65)
 *
 * MEASURES (for aggregation):
 *   income          - Annual income (use income.sum, income.mean, etc.)
 *   hourly          - Hourly wage
 *   sat             - Satisfaction score (1-5)
 *   numkids         - Number of children
 *   count           - Row count (standalone aggregation)
 *
 * EXAMPLE QUERIES:
 *   "TABLE ROWS gender * income.sum COLS education;"
 *   "TABLE ROWS occupation[-5@income.sum] * income.(sum | mean) COLS gender;"
 *   "TABLE ROWS (gender | ALL) * count COLS education | ALL;"
 *   "TABLE ROWS education * employment * income.mean COLS year;"
 * ============================================================
 */

import * as path from 'path';
import { fileURLToPath } from 'url';
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
  executeMalloy,
} from '../dist/executor/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ============================================================
// Samples Data Source (Employment Survey - 6,639 records)
// ============================================================

const SAMPLES_CSV_PATH = path.join(PROJECT_ROOT, 'data/samples/samples.csv');

const SAMPLES_SOURCE = `
source: samples is duckdb.table('${SAMPLES_CSV_PATH}') extend {

  // Education (3 categories)
  dimension:
    education is
      pick '<HS' when educ < 12
      pick 'HS' when educ = 12
      pick 'College' when educ >= 13
      else null

    // Detailed education (5 categories)
    education_detail is
      pick '<HS' when educ < 12
      pick 'HS graduate' when educ = 12
      pick 'Some College' when educ >= 13 and educ <= 15
      pick 'College Grad' when educ = 16
      pick 'Some Graduate' when educ >= 17
      else null

  // Employment status
  dimension:
    employment is
      pick 'Full-time' when fulltime = 2
      pick 'Part-time' when fulltime >= 3
      else null

  // Gender (from string column)
  dimension:
    gender is gendchar

  // Sector
  dimension:
    sector_label is
      pick 'Private' when sector = 1 or sector = 5 or sector = 6
      pick 'Public' when sector = 2 or sector = 3 or sector = 4
      else null

  // Marital status
  dimension:
    marital_status is
      pick 'Married' when marital >= 1 and marital <= 3
      pick 'Widowed' when marital = 4
      pick 'Divorced/Sep.' when marital = 5 or marital = 6
      pick 'Never Married' when marital = 7
      else null

  // Occupation
  dimension:
    occupation is
      pick 'Managerial' when occup = 1
      pick 'Professional' when occup = 2
      pick 'Technical' when occup = 3
      pick 'Sales' when occup = 4
      pick 'Clerical' when occup = 5
      pick 'Services' when occup >= 6 and occup <= 8
      pick 'Manufacturing' when occup = 9 or occup = 10
      pick 'Transport' when occup = 11 or occup = 12
      pick 'Farming' when occup = 13 or occup = 14
      else null

  // Country
  dimension:
    country is
      pick 'North America' when ctry = 1
      pick 'South America' when ctry = 2
      pick 'Other' when ctry >= 3
      else null

  // Union status
  dimension:
    union_status is
      pick 'Non-Union' when \`union\` = 1
      pick 'Union' when \`union\` = 2
      else null

  // String columns (already have values)
  dimension:
    customer_type is custtype
    company_size is size

  // Standard measures
  measure:
    total_income is income.sum()
    mean_income is income.avg()
    total_hourly is hourly.sum()
    mean_hourly is hourly.avg()
    record_count is count()
    total_sat is sat.sum()
    mean_sat is sat.avg()
}
`;

// ============================================================
// Types
// ============================================================

type OutputMode = 'ast' | 'spec' | 'plan' | 'malloy' | 'grid' | 'data' | 'html' | 'all' | 'schema';

interface PipelineResult {
  ast: any;
  tableSpec: any;
  queryPlan: any;
  malloyQueries: any[];
  queryResults: Map<string, any[]>;
  gridSpec: any;
  html: string;
}

// ============================================================
// CLI Parsing
// ============================================================

function parseArgs(): { mode: OutputMode; tpl: string } {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  // Check if first arg is a mode flag
  if (args[0].startsWith('--')) {
    const modeArg = args[0].substring(2) as OutputMode;
    const validModes: OutputMode[] = ['ast', 'spec', 'plan', 'malloy', 'grid', 'data', 'html', 'all', 'schema'];

    if (!validModes.includes(modeArg)) {
      console.error(`Unknown mode: ${args[0]}`);
      printUsage();
      process.exit(1);
    }

    // Schema mode doesn't require a TPL query
    if (modeArg === 'schema') {
      return { mode: 'schema', tpl: '' };
    }

    if (!args[1]) {
      console.error('Error: TPL query required after mode flag');
      printUsage();
      process.exit(1);
    }

    return { mode: modeArg, tpl: args[1] };
  }

  // No mode flag - default to html
  return { mode: 'html', tpl: args[0] };
}

function printUsage() {
  console.log(`
TPL Debug Script - Unified end-to-end testing
Dataset: Employment Survey (6,639 records)

Usage:
  npx tsx scripts/tpl-debug.ts [--mode] "TPL QUERY"
  npx tsx scripts/tpl-debug.ts --schema   # Show available data

Modes:
  --ast     Show parsed AST (no execution)
  --spec    Show TableSpec intermediate representation
  --plan    Show QueryPlan with query signatures
  --malloy  Show generated Malloy queries
  --grid    Show GridSpec structure (after execution)
  --data    Show raw JSON query results
  --html    Show rendered HTML table (default)
  --all     Show all stages for full debugging
  --schema  Show available dimensions and measures

Examples:
  npx tsx scripts/tpl-debug.ts "TABLE ROWS gender * income.sum COLS education;"
  npx tsx scripts/tpl-debug.ts --malloy "TABLE ROWS occupation * income.mean;"
  npx tsx scripts/tpl-debug.ts --all "TABLE ROWS (gender | ALL) * count COLS education;"
  npx tsx scripts/tpl-debug.ts --schema
`);
}

function printSchema() {
  console.log(`
============================================================
EMPLOYMENT SURVEY DATA (6,639 records)
============================================================

DIMENSIONS (for grouping):
  gender            Male, Female
  education         <HS, HS, College (3 categories)
  education_detail  <HS, HS graduate, Some College, College Grad, Some Graduate
  occupation        Managerial, Professional, Technical, Sales, Clerical,
                    Services, Manufacturing, Transport, Farming
  employment        Full-time, Part-time
  marital_status    Married, Widowed, Divorced/Sep., Never Married
  sector_label      Private, Public
  union_status      Union, Non-Union
  country           North America, South America, Other
  customer_type     Retail, Wholesale
  company_size      Small, Large
  year              1988, 1996

RAW NUMERIC COLUMNS (can be used as dimensions with limits):
  age               18-65
  educ              Years of education (0-20+)
  numkids           Number of children

MEASURES (for aggregation with .sum, .mean, .min, .max, etc.):
  income            Annual income ($0-$100k+)
  hourly            Hourly wage
  sat               Satisfaction score (1-5)
  numkids           Number of children

STANDALONE AGGREGATIONS:
  count             Row count (use as: count, not field.count)

============================================================
EXAMPLE QUERIES
============================================================

Basic crosstab:
  TABLE ROWS gender * income.sum COLS education;

Multiple aggregates:
  TABLE ROWS occupation * income.(sum | mean) COLS gender;

With totals:
  TABLE ROWS (gender | ALL "Total") * count COLS education | ALL;

Nested hierarchy:
  TABLE ROWS education * employment * income.mean COLS year;

Top-N by value:
  TABLE ROWS occupation[-5@income.sum] * income.sum COLS gender;

Multiple measures:
  TABLE ROWS gender * (income.sum | hourly.mean | count) COLS education;
`);
}

// ============================================================
// Pipeline Execution
// ============================================================

async function runPipeline(tpl: string, stopAt?: OutputMode): Promise<Partial<PipelineResult>> {
  const result: Partial<PipelineResult> = {};

  // Step 1: Parse
  result.ast = parse(tpl);
  if (stopAt === 'ast') return result;

  // Step 2: Build TableSpec
  result.tableSpec = buildTableSpec(result.ast);
  if (stopAt === 'spec') return result;

  // Step 3: Generate QueryPlan
  result.queryPlan = generateQueryPlan(result.tableSpec);
  if (stopAt === 'plan') return result;

  // Step 4: Generate Malloy (uses 'samples' source from SAS data)
  result.malloyQueries = generateMalloyQueries(result.queryPlan, 'samples', {
    where: result.tableSpec.where,
    firstAxis: result.tableSpec.firstAxis,
  });
  if (stopAt === 'malloy') return result;

  // Step 5: Execute queries (requires DuckDB)
  createLocalConnection();

  result.queryResults = new Map();
  for (const queryInfo of result.malloyQueries) {
    const fullMalloy = `${SAMPLES_SOURCE}\n${queryInfo.malloy}`;
    const data = await executeMalloy(fullMalloy);
    result.queryResults.set(queryInfo.id, data);
  }
  if (stopAt === 'data') return result;

  // Step 6: Build GridSpec
  result.gridSpec = buildGridSpec(
    result.tableSpec,
    result.queryPlan,
    result.queryResults,
    result.malloyQueries
  );
  if (stopAt === 'grid') return result;

  // Step 7: Render HTML
  result.html = renderGridToHTML(result.gridSpec);

  return result;
}

// ============================================================
// Output Formatters
// ============================================================

function printAST(ast: any) {
  console.log('=== AST ===');
  console.log(JSON.stringify(ast, null, 2));
}

function printSpec(tableSpec: any) {
  console.log('=== TableSpec ===');
  console.log(printTableSpec(tableSpec));
}

function printPlan(queryPlan: any) {
  console.log('=== QueryPlan ===');
  console.log(printQueryPlan(queryPlan));
}

function printMalloy(malloyQueries: any[]) {
  console.log('=== Malloy Queries ===');
  console.log(`Count: ${malloyQueries.length}\n`);
  for (const q of malloyQueries) {
    console.log(`--- Query ${q.id} ---`);
    console.log(q.malloy);
    console.log('');
  }
}

function printData(queryResults: Map<string, any[]>) {
  console.log('=== Query Results ===');
  for (const [queryId, rows] of queryResults) {
    console.log(`\n--- ${queryId}: ${rows.length} rows ---`);
    // Show first 3 rows with structure
    for (const row of rows.slice(0, 3)) {
      console.log(JSON.stringify(row, null, 2));
    }
    if (rows.length > 3) {
      console.log(`  ... and ${rows.length - 3} more rows`);
    }
  }
}

function printGrid(gridSpec: any) {
  console.log('=== GridSpec ===');
  console.log(printGridSpec(gridSpec));
}

function printHTML(html: string) {
  console.log('=== HTML Output ===');
  console.log(html);
}

// ============================================================
// Main
// ============================================================

async function main() {
  const { mode, tpl } = parseArgs();

  // Handle schema mode (no TPL required)
  if (mode === 'schema') {
    printSchema();
    return;
  }

  console.log(`TPL: ${tpl}`);
  console.log(`Mode: ${mode}\n`);

  try {
    // Determine what to execute based on mode
    const needsExecution = ['grid', 'data', 'html', 'all'].includes(mode);
    const stopAt = mode === 'all' ? undefined : mode;

    const result = await runPipeline(tpl, needsExecution ? undefined : stopAt);

    // Print output based on mode
    switch (mode) {
      case 'ast':
        printAST(result.ast);
        break;

      case 'spec':
        printSpec(result.tableSpec);
        break;

      case 'plan':
        printPlan(result.queryPlan);
        break;

      case 'malloy':
        printMalloy(result.malloyQueries!);
        break;

      case 'data':
        printData(result.queryResults!);
        break;

      case 'grid':
        printGrid(result.gridSpec);
        break;

      case 'html':
        printHTML(result.html!);
        break;

      case 'all':
        printAST(result.ast);
        console.log('\n');
        printSpec(result.tableSpec);
        console.log('\n');
        printPlan(result.queryPlan);
        console.log('\n');
        printMalloy(result.malloyQueries!);
        console.log('\n');
        printData(result.queryResults!);
        console.log('\n');
        printGrid(result.gridSpec);
        console.log('\n');
        printHTML(result.html!);
        break;
    }

  } catch (error) {
    console.error('ERROR:', error);
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack.split('\n').slice(1, 8).join('\n'));
    }
    process.exit(1);
  }
}

main();
