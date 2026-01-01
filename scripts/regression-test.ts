#!/usr/bin/env npx tsx
/**
 * TPL Regression Testing Tool
 *
 * Extracts all TPL examples from docs, runs them, and compares HTML output
 * to detect unexpected changes after code modifications.
 *
 * Usage:
 *   npx tsx scripts/regression-test.ts --baseline    # Generate baseline snapshots
 *   npx tsx scripts/regression-test.ts --check       # Compare against baseline
 *   npx tsx scripts/regression-test.ts --update      # Update changed snapshots
 *   npx tsx scripts/regression-test.ts --list        # List all examples
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parse } from '../dist/parser/index.js';
import {
  buildTableSpec,
  generateQueryPlan,
  generateMalloyQueries,
  buildGridSpec,
} from '../dist/compiler/index.js';
import { renderGridToHTML } from '../dist/renderer/index.js';
import {
  createLocalConnection,
  executeMalloy,
} from '../dist/executor/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(PROJECT_ROOT, 'docs-site');
const SNAPSHOTS_DIR = path.join(PROJECT_ROOT, '.regression-snapshots');

// Samples data source
const SAMPLES_CSV_PATH = path.join(PROJECT_ROOT, 'data/samples/samples.csv');
const SAMPLES_SOURCE = `
source: samples is duckdb.table('${SAMPLES_CSV_PATH}') extend {
  dimension:
    education is
      pick '<HS' when educ < 12
      pick 'HS' when educ = 12
      pick 'College' when educ >= 13
      else null
    education_detail is
      pick '<HS' when educ < 12
      pick 'HS graduate' when educ = 12
      pick 'Some College' when educ >= 13 and educ <= 15
      pick 'College Grad' when educ = 16
      pick 'Some Graduate' when educ >= 17
      else null
  dimension:
    employment is
      pick 'Full-time' when fulltime = 2
      pick 'Part-time' when fulltime >= 3
      else null
  dimension:
    gender is gendchar
  dimension:
    sector_label is
      pick 'Private' when sector = 1 or sector = 5 or sector = 6
      pick 'Public' when sector = 2 or sector = 3 or sector = 4
      else null
  dimension:
    marital_status is
      pick 'Married' when marital >= 1 and marital <= 3
      pick 'Widowed' when marital = 4
      pick 'Divorced/Sep.' when marital = 5 or marital = 6
      pick 'Never Married' when marital = 7
      else null
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
  dimension:
    country is
      pick 'North America' when ctry = 1
      pick 'South America' when ctry = 2
      pick 'Other' when ctry >= 3
      else null
  dimension:
    union_status is
      pick 'Non-Union' when \`union\` = 1
      pick 'Union' when \`union\` = 2
      else null
  dimension:
    customer_type is custtype
    company_size is size
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

interface Example {
  file: string;
  name: string;
  query: string;
  variations?: { label: string; query: string }[];
}

interface Snapshot {
  query: string;
  html: string;
  timestamp: string;
}

interface DiffResult {
  name: string;
  status: 'unchanged' | 'changed' | 'new' | 'error';
  error?: string;
  oldHtml?: string;
  newHtml?: string;
}

// Extract examples from markdown files
function extractExamples(): Example[] {
  const examples: Example[] = [];

  function walkDir(dir: string) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
        walkDir(filePath);
      } else if (file.endsWith('.md')) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const extracted = extractFromMarkdown(content, filePath);
        examples.push(...extracted);
      }
    }
  }

  walkDir(DOCS_DIR);
  return examples;
}

function extractFromMarkdown(content: string, filePath: string): Example[] {
  const examples: Example[] = [];
  const relativePath = path.relative(DOCS_DIR, filePath);

  // Match <Playground initial-query="..." /> components
  const playgroundRegex = /<Playground[^>]*initial-query="([^"]+)"[^>]*(?:\/?>|\/>)/gs;
  let match;
  let index = 0;

  while ((match = playgroundRegex.exec(content)) !== null) {
    const query = match[1]
      .replace(/\\n/g, '\n')  // Unescape newlines
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');

    // Skip placeholder queries
    if (!query.startsWith('TABLE') || query.includes('...') || query.includes('QUERY HERE')) {
      continue;
    }

    // Extract variations if present
    const variationsMatch = match[0].match(/:variations="\[([^\]]+)\]"/);
    let variations: { label: string; query: string }[] | undefined;

    if (variationsMatch) {
      try {
        // This is a simplified parser - real implementation would need proper parsing
        const varContent = variationsMatch[1];
        const varRegex = /\{\s*label:\s*'([^']+)',\s*query:\s*'([^']+)'\s*\}/g;
        variations = [];
        let varMatch;
        while ((varMatch = varRegex.exec(varContent)) !== null) {
          const varQuery = varMatch[2].replace(/\\n/g, '\n');  // Unescape newlines
          // Skip placeholder variations
          if (varQuery.startsWith('TABLE') && !varQuery.includes('...')) {
            variations.push({ label: varMatch[1], query: varQuery });
          }
        }
        if (variations.length === 0) {
          variations = undefined;
        }
      } catch (e) {
        // Ignore parsing errors for variations
      }
    }

    const name = `${relativePath}#${index}`;
    examples.push({ file: relativePath, name, query, variations });
    index++;
  }

  return examples;
}

// Run a TPL query and get HTML output
async function runQuery(query: string): Promise<string> {
  const ast = parse(query);
  const spec = buildTableSpec(ast);
  const plan = generateQueryPlan(spec);
  const malloyQueries = generateMalloyQueries(plan, 'samples', {
    where: spec.where,
    firstAxis: spec.firstAxis,
  });

  const queryResults = new Map<string, any[]>();
  for (const queryInfo of malloyQueries) {
    const fullMalloy = `${SAMPLES_SOURCE}\n${queryInfo.malloy}`;
    const data = await executeMalloy(fullMalloy);
    queryResults.set(queryInfo.id, data);
  }

  const gridSpec = buildGridSpec(spec, plan, queryResults, malloyQueries);
  return renderGridToHTML(gridSpec);
}

// Generate baseline snapshots
async function generateBaseline() {
  console.log('Generating baseline snapshots...\n');

  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  }

  createLocalConnection();

  const examples = extractExamples();
  console.log(`Found ${examples.length} examples\n`);

  const snapshots: Record<string, Snapshot> = {};
  let success = 0;
  let errors = 0;

  for (const example of examples) {
    process.stdout.write(`  ${example.name}... `);

    try {
      const html = await runQuery(example.query);
      snapshots[example.name] = {
        query: example.query,
        html,
        timestamp: new Date().toISOString(),
      };
      console.log('✓');
      success++;

      // Also snapshot variations
      if (example.variations) {
        for (let i = 0; i < example.variations.length; i++) {
          const variation = example.variations[i];
          const varName = `${example.name}:var${i}`;
          process.stdout.write(`    ${variation.label}... `);

          try {
            const varHtml = await runQuery(variation.query);
            snapshots[varName] = {
              query: variation.query,
              html: varHtml,
              timestamp: new Date().toISOString(),
            };
            console.log('✓');
            success++;
          } catch (e) {
            console.log(`✗ ${e instanceof Error ? e.message : String(e)}`);
            errors++;
          }
        }
      }
    } catch (e) {
      console.log(`✗ ${e instanceof Error ? e.message : String(e)}`);
      errors++;
    }
  }

  // Save snapshots
  const snapshotFile = path.join(SNAPSHOTS_DIR, 'baseline.json');
  fs.writeFileSync(snapshotFile, JSON.stringify(snapshots, null, 2));

  console.log(`\nBaseline generated: ${success} snapshots, ${errors} errors`);
  console.log(`Saved to: ${snapshotFile}`);
}

// Check against baseline
async function checkBaseline() {
  console.log('Checking against baseline...\n');

  const snapshotFile = path.join(SNAPSHOTS_DIR, 'baseline.json');
  if (!fs.existsSync(snapshotFile)) {
    console.error('No baseline found. Run with --baseline first.');
    process.exit(1);
  }

  const baseline: Record<string, Snapshot> = JSON.parse(
    fs.readFileSync(snapshotFile, 'utf-8')
  );

  createLocalConnection();

  const results: DiffResult[] = [];
  let unchanged = 0;
  let changed = 0;
  let errors = 0;

  for (const [name, snapshot] of Object.entries(baseline)) {
    process.stdout.write(`  ${name}... `);

    try {
      const newHtml = await runQuery(snapshot.query);

      if (newHtml === snapshot.html) {
        console.log('✓ unchanged');
        results.push({ name, status: 'unchanged' });
        unchanged++;
      } else {
        console.log('⚠ CHANGED');
        results.push({
          name,
          status: 'changed',
          oldHtml: snapshot.html,
          newHtml,
        });
        changed++;
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.log(`✗ ERROR: ${error}`);
      results.push({ name, status: 'error', error });
      errors++;
    }
  }

  console.log(`\nResults: ${unchanged} unchanged, ${changed} changed, ${errors} errors`);

  // Show diffs for changed examples
  if (changed > 0) {
    console.log('\n=== CHANGES DETECTED ===\n');

    for (const result of results) {
      if (result.status === 'changed') {
        console.log(`\n--- ${result.name} ---`);
        console.log('\nQuery:', baseline[result.name].query);
        console.log('\n[Old HTML length:', result.oldHtml?.length, 'chars]');
        console.log('[New HTML length:', result.newHtml?.length, 'chars]');

        // Simple line-by-line diff
        const oldLines = result.oldHtml?.split('\n') || [];
        const newLines = result.newHtml?.split('\n') || [];

        const maxLines = Math.max(oldLines.length, newLines.length);
        let diffCount = 0;

        for (let i = 0; i < maxLines && diffCount < 10; i++) {
          if (oldLines[i] !== newLines[i]) {
            if (oldLines[i]) console.log(`  - ${oldLines[i]}`);
            if (newLines[i]) console.log(`  + ${newLines[i]}`);
            diffCount++;
          }
        }

        if (diffCount >= 10) {
          console.log('  ... (more differences truncated)');
        }
      }
    }

    console.log('\nRun with --update to accept these changes.');
    process.exit(1);
  }
}

// Update snapshots with current output
async function updateSnapshots() {
  console.log('Updating snapshots with current output...\n');

  const snapshotFile = path.join(SNAPSHOTS_DIR, 'baseline.json');
  if (!fs.existsSync(snapshotFile)) {
    console.log('No baseline found. Generating new baseline...');
    await generateBaseline();
    return;
  }

  const baseline: Record<string, Snapshot> = JSON.parse(
    fs.readFileSync(snapshotFile, 'utf-8')
  );

  createLocalConnection();

  let updated = 0;

  for (const [name, snapshot] of Object.entries(baseline)) {
    process.stdout.write(`  ${name}... `);

    try {
      const newHtml = await runQuery(snapshot.query);

      if (newHtml !== snapshot.html) {
        baseline[name] = {
          query: snapshot.query,
          html: newHtml,
          timestamp: new Date().toISOString(),
        };
        console.log('updated');
        updated++;
      } else {
        console.log('unchanged');
      }
    } catch (e) {
      console.log(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  fs.writeFileSync(snapshotFile, JSON.stringify(baseline, null, 2));
  console.log(`\nUpdated ${updated} snapshots`);
}

// List all examples
function listExamples() {
  const examples = extractExamples();
  console.log(`Found ${examples.length} examples:\n`);

  for (const example of examples) {
    console.log(`  ${example.name}`);
    console.log(`    Query: ${example.query}`);

    if (example.variations) {
      console.log(`    Variations: ${example.variations.length}`);
      for (const v of example.variations) {
        console.log(`      - ${v.label}: ${v.query}`);
      }
    }
    console.log();
  }
}

// Main
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--baseline')) {
    await generateBaseline();
  } else if (args.includes('--check')) {
    await checkBaseline();
  } else if (args.includes('--update')) {
    await updateSnapshots();
  } else if (args.includes('--list')) {
    listExamples();
  } else {
    console.log(`
TPL Regression Testing Tool

Usage:
  npx tsx scripts/regression-test.ts --baseline    # Generate baseline snapshots
  npx tsx scripts/regression-test.ts --check       # Compare against baseline
  npx tsx scripts/regression-test.ts --update      # Update changed snapshots
  npx tsx scripts/regression-test.ts --list        # List all examples
`);
  }
}

main().catch(console.error);
