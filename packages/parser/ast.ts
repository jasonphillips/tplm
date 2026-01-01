/**
 * TPL Abstract Syntax Tree Type Definitions
 * 
 * These types represent the parsed structure of a TPL statement.
 */

// ---
// TOP-LEVEL
// ---

/**
 * Table-level options set via OPTIONS clause.
 * Example: TABLE OPTIONS rowHeaders:above ROWS state * births.sum;
 */
export interface TableOptions {
  /**
   * Row header placement:
   * - 'left': Headers appear as hierarchical columns to the left (default)
   * - 'above': Headers appear in the corner area (top-left thead cells)
   *
   * Note: 'above' falls back to 'left' when row axis has sibling concatenation
   * since corner placement can't logically span multiple dimension types.
   */
  rowHeaders?: 'above' | 'left';

  /**
   * Whether to include NULL values in dimension groupings.
   * - false (default): Automatically filters out NULLs from dimensions
   * - true: Includes NULL as a separate group (requires manual filtering)
   *
   * When false, generates WHERE clauses like: WHERE dim1 IS NOT NULL AND dim2 IS NOT NULL
   * Also affects ACROSS denominators to ensure percentages sum to 100%.
   */
  includeNulls?: boolean;
}

export interface TPLStatement {
  type: 'table';
  source: string | null;  // FROM clause - dataset/table reference
  where: string | null;   // WHERE clause - SQL-like filter expression
  options: TableOptions;  // OPTIONS clause - table-level settings
  rowAxis: AxisExpression;
  colAxis: AxisExpression | null;
  /**
   * Which axis was declared first in the source.
   * Used for limit priority: first-declared axis gets global limits,
   * second-declared axis gets per-parent limits.
   * Defaults to 'row' for backwards compatibility.
   */
  firstAxis: 'row' | 'col';
}

// ---
// AXIS EXPRESSIONS
// ---

/**
 * An axis contains one or more groups (concatenated siblings at the same level)
 */
export interface AxisExpression {
  type: 'axis';
  groups: GroupExpression[];
}

/**
 * A group contains one or more items crossed together (nested hierarchy)
 */
export interface GroupExpression {
  type: 'group';
  items: ItemExpression[];
}

/**
 * An item is either a reference or a sub-expression
 */
export type ItemExpression =
  | DimensionRef
  | MeasureRef
  | AggregationRef
  | MeasureBinding  // measure.aggregation binding
  | PercentageAggregateRef  // (aggregate ACROSS [scope]) for percentage calculations
  | AllRef
  | AxisExpression  // Parenthesized sub-expression
  | AnnotatedGroupRef;  // Parenthesized group with annotations to distribute

// ---
// REFERENCES
// ---

export interface DimensionRef {
  type: 'dimension';
  name: string;
  label?: string;
  order?: OrderSpec;
  limit?: LimitSpec;
}

export interface MeasureRef {
  type: 'measure';
  name: string;
  label?: string;
  format?: FormatSpec;
}

export interface AggregationRef {
  type: 'aggregation';
  method: AggregationMethod;
  label?: string;
  diff?: string;      // Baseline for comparison
  over?: string;      // Dimension for percent-of calculations
  format?: FormatSpec;
}

/**
 * An aggregation method with optional format specifier and label.
 * Used in measure bindings like `income.(sum:currency "Total" | mean:decimal.2 "Average")`
 */
export interface AggregationSpec {
  method: AggregationMethod;
  format?: FormatSpec;
  label?: string;
}

/**
 * A measure bound to one or more aggregations
 * e.g., revenue.sum or revenue.(sum | mean) or revenue.(sum:currency | mean:decimal.2)
 * This explicitly ties a measure to its aggregation(s)
 */
export interface MeasureBinding {
  type: 'binding';
  measure: string;
  aggregations: AggregationSpec[];
  label?: string;
  format?: FormatSpec;  // Default format if individual aggregations don't specify one
}

/**
 * Percentage aggregate using ACROSS for denominator specification
 * e.g., (count ACROSS) - cell percentage of grand total
 *       (income.sum ACROSS COLS) - row percentage
 *       (count ACROSS ROWS) - column percentage
 *       (count ACROSS gender) - percentage within gender grouping
 */
export interface PercentageAggregateRef {
  type: 'percentageAggregate';
  /** The measure to aggregate (optional for count) */
  measure?: string;
  /** The aggregation method (sum, count, mean, etc.) */
  method: AggregationMethod;
  /**
   * Denominator scope:
   * - 'all' = grand total (all cells sum to 100%)
   * - 'rows' = column total (each column sums to 100%)
   * - 'cols' = row total (each row sums to 100%)
   * - string[] = specific dimensions to group by for denominator
   */
  denominatorScope: 'all' | 'rows' | 'cols' | string[];
  label?: string;
  format?: FormatSpec;
}

export interface AllRef {
  type: 'all';
  label?: string;
}

/**
 * A parenthesized group with annotations that should be distributed to children
 * e.g., (headcount salary):comma.0 applies comma.0 format to both measures
 * e.g., (revenue cost).sum binds both measures to sum aggregation
 * e.g., (revenue cost).(sum:currency | mean) binds with per-aggregation formats
 */
export interface AnnotatedGroupRef {
  type: 'annotatedGroup';
  inner: AxisExpression;
  aggregations?: AggregationSpec[];  // If present, this is a group binding
  label?: string;
  format?: FormatSpec;
  order?: OrderSpec;
}

// ---
// SPECIFICATIONS
// ---

export type AggregationMethod =
  | 'sum'
  | 'mean'
  | 'count'
  | 'min'
  | 'max'
  | 'median'
  | 'stdev'
  | 'pct'
  | 'pctn'
  | 'pctsum';

export type FormatSpec =
  | { type: 'currency' }
  | { type: 'percent' }
  | { type: 'rawPercent' }  // For ACROSS aggregates where value is already in percentage form (59.44 = 59.44%)
  | { type: 'integer' }
  | { type: 'decimal'; precision: number }
  | { type: 'comma'; precision: number }
  | { type: 'custom'; pattern: string };

export interface OrderSpec {
  field?: string;
  stat?: string;
  direction: 'asc' | 'desc';
  orderBy?: string | OrderByExpression;  // Simple string or complex expression (e.g., @field.agg or @(ratio))
}

/**
 * Limit specification for dimensions
 * e.g., [10] = limit 10 ascending
 *       [-10] = top 10 (descending)
 *       [-10@revenue.sum] = top 10 by revenue.sum
 *       [-10@(births.sum / births.sum<name>)] = top 10 by ratio
 */
export interface LimitSpec {
  count: number;
  direction: 'asc' | 'desc';
  orderBy?: string | OrderByExpression;  // Simple string or complex expression
}

// ---
// ORDER-BY EXPRESSIONS (for ratio/contextual aggregations)
// ---

/**
 * A simple aggregate reference: field.function
 * Can optionally have ungrouped dimensions for contextual aggregation
 * e.g., births.sum or births.sum<name>
 */
export interface AggregateExpr {
  type: 'aggregateExpr';
  field: string;
  function: AggregationMethod;
  /** Dimensions to ungroup (sum over) when computing this aggregate */
  ungroupedDimensions?: string[];
}

/**
 * A ratio expression: numerator / denominator
 * e.g., births.sum / births.sum<name>
 */
export interface RatioExpr {
  type: 'ratioExpr';
  numerator: AggregateExpr;
  denominator: AggregateExpr;
}

/**
 * Order-by expression can be simple aggregate or ratio
 */
export type OrderByExpression = AggregateExpr | RatioExpr;

// ---
// UTILITY TYPES
// ---

/**
 * Schema information needed by the compiler
 */
export interface SchemaInfo {
  source: string;
  dimensions: string[];
  measures: string[];
}

/**
 * Result of walking the AST to extract all references
 */
export interface ASTAnalysis {
  dimensions: Set<string>;
  measures: Set<string>;
  aggregations: Set<AggregationMethod>;
  hasRowTotal: boolean;
  hasColTotal: boolean;
  rowDepth: number;
  colDepth: number;
}

// ---
// TYPE GUARDS
// ---

export function isDimensionRef(item: ItemExpression): item is DimensionRef {
  return item.type === 'dimension';
}

export function isMeasureRef(item: ItemExpression): item is MeasureRef {
  return item.type === 'measure';
}

export function isAggregationRef(item: ItemExpression): item is AggregationRef {
  return item.type === 'aggregation';
}

export function isMeasureBinding(item: ItemExpression): item is MeasureBinding {
  return item.type === 'binding';
}

export function isPercentageAggregateRef(item: ItemExpression): item is PercentageAggregateRef {
  return item.type === 'percentageAggregate';
}

export function isAllRef(item: ItemExpression): item is AllRef {
  return item.type === 'all';
}

export function isAxisExpression(item: ItemExpression): item is AxisExpression {
  return item.type === 'axis';
}

export function isAnnotatedGroupRef(item: ItemExpression): item is AnnotatedGroupRef {
  return item.type === 'annotatedGroup';
}

export function isOrderByExpression(value: any): value is OrderByExpression {
  return value && typeof value === 'object' &&
    (value.type === 'aggregateExpr' || value.type === 'ratioExpr');
}

export function isRatioExpr(value: any): value is RatioExpr {
  return value && typeof value === 'object' && value.type === 'ratioExpr';
}

export function isAggregateExpr(value: any): value is AggregateExpr {
  return value && typeof value === 'object' && value.type === 'aggregateExpr';
}

// ---
// AST WALKING UTILITIES
// ---

/**
 * Visit all nodes in an axis expression
 */
export function walkAxis(
  axis: AxisExpression,
  visitor: (item: ItemExpression, depth: number) => void,
  depth: number = 0
): void {
  for (const group of axis.groups) {
    for (const item of group.items) {
      visitor(item, depth);
      if (isAxisExpression(item)) {
        walkAxis(item, visitor, depth + 1);
      } else if (isAnnotatedGroupRef(item)) {
        walkAxis(item.inner, visitor, depth + 1);
      }
    }
  }
}

/**
 * Analyze an AST to extract summary information
 */
export function analyzeAST(stmt: TPLStatement): ASTAnalysis {
  const dimensions = new Set<string>();
  const measures = new Set<string>();
  const aggregations = new Set<AggregationMethod>();
  let hasRowTotal = false;
  let hasColTotal = false;
  let rowDepth = 0;
  let colDepth = 0;

  const visitor = (item: ItemExpression, depth: number) => {
    if (isDimensionRef(item)) {
      dimensions.add(item.name);
    } else if (isMeasureRef(item)) {
      measures.add(item.name);
    } else if (isAggregationRef(item)) {
      aggregations.add(item.method);
    } else if (isMeasureBinding(item)) {
      measures.add(item.measure);
      for (const agg of item.aggregations) {
        aggregations.add(agg.method);
      }
    }
  };

  // Walk row axis
  walkAxis(stmt.rowAxis, (item, depth) => {
    visitor(item, depth);
    if (isAllRef(item)) hasRowTotal = true;
    rowDepth = Math.max(rowDepth, depth + 1);
  });

  // Walk column axis
  if (stmt.colAxis) {
    walkAxis(stmt.colAxis, (item, depth) => {
      visitor(item, depth);
      if (isAllRef(item)) hasColTotal = true;
      colDepth = Math.max(colDepth, depth + 1);
    });
  }

  return {
    dimensions,
    measures,
    aggregations,
    hasRowTotal,
    hasColTotal,
    rowDepth,
    colDepth,
  };
}

/**
 * Expand crossing operator to get all combinations
 *
 * (A B) * C becomes: [[A, C], [B, C]]
 */
export function expandCrossings(items: ItemExpression[]): ItemExpression[][] {
  if (items.length === 0) return [[]];

  const [first, ...rest] = items;
  const restExpanded = expandCrossings(rest);

  if (isAxisExpression(first)) {
    // Parenthesized expression - expand its groups as siblings
    const results: ItemExpression[][] = [];
    for (const group of first.groups) {
      const groupExpanded = expandCrossings([...group.items]);
      for (const combo of groupExpanded) {
        for (const restCombo of restExpanded) {
          results.push([...combo, ...restCombo]);
        }
      }
    }
    return results;
  }

  if (isAnnotatedGroupRef(first)) {
    // Annotated group - expand inner axis and distribute annotations
    const results: ItemExpression[][] = [];
    for (const group of first.inner.groups) {
      const groupExpanded = expandCrossings([...group.items]);
      for (const combo of groupExpanded) {
        // Apply annotations to leaf items in this combo
        const annotatedCombo = combo.map(item => {
          if (isMeasureRef(item) || isDimensionRef(item)) {
            return {
              ...item,
              format: first.format ?? (item as MeasureRef).format,
              label: first.label ?? item.label,
            };
          }
          return item;
        });
        for (const restCombo of restExpanded) {
          results.push([...annotatedCombo, ...restCombo]);
        }
      }
    }
    return results;
  }

  return restExpanded.map(combo => [first, ...combo]);
}
