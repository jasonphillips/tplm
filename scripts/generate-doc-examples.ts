#!/usr/bin/env npx tsx
/**
 * Documentation Example Generator
 *
 * Generates TPL examples with HTML output for documentation.
 * Uses the employment survey dataset (data/samples/samples.csv).
 *
 * Usage:
 *   npx tsx scripts/generate-doc-examples.ts                    # Generate all examples
 *   npx tsx scripts/generate-doc-examples.ts --category basics  # Generate specific category
 *   npx tsx scripts/generate-doc-examples.ts --list             # List all examples
 *   npx tsx scripts/generate-doc-examples.ts --tpl "TABLE ..."  # Generate single TPL
 *
 * Output goes to public_docs/examples/<category>/
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

// ============================================================
// Malloy Source (Employment Survey - 6,639 records)
// ============================================================

const SAMPLES_SOURCE = fs.readFileSync(
  path.join(PROJECT_ROOT, 'data/samples/samples.malloy'),
  'utf-8'
);

// ============================================================
// Example Definitions
// ============================================================

interface Example {
  id: string;
  title: string;
  description: string;
  tpl: string;
  category: string;
}

const EXAMPLES: Example[] = [
  // ============================================================
  // CORE CONCEPTS - Nesting, Hierarchy, Crosstabs (TPL fundamentals)
  // ============================================================
  {
    id: 'basic-crosstab',
    title: 'Basic Crosstab',
    description: 'The fundamental TPL pattern: row dimensions crossed with column dimensions.',
    tpl: 'TABLE ROWS occupation COLS education * income.sum;',
    category: 'core',
  },
  {
    id: 'row-nesting',
    title: 'Row Nesting',
    description: 'The * operator nests dimensions to create hierarchies. Here occupation contains gender.',
    tpl: 'TABLE ROWS occupation * gender COLS education * income.sum;',
    category: 'core',
  },
  {
    id: 'column-nesting',
    title: 'Column Nesting',
    description: 'Nesting works on columns too. Education contains gender as sub-columns.',
    tpl: 'TABLE ROWS occupation COLS education * gender * income.sum;',
    category: 'core',
  },
  {
    id: 'row-concat',
    title: 'Row Concatenation',
    description: 'The | operator creates sibling sections. Occupation section followed by education section.',
    tpl: 'TABLE ROWS (occupation | education) COLS gender * income.sum;',
    category: 'core',
  },
  {
    id: 'column-concat',
    title: 'Column Concatenation',
    description: 'Concatenation on columns creates side-by-side column groups.',
    tpl: 'TABLE ROWS occupation * education COLS gender | sector_label * income.sum;',
    category: 'core',
  },
  {
    id: 'multiple-aggregates',
    title: 'Multiple Aggregates',
    description: 'Use | to show multiple aggregates as sibling columns.',
    tpl: 'TABLE ROWS occupation * gender COLS education * income.(sum | mean);',
    category: 'core',
  },

  // ============================================================
  // TOTALS - Using ALL for marginals and subtotals
  // ============================================================
  {
    id: 'row-total',
    title: 'Row Total',
    description: 'ALL adds a total row. Parentheses group the dimension with its total.',
    tpl: 'TABLE WHERE occupation IS NOT NULL ROWS (occupation | ALL) COLS education * gender * income.sum;',
    category: 'totals',
  },
  {
    id: 'column-total',
    title: 'Column Total',
    description: 'ALL on columns adds a total column at the end.',
    tpl: 'TABLE ROWS occupation * gender COLS (education | ALL) * income.sum;',
    category: 'totals',
  },
  {
    id: 'labeled-totals',
    title: 'Labeled Totals',
    description: 'Custom labels make totals clearer in complex tables.',
    tpl: 'TABLE WHERE occupation IS NOT NULL ROWS (occupation | ALL "All Jobs") * gender COLS (education | ALL "Total") * income.sum;',
    category: 'totals',
  },
  {
    id: 'subtotals',
    title: 'Nested Subtotals',
    description: 'ALL at inner nesting levels creates subtotals per parent group.',
    tpl: 'TABLE ROWS occupation * (gender | ALL) COLS (education | ALL) * income.sum;',
    category: 'totals',
  },
  {
    id: 'full-marginals',
    title: 'Full Marginals',
    description: 'Complete table with both row and column totals plus subtotals.',
    tpl: 'TABLE WHERE occupation IS NOT NULL ROWS (occupation | ALL) * (gender | ALL) COLS (education | ALL) * income.sum;',
    category: 'totals',
  },

  // ============================================================
  // LIMITS - Controlling which dimension values appear
  // ============================================================
  {
    id: 'row-limit-alpha',
    title: 'Alphabetic Limit',
    description: 'Positive limit [N] shows first N values alphabetically.',
    tpl: 'TABLE ROWS occupation[5] COLS education * gender * income.sum;',
    category: 'limits',
  },
  {
    id: 'row-limit-alpha-desc',
    title: 'Reverse Alphabetic Limit',
    description: 'Negative limit [-N] shows last N values alphabetically (descending).',
    tpl: 'TABLE ROWS occupation[-5] COLS education * gender * income.sum;',
    category: 'limits',
  },
  {
    id: 'limit-by-value',
    title: 'Top N by Value',
    description: 'Use @aggregate to order by value instead of alphabetically. Top 5 occupations by income.',
    tpl: 'TABLE ROWS occupation[-5@income.sum] COLS education * gender * income.sum;',
    category: 'limits',
  },
  {
    id: 'nested-limits',
    title: 'Nested Limits',
    description: 'Limits at multiple nesting levels. Top 3 occupations, then top 2 education levels within each.',
    tpl: 'TABLE ROWS occupation[-3@income.sum] * education[-2@income.sum] COLS gender * income.sum;',
    category: 'limits',
  },
  {
    id: 'column-limits',
    title: 'Column Limits',
    description: 'Limits work on column dimensions too.',
    tpl: 'TABLE ROWS occupation * gender COLS education[-2] * income.sum;',
    category: 'limits',
  },
  {
    id: 'order-by-value',
    title: 'Order by Value (Descending)',
    description: 'DESC@aggregate orders by value descending without limiting.',
    tpl: 'TABLE ROWS occupation DESC@income.sum COLS education * income.sum;',
    category: 'limits',
  },
  {
    id: 'order-asc-by-value',
    title: 'Order by Value (Ascending)',
    description: 'ASC@aggregate orders by value ascending without limiting.',
    tpl: 'TABLE ROWS occupation ASC@income.sum COLS education * income.sum;',
    category: 'limits',
  },
  {
    id: 'order-by-different-aggregate',
    title: 'Order by Different Aggregate',
    description: 'Order rows by one aggregate while displaying another.',
    tpl: 'TABLE ROWS occupation DESC@income.sum COLS education * income.mean;',
    category: 'limits',
  },
  {
    id: 'order-by-code-column',
    title: 'Order by Underlying Code',
    description: 'When labels are derived from codes, order by the original code to get natural ordering. Here education_detail labels would sort wrong alphabetically, but ordering by educ.min gives the natural education progression.',
    tpl: 'TABLE ROWS education_detail ASC@educ.min COLS gender * income.sum;',
    category: 'limits',
  },

  // ============================================================
  // PERCENTAGES - ACROSS for ratios and percentages
  // ============================================================
  {
    id: 'cell-percentage',
    title: 'Cell Percentage',
    description: 'ACROSS with no scope calculates each cell as % of grand total. All cells sum to 100%.',
    tpl: 'TABLE WHERE occupation IS NOT NULL ROWS occupation * gender COLS education * (income.sum ACROSS);',
    category: 'percentages',
  },
  {
    id: 'row-percentages',
    title: 'Row Percentages',
    description: 'ACROSS COLS makes each row sum to 100% across its columns.',
    tpl: 'TABLE WHERE occupation IS NOT NULL ROWS occupation * gender COLS education * (income.sum ACROSS COLS);',
    category: 'percentages',
  },
  {
    id: 'column-percentages',
    title: 'Column Percentages',
    description: 'ACROSS ROWS makes each column sum to 100% down its rows.',
    tpl: 'TABLE WHERE occupation IS NOT NULL ROWS occupation * gender COLS education * (income.sum ACROSS ROWS);',
    category: 'percentages',
  },
  {
    id: 'value-and-percentage',
    title: 'Value and Percentage',
    description: 'Show both raw value and percentage side by side using concatenation.',
    tpl: 'TABLE WHERE occupation IS NOT NULL ROWS occupation * gender COLS education * (income.sum | (income.sum ACROSS COLS));',
    category: 'percentages',
  },

  // ============================================================
  // LABELS - Custom display names
  // ============================================================
  {
    id: 'dimension-labels',
    title: 'Dimension Labels',
    description: 'Quoted strings after dimensions provide display labels.',
    tpl: 'TABLE ROWS occupation "Job Category" * gender "Sex" COLS education "Education Level" * income.sum;',
    category: 'labels',
  },
  {
    id: 'aggregate-labels',
    title: 'Aggregate Labels',
    description: 'Labels on aggregates clarify what each column shows.',
    tpl: 'TABLE ROWS occupation * gender COLS education * (income.sum "Total Income" | income.mean "Avg Income");',
    category: 'labels',
  },
  {
    id: 'total-labels',
    title: 'Total Labels',
    description: 'Labels on ALL make totals more readable.',
    tpl: 'TABLE ROWS (occupation | ALL "All Occupations") * gender COLS (education | ALL "Overall") * income.sum;',
    category: 'labels',
  },

  // ============================================================
  // FORMATTING - Display formats for values
  // ============================================================
  {
    id: 'currency-format',
    title: 'Currency Format',
    description: 'The :currency format adds $ and thousands separators.',
    tpl: 'TABLE ROWS occupation * gender COLS education * income.sum:currency;',
    category: 'formatting',
  },
  {
    id: 'decimal-format',
    title: 'Decimal Precision',
    description: 'Control decimal places with :decimal.N syntax.',
    tpl: 'TABLE ROWS occupation * gender COLS education * income.mean:decimal.2;',
    category: 'formatting',
  },
  {
    id: 'integer-format',
    title: 'Integer Format',
    description: 'The :integer format removes decimals and adds thousands separators.',
    tpl: 'TABLE ROWS occupation * gender COLS education * income.sum:integer;',
    category: 'formatting',
  },
  {
    id: 'multiple-formats',
    title: 'Multiple Formats',
    description: 'Different formats can be applied to different aggregates.',
    tpl: 'TABLE ROWS occupation * gender COLS education * (income.sum:currency | income.mean:decimal.2);',
    category: 'formatting',
  },

  // ============================================================
  // FILTERS - WHERE clause for data subsetting
  // ============================================================
  {
    id: 'string-filter',
    title: 'String Filter',
    description: 'WHERE clause filters data before aggregation.',
    tpl: "TABLE WHERE gender = 'Female' ROWS occupation * education COLS sector_label * income.sum;",
    category: 'filters',
  },
  {
    id: 'numeric-filter',
    title: 'Numeric Filter',
    description: 'Numeric comparisons filter to specific value ranges.',
    tpl: 'TABLE WHERE income > 50000 ROWS occupation * gender COLS education * income.mean;',
    category: 'filters',
  },
  {
    id: 'compound-filter',
    title: 'Compound Filter',
    description: 'Multiple conditions combined with AND.',
    tpl: "TABLE WHERE gender = 'Male' and sector_label = 'Private' ROWS occupation * education COLS employment * income.sum;",
    category: 'filters',
  },

  // ============================================================
  // ADVANCED - Complex combinations
  // ============================================================
  {
    id: 'measure-binding',
    title: 'Measure Binding',
    description: 'Bind multiple measures to multiple aggregations with (measures).(aggregations) syntax.',
    tpl: 'TABLE ROWS occupation * gender COLS education * (income | hourly).(sum | mean);',
    category: 'advanced',
  },
  {
    id: 'deep-hierarchy',
    title: 'Deep Hierarchy',
    description: 'Multiple nesting levels with limits and totals.',
    tpl: 'TABLE WHERE occupation IS NOT NULL ROWS (occupation[-5@income.sum] | ALL) * (gender | ALL) COLS (education | ALL) * income.sum;',
    category: 'advanced',
  },
  {
    id: 'complex-crosstab',
    title: 'Complex Crosstab',
    description: 'Full-featured table combining nesting, totals, limits, and multiple aggregates.',
    tpl: 'TABLE WHERE occupation IS NOT NULL ROWS (sector_label | ALL) * occupation[-3@income.sum] * gender COLS (education | ALL) * (income.sum:currency | income.mean:decimal.2);',
    category: 'advanced',
  },
  {
    id: 'concat-with-totals',
    title: 'Concatenation with Totals',
    description: 'Multiple sections each with their own totals.',
    tpl: 'TABLE WHERE occupation IS NOT NULL ROWS ((occupation | ALL "Occ Total") | (education | ALL "Edu Total")) * gender COLS sector_label * income.sum;',
    category: 'advanced',
  },
];

// ============================================================
// Generation Functions
// ============================================================

async function generateHTML(tpl: string): Promise<string> {
  const ast = parse(tpl);
  const tableSpec = buildTableSpec(ast);
  const queryPlan = generateQueryPlan(tableSpec);
  const malloyQueries = generateMalloyQueries(queryPlan, 'samples', {
    where: tableSpec.where,
    firstAxis: tableSpec.firstAxis,
  });

  const queryResults = new Map<string, any[]>();
  for (const queryInfo of malloyQueries) {
    const fullMalloy = `${SAMPLES_SOURCE}\n${queryInfo.malloy}`;
    const data = await executeMalloy(fullMalloy);
    queryResults.set(queryInfo.id, data);
  }

  const gridSpec = buildGridSpec(tableSpec, queryPlan, queryResults, malloyQueries);
  return renderGridToHTML(gridSpec);
}

function generateMarkdown(example: Example, html: string): string {
  return `## ${example.title}

${example.description}

### TPL Code

\`\`\`sql
${example.tpl}
\`\`\`

### Output

<div class="tpl-example">
${html}
</div>
`;
}

async function generateExample(example: Example): Promise<void> {
  console.log(`  Generating: ${example.category}/${example.id}`);

  try {
    const html = await generateHTML(example.tpl);
    const markdown = generateMarkdown(example, html);

    const outputDir = path.join(PROJECT_ROOT, 'public_docs/examples', example.category);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, `${example.id}.md`), markdown);
  } catch (error: any) {
    console.error(`  ERROR: ${example.id} - ${error.message}`);
  }
}

async function generateCategory(category: string): Promise<void> {
  const examples = EXAMPLES.filter(e => e.category === category);
  console.log(`\nGenerating ${examples.length} examples for category: ${category}`);

  for (const example of examples) {
    await generateExample(example);
  }
}

async function generateAll(): Promise<void> {
  const categories = [...new Set(EXAMPLES.map(e => e.category))];
  console.log(`Generating all ${EXAMPLES.length} examples across ${categories.length} categories`);

  for (const category of categories) {
    await generateCategory(category);
  }

  console.log('\nDone!');
}

async function generateSingleTPL(tpl: string): Promise<void> {
  console.log('TPL:', tpl);
  console.log('');

  try {
    const html = await generateHTML(tpl);
    console.log('=== Generated HTML ===');
    console.log(html);
  } catch (error: any) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }
}

function listExamples(): void {
  const categories = [...new Set(EXAMPLES.map(e => e.category))];

  for (const category of categories) {
    console.log(`\n${category.toUpperCase()}`);
    console.log('─'.repeat(40));

    const examples = EXAMPLES.filter(e => e.category === category);
    for (const ex of examples) {
      console.log(`  ${ex.id}: ${ex.title}`);
      console.log(`    ${ex.tpl}`);
    }
  }

  console.log(`\nTotal: ${EXAMPLES.length} examples`);
}

// ============================================================
// CLI
// ============================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Generate all examples
    createLocalConnection();
    await generateAll();
    return;
  }

  if (args[0] === '--list') {
    listExamples();
    return;
  }

  if (args[0] === '--category' && args[1]) {
    createLocalConnection();
    await generateCategory(args[1]);
    return;
  }

  if (args[0] === '--tpl' && args[1]) {
    createLocalConnection();
    await generateSingleTPL(args[1]);
    return;
  }

  // Treat as TPL query
  createLocalConnection();
  await generateSingleTPL(args[0]);
}

main().catch(console.error);
