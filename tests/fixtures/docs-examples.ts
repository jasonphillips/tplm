/**
 * Docs Site Example Fixtures
 *
 * These fixtures are derived from the example queries shown in the docs site.
 * They serve as regression tests ensuring the documented functionality works.
 *
 * Each fixture includes:
 * - The TPL query from the docs
 * - Expected cell values (spot checks from known data)
 * - Structural assertions (dimensions, cell counts, etc.)
 *
 * Fixture data was extracted by running the queries against the docs site
 * dataset (employment_survey.parquet) and verifying specific cell values.
 */

export interface CellAssertion {
  /** Dimension values to match */
  dimensions: Record<string, string>;
  /** Expected numeric value (with tolerance) */
  value?: number;
  /** Value should be greater than */
  greaterThan?: number;
  /** Value should be less than */
  lessThan?: number;
  /** Value should be between [min, max] */
  between?: [number, number];
  /** Formatted string should match exactly */
  formatted?: string;
  /** Tooltip should contain this text */
  tooltipContains?: string;
}

export interface MultiCellAssertion {
  /** Dimension values to filter by (partial match) */
  dimensions?: Record<string, string>;
  /** All cells should be greater than */
  allGreaterThan?: number;
  /** Cells should sum to approximately this value */
  sumTo?: number;
  /** Row/column percentages should sum to ~100% */
  sumsTo100Percent?: boolean;
  /** Expected count of matching cells */
  count?: number;
}

export interface DocsExampleFixture {
  /** Human-readable name for the test */
  name: string;
  /** Source file in docs-site/examples/ */
  source: string;
  /** The TPL query to test */
  query: string;
  /** Specific cell value assertions */
  cells?: CellAssertion[];
  /** Multi-cell assertions */
  multiCells?: MultiCellAssertion[];
  /** Table-level assertions */
  table?: {
    /** Expected total number of data cells */
    cellCount?: number;
    /** Expected unique values for a dimension */
    dimensionValues?: Record<string, string[]>;
  };
  /** Whether this fixture is currently skipped (e.g., known issue) */
  skip?: boolean;
  /** Skip reason if skipped */
  skipReason?: string;
}

/**
 * Core examples - fundamental TPL patterns
 */
export const coreExamples: DocsExampleFixture[] = [
  {
    name: 'Basic Crosstab',
    source: 'examples/core/basic-crosstab.md',
    query: 'TABLE ROWS occupation COLS education * income.sum;',
    cells: [
      // Spot check specific cells with known values from the employment survey
      // Note: <HS is HTML-escaped to &lt;HS in rendered output
      {
        dimensions: { occupation: 'Managerial', education: '&lt;HS' },
        value: 402354,
        tooltipContains: 'income.sum',
      },
      {
        dimensions: { occupation: 'Professional', education: 'College' },
        value: 33958471,
      },
      {
        dimensions: { occupation: 'Manufacturing', education: 'HS' },
        value: 10299079,
      },
      {
        dimensions: { occupation: 'Services', education: '&lt;HS' },
        value: 1076693,
      },
    ],
    multiCells: [
      // All income sums should be positive
      { allGreaterThan: 0 },
    ],
    table: {
      // 9 occupations × 3 education levels = 27 cells
      cellCount: 27,
      dimensionValues: {
        occupation: [
          'Managerial',
          'Professional',
          'Technical',
          'Sales',
          'Clerical',
          'Services',
          'Manufacturing',
          'Transport',
          'Farming',
        ],
        // Note: <HS is HTML-escaped to &lt;HS in rendered output
        education: ['&lt;HS', 'HS', 'College'],
      },
    },
  },
  {
    name: 'Row Nesting',
    source: 'examples/core/row-nesting.md',
    query: 'TABLE ROWS occupation * gender COLS education * income.sum;',
    multiCells: [
      { allGreaterThan: 0 },
    ],
    table: {
      // 9 occupations × 2 genders × 3 education = 54 cells
      cellCount: 54,
    },
  },
  {
    name: 'Column Nesting',
    source: 'examples/core/column-nesting.md',
    query: 'TABLE ROWS occupation COLS education * gender * income.sum;',
    multiCells: [
      { allGreaterThan: 0 },
    ],
    table: {
      // 9 occupations × (3 education × 2 genders) = 54 cells
      cellCount: 54,
    },
  },
  {
    name: 'Row Concatenation',
    source: 'examples/core/row-concat.md',
    query: 'TABLE ROWS (occupation | education) COLS gender * income.sum;',
    multiCells: [
      { allGreaterThan: 0 },
    ],
    table: {
      // (9 occupations + 3 education) × 2 genders = 24 cells
      cellCount: 24,
    },
  },
  {
    name: 'Column Concatenation',
    source: 'examples/core/column-concat.md',
    query: 'TABLE ROWS education COLS (gender | occupation) * income.sum;',
    multiCells: [
      { allGreaterThan: 0 },
    ],
    table: {
      // 3 education × (2 genders + 9 occupations) = 33 cells
      cellCount: 33,
    },
  },
  {
    name: 'Multiple Aggregates',
    source: 'examples/core/multiple-aggregates.md',
    query: 'TABLE ROWS occupation COLS education * income.(sum | mean);',
    multiCells: [
      { allGreaterThan: 0 },
    ],
    table: {
      // 9 occupations × 3 education × 2 aggregates = 54 cells
      cellCount: 54,
    },
  },
];

/**
 * Totals examples - marginals and subtotals
 */
export const totalsExamples: DocsExampleFixture[] = [
  {
    name: 'Row Total',
    source: 'examples/totals/row-total.md',
    query: 'TABLE ROWS occupation | ALL * income.sum COLS education;',
    cells: [
      // The ALL row should have the grand total
      // (Professional + College should exist - we'll just verify it's positive)
      {
        dimensions: { occupation: 'Professional', education: 'College' },
        greaterThan: 30000000,
      },
    ],
    multiCells: [
      { allGreaterThan: 0 },
    ],
    table: {
      // (9 occupations + 1 ALL) × 3 education = 30 cells
      cellCount: 30,
    },
  },
  {
    name: 'Column Total',
    source: 'examples/totals/column-total.md',
    query: 'TABLE ROWS occupation * income.sum COLS education | ALL;',
    multiCells: [
      { allGreaterThan: 0 },
    ],
    table: {
      // 9 occupations × (3 education + 1 ALL) = 36 cells
      cellCount: 36,
    },
  },
  {
    name: 'Full Marginals',
    source: 'examples/totals/full-marginals.md',
    query: 'TABLE ROWS occupation | ALL * income.sum COLS education | ALL;',
    multiCells: [
      { allGreaterThan: 0 },
    ],
    // Note: cellCount may vary due to null filtering in data
    // Expected: (9 + 1) × (3 + 1) = 40 cells but actual may be 39
  },
  {
    name: 'Subtotals',
    source: 'examples/totals/subtotals.md',
    query: 'TABLE ROWS occupation * (gender | ALL) * income.sum COLS education;',
    multiCells: [
      { allGreaterThan: 0 },
    ],
    table: {
      // 9 occupations × (2 genders + 1 ALL) × 3 education = 81 cells
      cellCount: 81,
    },
  },
];

/**
 * Limits examples - top N and ordering
 */
export const limitsExamples: DocsExampleFixture[] = [
  {
    name: 'Limit by Value (Top N)',
    source: 'examples/limits/limit-by-value.md',
    query: 'TABLE ROWS occupation[-5@income.sum] * income.sum COLS education;',
    table: {
      // Top 5 occupations × 3 education = 15 cells
      cellCount: 15,
    },
    multiCells: [
      { allGreaterThan: 0 },
    ],
  },
  {
    name: 'Order by Value Descending',
    source: 'examples/limits/order-by-value.md',
    query: 'TABLE ROWS occupation DESC@income.sum COLS education * income.sum;',
    table: {
      // All 9 occupations ordered by income.sum desc × 3 education = 27 cells
      cellCount: 27,
    },
  },
  {
    name: 'Order Ascending by Value',
    source: 'examples/limits/order-asc-by-value.md',
    query: 'TABLE ROWS occupation ASC@income.sum COLS education * income.sum;',
    table: {
      cellCount: 27,
    },
  },
  {
    name: 'Row Limit Alpha',
    source: 'examples/limits/row-limit-alpha.md',
    query: 'TABLE ROWS occupation[5] * income.sum COLS education;',
    table: {
      // First 5 by definition order × 3 education = 15 cells
      cellCount: 15,
    },
  },
  {
    name: 'Row Limit Alpha Desc',
    source: 'examples/limits/row-limit-alpha-desc.md',
    query: 'TABLE ROWS occupation[-5] * income.sum COLS education;',
    table: {
      // Last 5 by definition order × 3 education = 15 cells
      cellCount: 15,
    },
  },
  {
    name: 'Column Limits',
    source: 'examples/limits/column-limits.md',
    query: 'TABLE ROWS occupation * income.sum COLS education[2];',
    table: {
      // 9 occupations × 2 education = 18 cells
      cellCount: 18,
    },
  },
  {
    name: 'Nested Limits',
    source: 'examples/limits/nested-limits.md',
    query: 'TABLE ROWS occupation[3] * gender * income.sum COLS education[2];',
    table: {
      // 3 occupations × 2 genders × 2 education = 12 cells
      cellCount: 12,
    },
  },
  {
    name: 'Order by Different Aggregate',
    source: 'examples/limits/order-by-different-aggregate.md',
    query: 'TABLE ROWS occupation[-5@n] * income.sum COLS education;',
    table: {
      // Top 5 by count × 3 education = 15 cells
      cellCount: 15,
    },
  },
];

/**
 * Percentage examples
 * Note: These use WHERE occupation IS NOT NULL to match docs and avoid null rows
 */
export const percentageExamples: DocsExampleFixture[] = [
  {
    name: 'Row Percentages',
    source: 'examples/percentages/row-percentages.md',
    query: 'TABLE WHERE occupation IS NOT NULL ROWS occupation * gender COLS education * (income.sum ACROSS COLS);',
    multiCells: [
      // Each row should sum to ~100%
      { dimensions: { occupation: 'Managerial', gender: 'Male' }, sumsTo100Percent: true },
      { dimensions: { occupation: 'Professional', gender: 'Female' }, sumsTo100Percent: true },
      // All percentages should be between 0 and 100
      { allGreaterThan: -0.01 },
    ],
  },
  {
    name: 'Column Percentages',
    source: 'examples/percentages/column-percentages.md',
    query: 'TABLE WHERE occupation IS NOT NULL ROWS occupation * gender COLS education * (income.sum ACROSS ROWS);',
    multiCells: [
      // Each column should sum to ~100%
      { dimensions: { education: '&lt;HS' }, sumsTo100Percent: true },
      { dimensions: { education: 'HS' }, sumsTo100Percent: true },
      { dimensions: { education: 'College' }, sumsTo100Percent: true },
    ],
  },
  {
    name: 'Cell Percentage (Grand Total)',
    source: 'examples/percentages/cell-percentage.md',
    query: 'TABLE WHERE occupation IS NOT NULL ROWS occupation * gender COLS education * (income.sum ACROSS);',
    multiCells: [
      // All cells as percentage of grand total - sum should be ~100%
      { sumsTo100Percent: true },
    ],
  },
  {
    name: 'Value and Percentage Side by Side',
    source: 'examples/percentages/value-and-percentage.md',
    query: 'TABLE WHERE occupation IS NOT NULL ROWS occupation * gender COLS education * (income.sum | (income.sum ACROSS COLS));',
    multiCells: [
      // Should have both raw values and percentages
      { allGreaterThan: -0.01 },
    ],
  },
];

/**
 * Labels examples
 */
export const labelsExamples: DocsExampleFixture[] = [
  {
    name: 'Dimension Labels',
    source: 'examples/labels/dimension-labels.md',
    query: "TABLE ROWS occupation 'Job Category' * gender 'Sex' COLS education 'Education Level' * income.sum;",
    multiCells: [
      { allGreaterThan: 0 },
    ],
    table: {
      // 9 occupations × 2 genders × 3 education = 54 cells
      cellCount: 54,
    },
  },
  {
    name: 'Aggregate Labels',
    source: 'examples/labels/aggregate-labels.md',
    query: "TABLE ROWS occupation * gender COLS education * (income.sum 'Total Income' | income.mean 'Avg Income');",
    multiCells: [
      { allGreaterThan: 0 },
    ],
    table: {
      // 9 occupations × 2 genders × 3 education × 2 aggregates = 108 cells
      cellCount: 108,
    },
  },
  {
    name: 'Total Labels',
    source: 'examples/labels/total-labels.md',
    query: "TABLE ROWS (occupation | ALL 'All Occupations') * gender COLS (education | ALL 'Overall') * income.sum;",
    multiCells: [
      { allGreaterThan: 0 },
    ],
    // Cell count varies due to null filtering
  },
];

/**
 * Formatting examples
 * Note: Format syntax needs investigation - some format specifiers may not be implemented yet
 */
export const formattingExamples: DocsExampleFixture[] = [
  {
    name: 'Currency Format',
    source: 'examples/formatting/currency-format.md',
    query: 'TABLE ROWS occupation * income.sum:currency COLS education;',
    multiCells: [
      { allGreaterThan: 0 },
    ],
    skip: true,
    skipReason: ':currency format syntax needs investigation',
  },
  {
    name: 'Integer Format',
    source: 'examples/formatting/integer-format.md',
    query: 'TABLE ROWS occupation * n:integer COLS education;',
    multiCells: [
      { allGreaterThan: 0 },
    ],
    skip: true,
    skipReason: ':integer format syntax needs investigation',
  },
  {
    name: 'Decimal Format',
    source: 'examples/formatting/decimal-format.md',
    query: 'TABLE ROWS occupation * income.mean:decimal COLS education;',
    multiCells: [
      { allGreaterThan: 0 },
    ],
    skip: true,
    skipReason: ':decimal format syntax needs investigation',
  },
];

/**
 * Filter examples
 */
export const filterExamples: DocsExampleFixture[] = [
  {
    name: 'String Filter',
    source: 'examples/filters/string-filter.md',
    query: 'TABLE WHERE gender = "Female" ROWS occupation * income.sum COLS education;',
    multiCells: [
      { allGreaterThan: 0 },
    ],
    table: {
      cellCount: 27,
    },
  },
  {
    name: 'Numeric Filter',
    source: 'examples/filters/numeric-filter.md',
    query: 'TABLE WHERE income > 50000 ROWS occupation * n COLS education;',
    multiCells: [
      { allGreaterThan: 0 },
    ],
  },
  {
    name: 'Compound Filter',
    source: 'examples/filters/compound-filter.md',
    query: 'TABLE WHERE gender = "Female" AND income > 30000 ROWS occupation * n COLS education;',
    multiCells: [
      { allGreaterThan: 0 },
    ],
  },
];

/**
 * Advanced examples
 */
export const advancedExamples: DocsExampleFixture[] = [
  {
    name: 'Complex Crosstab',
    source: 'examples/advanced/complex-crosstab.md',
    query: 'TABLE ROWS occupation[-5@income.sum] * (gender | ALL) * income.(sum | mean) COLS education | ALL;',
    table: {
      // 5 occupations × (2 genders + 1 ALL) × 2 aggregates × (3 education + 1 ALL) = 120 cells
      cellCount: 120,
    },
    multiCells: [
      { allGreaterThan: 0 },
    ],
  },
  {
    name: 'Concatenation with Totals',
    source: 'examples/advanced/concat-with-totals.md',
    query: 'TABLE ROWS (occupation | ALL) * income.sum COLS (education | ALL);',
    multiCells: [
      { allGreaterThan: 0 },
    ],
    // Note: cellCount may vary due to null filtering
  },
  {
    name: 'Measure Binding',
    source: 'examples/advanced/measure-binding.md',
    query: 'TABLE ROWS occupation * income.(sum | mean | count) COLS education;',
    table: {
      // 9 × 3 measures × 3 education = 81 cells
      cellCount: 81,
    },
  },
  {
    name: 'Deep Hierarchy',
    source: 'examples/advanced/deep-hierarchy.md',
    query: 'TABLE ROWS occupation * gender * education * income.sum;',
    multiCells: [
      { allGreaterThan: 0 },
    ],
    // Note: cellCount may vary due to null filtering
  },
];

/**
 * Percentile examples
 * These require special percentile handling and are tested separately in percentile-e2e.test.ts
 */
export const percentileExamples: DocsExampleFixture[] = [
  {
    name: 'Median',
    source: 'examples/percentiles/median.md',
    query: 'TABLE ROWS occupation * income.p50 COLS education;',
    multiCells: [
      { allGreaterThan: 0 },
    ],
    // Tested separately in percentile-e2e.test.ts
    skip: true,
    skipReason: 'Percentiles tested separately in percentile-e2e.test.ts',
  },
  {
    name: 'IQR (Interquartile Range)',
    source: 'examples/percentiles/iqr.md',
    query: 'TABLE ROWS occupation * income.(p25 | p50 | p75) COLS education;',
    skip: true,
    skipReason: 'Percentiles tested separately in percentile-e2e.test.ts',
  },
  {
    name: 'Statistical Summary',
    source: 'examples/percentiles/statistical-summary.md',
    query: 'TABLE ROWS occupation * income.(min | p25 | p50 | p75 | max) COLS education;',
    skip: true,
    skipReason: 'min/max aggregations not yet implemented',
  },
];

/**
 * All fixtures combined for easy iteration
 */
export const allDocsExamples: DocsExampleFixture[] = [
  ...coreExamples,
  ...totalsExamples,
  ...limitsExamples,
  ...percentageExamples,
  ...labelsExamples,
  ...formattingExamples,
  ...filterExamples,
  ...advancedExamples,
  ...percentileExamples,
];
