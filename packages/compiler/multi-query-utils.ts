/**
 * compiler utilities - escaping, formatting, malloy expression building
 */

import type { FormatSpec } from '../parser/ast.js';

// ---
// RESERVED WORDS
// ---

/**
 * Malloy reserved words that need escaping when used as identifiers
 */
export const MALLOY_RESERVED_WORDS = new Set([
  'all', 'and', 'as', 'asc', 'avg', 'by', 'case', 'cast', 'compose',
  'count', 'day', 'desc', 'dimension', 'else', 'end', 'exclude',
  'extend', 'false', 'from', 'group', 'having', 'hour', 'import',
  'is', 'join', 'limit', 'max', 'measure', 'min', 'minute', 'month',
  'nest', 'not', 'now', 'null', 'number', 'on', 'or', 'order', 'pick',
  'query', 'quarter', 'run', 'second', 'select', 'source', 'sum',
  'true', 'ungrouped', 'view', 'week', 'when', 'where', 'with', 'year',
]);

// ---
// FIELD NAME ESCAPING
// ---

/**
 * Escape a field name if it's a Malloy reserved word
 */
export function escapeFieldName(name: string): string {
  if (MALLOY_RESERVED_WORDS.has(name.toLowerCase())) {
    return `\`${name}\``;
  }
  return name;
}

/**
 * Escape reserved words in a WHERE expression string.
 * This finds bare identifiers and wraps reserved words in backticks.
 */
export function escapeWhereExpression(expr: string): string {
  // SQL keywords/operators we want to preserve (not escape)
  const sqlKeywords = new Set(['and', 'or', 'not', 'is', 'null', 'true', 'false', 'in', 'like', 'between']);

  // Simple tokenizer: split by operators and whitespace, keeping them
  const tokens = expr.split(/(\s+|>=|<=|!=|<>|[=<>(),]|'[^']*')/);

  return tokens.map(token => {
    // Skip whitespace, operators, quoted strings, empty
    if (!token || /^\s*$/.test(token) || /^[=<>(),]|^>=|^<=|^!=|^<>/.test(token) || /^'.*'$/.test(token)) {
      return token;
    }
    // Skip SQL keywords
    if (sqlKeywords.has(token.toLowerCase())) {
      return token;
    }
    // Skip numbers
    if (/^\d+(\.\d+)?$/.test(token)) {
      return token;
    }
    // Skip already backticked
    if (/^`.*`$/.test(token)) {
      return token;
    }
    // Escape if reserved word
    if (MALLOY_RESERVED_WORDS.has(token.toLowerCase())) {
      return `\`${token}\``;
    }
    return token;
  }).join('');
}

// ---
// AGGREGATE EXPRESSION BUILDING
// ---

/**
 * Map of TPL aggregation methods to Malloy methods
 */
const AGG_METHOD_MAP: Record<string, string> = {
  sum: 'sum',
  mean: 'avg',
  count: 'count',
  min: 'min',
  max: 'max',
  median: 'median',
  stdev: 'stddev',
  pct: 'sum',
  pctn: 'count',
  pctsum: 'sum',
};

/**
 * Build a Malloy aggregate expression from measure and aggregation
 */
export function buildAggExpression(measure: string, aggregation: string): string {
  const malloyMethod = AGG_METHOD_MAP[aggregation] ?? aggregation;

  // Handle count - in Malloy, count() doesn't take a measure argument
  // count() counts all rows, not a specific field
  // When users write "income.count" or "income.n", they semantically mean "count"
  // since you can't "count" a measure - you can only count rows
  if (aggregation === 'count') {
    return 'count()';
  }

  // Handle other aggregations without a measure (use placeholder)
  // Also handle the __pending__ placeholder used for standalone count
  if (!measure || measure === '__pending__') {
    return 'count()';
  }

  return `${measure}.${malloyMethod}()`;
}

/**
 * Build a Malloy percentage aggregate expression.
 *
 * Uses Malloy's all() function to compute denominators:
 * - ACROSS ALL: 100.0 * agg() / all(agg())
 * - ACROSS ROWS: 100.0 * agg() / all(agg(), row_dims...)
 * - ACROSS COLS: 100.0 * agg() / all(agg(), col_dims...)
 * - ACROSS dims: 100.0 * agg() / all(agg(), dims...)
 *
 * @param measure The measure to aggregate (empty string for count)
 * @param aggregation The aggregation method
 * @param denominatorScope The scope for the denominator
 * @param rowDimensions Row dimensions (needed for ACROSS COLS)
 * @param colDimensions Column dimensions (needed for ACROSS ROWS)
 * @param dimToOutputName Map from dimension name to output name (label or dimension)
 */
export function buildPercentageAggExpression(
  measure: string,
  aggregation: string,
  denominatorScope: 'all' | 'rows' | 'cols' | string[],
  rowDimensions: string[] = [],
  colDimensions: string[] = [],
  dimToOutputName: Map<string, string> = new Map()
): string {
  const baseExpr = buildAggExpression(measure, aggregation);

  // Helper to get the output name for a dimension (label if aliased, else original)
  const getOutputName = (dim: string): string => {
    const outputName = dimToOutputName.get(dim) ?? dim;
    return escapeFieldName(outputName);
  };

  // Build the all() expression for the denominator
  let allExpr: string;

  if (denominatorScope === 'all') {
    // Grand total - ungroup all dimensions
    allExpr = `all(${baseExpr})`;
  } else if (denominatorScope === 'rows') {
    // Column total - keep column dimensions grouped, ungroup row dimensions
    // This means each column sums to 100%
    if (colDimensions.length > 0) {
      const dims = colDimensions.map(getOutputName).join(', ');
      allExpr = `all(${baseExpr}, ${dims})`;
    } else {
      allExpr = `all(${baseExpr})`;
    }
  } else if (denominatorScope === 'cols') {
    // Row total - keep row dimensions grouped, ungroup column dimensions
    // This means each row sums to 100%
    if (rowDimensions.length > 0) {
      const dims = rowDimensions.map(getOutputName).join(', ');
      allExpr = `all(${baseExpr}, ${dims})`;
    } else {
      allExpr = `all(${baseExpr})`;
    }
  } else {
    // Specific dimensions - group by these dimensions for denominator
    const dims = denominatorScope.map(getOutputName).join(', ');
    allExpr = `all(${baseExpr}, ${dims})`;
  }

  // Return the percentage expression: 100.0 * numerator / denominator
  return `100.0 * ${baseExpr} / ${allExpr}`;
}

// ---
// FORMAT CONVERSION
// ---

/**
 * Convert a TPL format spec to a Malloy number format string
 */
export function formatToMalloy(format: FormatSpec | undefined): string {
  if (!format) return '';

  switch (format.type) {
    case 'currency':
      return '$#,##0.00';
    case 'percent':
      return '0.0%';
    case 'integer':
      return '#,##0';
    case 'decimal':
      return format.precision > 0 ? '0.' + '0'.repeat(format.precision) : '0';
    case 'comma':
      return format.precision > 0 ? '#,##0.' + '0'.repeat(format.precision) : '#,##0';
    case 'custom':
      return format.pattern;
    default:
      return '';
  }
}
