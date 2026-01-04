/**
 * Percentile Support Utilities
 *
 * Percentiles (p25, p50/median, p75, p90, p95, p99) require special handling because
 * Malloy doesn't support them natively. We work around this by:
 *
 * 1. Pre-computing percentiles using SQL window functions in a derived source
 * 2. Using .min() aggregation to pick the pre-computed value (since all rows
 *    in a partition have the same percentile value)
 *
 * This module provides utilities for:
 * - Detecting percentile aggregations in TPL queries
 * - Generating derived SQL sources with window function computations
 * - Mapping between original measure names and computed column names
 */

import type { TPLStatement, AggregationMethod, ItemExpression, AxisExpression, GroupExpression } from '../parser/ast.js';
import { walkAxis, isMeasureBinding, isAnnotatedGroupRef, isAxisExpression } from '../parser/ast.js';

// ---
// PERCENTILE DETECTION
// ---

/**
 * Percentile aggregation methods
 */
export const PERCENTILE_METHODS: Set<AggregationMethod> = new Set([
  'p25', 'p50', 'p75', 'p90', 'p95', 'p99', 'median'
]);

/**
 * Check if an aggregation method is a percentile
 */
export function isPercentileMethod(method: AggregationMethod): boolean {
  return PERCENTILE_METHODS.has(method);
}

/**
 * Percentile value mapping (method to quantile value)
 */
export const PERCENTILE_VALUES: Record<string, number> = {
  'p25': 0.25,
  'p50': 0.50,
  'p75': 0.75,
  'p90': 0.90,
  'p95': 0.95,
  'p99': 0.99,
  'median': 0.50,
};

/**
 * Human-readable labels for percentile methods
 */
export const PERCENTILE_LABELS: Record<string, string> = {
  'p25': 'P25',
  'p50': 'P50',
  'p75': 'P75',
  'p90': 'P90',
  'p95': 'P95',
  'p99': 'P99',
  'median': 'Median',
};

/**
 * Information about a percentile aggregation found in a TPL query
 */
export interface PercentileInfo {
  /** The measure being aggregated (e.g., 'income', 'births') */
  measure: string;
  /** The percentile method (e.g., 'p50', 'median') */
  method: AggregationMethod;
  /** The quantile value (e.g., 0.50 for median) */
  quantile: number;
  /** Generated column name for the pre-computed percentile */
  computedColumnName: string;
  /** Generated measure name for the Malloy source */
  measureName: string;
}

/**
 * Find all percentile aggregations in a parsed TPL statement.
 * Returns information about each unique (measure, method) pair.
 */
export function findPercentileAggregations(stmt: TPLStatement): PercentileInfo[] {
  const found = new Map<string, PercentileInfo>();

  const collectFromAxis = (axis: AxisExpression | null) => {
    if (!axis) return;

    walkAxis(axis, (item) => {
      if (isMeasureBinding(item)) {
        for (const agg of item.aggregations) {
          if (isPercentileMethod(agg.method)) {
            const key = `${item.measure}.${agg.method}`;
            if (!found.has(key)) {
              const quantile = PERCENTILE_VALUES[agg.method] ?? 0.5;
              found.set(key, {
                measure: item.measure,
                method: agg.method,
                quantile,
                computedColumnName: `__${item.measure}_${agg.method}`,
                measureName: `${item.measure}_${agg.method}`,
              });
            }
          }
        }
      } else if (isAnnotatedGroupRef(item) && item.aggregations) {
        // Handle group bindings like (revenue | cost).(p50 | p75)
        for (const agg of item.aggregations) {
          if (isPercentileMethod(agg.method)) {
            // Need to find the measures in the inner axis
            collectMeasuresFromAxis(item.inner, agg.method, found);
          }
        }
      }
    });
  };

  collectFromAxis(stmt.rowAxis);
  collectFromAxis(stmt.colAxis);

  return Array.from(found.values());
}

/**
 * Helper to collect measures from an axis for group bindings
 */
function collectMeasuresFromAxis(
  axis: AxisExpression,
  method: AggregationMethod,
  found: Map<string, PercentileInfo>
): void {
  walkAxis(axis, (item) => {
    if (item.type === 'measure' || item.type === 'dimension') {
      // In group bindings, both can be measures
      const key = `${item.name}.${method}`;
      if (!found.has(key)) {
        const quantile = PERCENTILE_VALUES[method] ?? 0.5;
        found.set(key, {
          measure: item.name,
          method,
          quantile,
          computedColumnName: `__${item.name}_${method}`,
          measureName: `${item.name}_${method}`,
        });
      }
    }
  });
}

/**
 * Find all dimension names in a TPL statement.
 * These will be used as PARTITION BY columns for the percentile window functions.
 */
export function findDimensions(stmt: TPLStatement): string[] {
  const dims = new Set<string>();

  const collectFromAxis = (axis: AxisExpression | null) => {
    if (!axis) return;

    walkAxis(axis, (item) => {
      if (item.type === 'dimension') {
        dims.add(item.name);
      }
    });
  };

  collectFromAxis(stmt.rowAxis);
  collectFromAxis(stmt.colAxis);

  return Array.from(dims);
}

// ---
// SQL GENERATION
// ---

export type SqlDialect = 'duckdb' | 'bigquery';

/**
 * Generate the SQL window function for a percentile computation.
 *
 * DuckDB: quantile_cont(measure, quantile) OVER (PARTITION BY dims)
 * BigQuery: PERCENTILE_CONT(measure, quantile) OVER (PARTITION BY dims)
 */
export function generatePercentileWindowFunction(
  measure: string,
  quantile: number,
  partitionColumns: string[],
  dialect: SqlDialect
): string {
  const partitionClause = partitionColumns.length > 0
    ? `PARTITION BY ${partitionColumns.join(', ')}`
    : '';

  if (dialect === 'duckdb') {
    return `quantile_cont(${measure}, ${quantile}) OVER (${partitionClause})`;
  } else {
    // BigQuery
    return `PERCENTILE_CONT(${measure}, ${quantile}) OVER (${partitionClause})`;
  }
}

/**
 * Generate a derived SQL source that pre-computes percentiles.
 *
 * @param tablePath The path to the source table (e.g., 'data/file.csv')
 * @param percentiles The percentiles to compute
 * @param partitionColumns Columns to partition by (dimensions)
 * @param dialect SQL dialect
 * @param whereClause Optional WHERE clause to filter data before computing percentiles
 * @returns SQL query string for the derived source
 */
export function generatePercentileSourceSQL(
  tablePath: string,
  percentiles: PercentileInfo[],
  partitionColumns: string[],
  dialect: SqlDialect,
  whereClause?: string
): string {
  // Build SELECT clause with window functions
  const windowFunctions = percentiles.map(p => {
    const windowFunc = generatePercentileWindowFunction(
      p.measure,
      p.quantile,
      partitionColumns,
      dialect
    );
    return `${windowFunc} as ${p.computedColumnName}`;
  });

  // Build WHERE clause if provided
  const wherePart = whereClause ? ` WHERE ${whereClause}` : '';

  // Generate the SQL
  if (dialect === 'duckdb') {
    // DuckDB can read files directly
    return `SELECT *, ${windowFunctions.join(', ')} FROM '${tablePath}'${wherePart}`;
  } else {
    // BigQuery uses fully qualified table names
    return `SELECT *, ${windowFunctions.join(', ')} FROM \`${tablePath}\`${wherePart}`;
  }
}

/**
 * Generate a Malloy source definition that uses the derived SQL.
 *
 * The derived source includes pre-computed percentile columns (e.g., __births_p50).
 * These are raw columns from the SQL, not Malloy measures. The TPL will be transformed
 * to use these columns with .min aggregation (e.g., __births_p50.min).
 *
 * @param sourceName The name for the Malloy source (e.g., 'data')
 * @param sql The SQL query for the derived source
 * @param percentiles The percentiles (used for documentation, not for measure definitions)
 * @param dialect SQL dialect
 * @returns Malloy source definition string
 */
export function generatePercentileMalloySource(
  sourceName: string,
  sql: string,
  percentiles: PercentileInfo[],
  dialect: SqlDialect
): string {
  const connectionPrefix = dialect === 'duckdb' ? 'duckdb' : 'bigquery';

  // Escape the SQL for Malloy (triple quotes for multi-line)
  const escapedSql = sql.replace(/"/g, '\\"');

  // Note: We don't define measures here. The pre-computed columns (e.g., __births_p50)
  // are raw columns from the SQL. The transformed TPL will use them with .min aggregation.
  return `source: ${sourceName} is ${connectionPrefix}.sql("""${escapedSql}""")`;
}

// ---
// QUERY TRANSFORMATION
// ---

/**
 * Transform a TPL query to use pre-computed percentile columns.
 *
 * Handles both single and multi-binding syntax:
 * - Single: `income.p50` → `__income_p50__dim1_dim2.min`
 * - Multi: `income.(p25 | p50 | p75)` → `(__income_p25__... | __income_p50__... | __income_p75__...).min`
 *
 * The transformation uses the computed column names with partition suffix because:
 * 1. The percentiles are pre-computed in SQL as raw columns
 * 2. TPL needs valid measure.aggregation bindings
 * 3. .min() correctly picks up the pre-computed values
 *
 * @param tplSource Original TPL query
 * @param percentiles Percentile mappings
 * @param fullPartitionSuffix Optional suffix for the full partition level (for ALL patterns)
 * @returns Transformed TPL query
 */
export function transformTPLForPercentiles(
  tplSource: string,
  percentiles: PercentileInfo[],
  fullPartitionSuffix: string = ''
): string {
  let transformed = tplSource;

  // Group percentiles by measure for handling multi-bindings
  const percentilesByMeasure = new Map<string, PercentileInfo[]>();
  for (const p of percentiles) {
    const existing = percentilesByMeasure.get(p.measure) || [];
    existing.push(p);
    percentilesByMeasure.set(p.measure, existing);
  }

  for (const [measure, measurePercentiles] of percentilesByMeasure) {
    // First, handle multi-binding patterns like measure.(p25 | p50 | p75)
    // Match the entire multi-binding group and replace with concatenated computed columns
    const multiBindingPattern = new RegExp(
      `\\b${escapeRegExp(measure)}\\.\\(([^)]+)\\)`,
      'gi'
    );

    transformed = transformed.replace(multiBindingPattern, (match, aggList) => {
      // Parse the aggregation list and replace percentiles
      const parts = aggList.split(/\s*\|\s*/);
      const transformedParts: string[] = [];

      for (const part of parts) {
        const trimmedPart = part.trim();
        // Check if this part is a percentile we're replacing
        const percentile = measurePercentiles.find(
          p => p.method.toLowerCase() === trimmedPart.toLowerCase()
        );

        if (percentile) {
          // Replace with computed column and add label (include measure name for consistency)
          const methodLabel = PERCENTILE_LABELS[percentile.method] || percentile.method.toUpperCase();
          const label = `${measure} ${methodLabel}`;
          const columnName = `${percentile.computedColumnName}${fullPartitionSuffix}`;
          transformedParts.push(`${columnName}.min "${label}"`);
        } else {
          // Keep original (for non-percentile aggregations like sum, mean)
          transformedParts.push(`${measure}.${trimmedPart}`);
        }
      }

      // Preserve parentheses to maintain correct operator precedence
      // Original: measure.(a | b | c) -> (transformed_a | transformed_b | transformed_c)
      return `(${transformedParts.join(' | ')})`;
    });

    // Then handle single binding: measure.method → computedColumnName.min "Label"
    for (const p of measurePercentiles) {
      const singlePattern = new RegExp(
        `\\b${escapeRegExp(measure)}\\.${p.method}\\b(?!\\.)`,  // Negative lookahead to avoid matching in already processed multi-bindings
        'gi'
      );
      const methodLabel = PERCENTILE_LABELS[p.method] || p.method.toUpperCase();
      const label = `${measure} ${methodLabel}`;
      const columnName = `${p.computedColumnName}${fullPartitionSuffix}`;
      transformed = transformed.replace(singlePattern, `${columnName}.min "${label}"`);
    }
  }

  return transformed;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Post-process generated Malloy to fix percentile column references for ALL patterns.
 *
 * When a query has ALL patterns, the outer aggregate (before any `nest:`) needs to
 * use a different partition column than the inner aggregates.
 *
 * @param malloy The generated Malloy query
 * @param percentiles Percentile info with computed column names
 * @param partitionLevels All partition levels
 * @param outerDimensions Dimensions at the outer level (determines which partition to use)
 * @returns Modified Malloy with correct column references
 */
export function postProcessMalloyForPercentiles(
  malloy: string,
  percentiles: PercentileInfo[],
  partitionLevels: PartitionLevel[],
  outerDimensions: string[]
): string {
  if (partitionLevels.length <= 1) {
    // No ALL patterns, no processing needed
    return malloy;
  }

  // Find the partition level that matches the outer dimensions
  const sortedOuterDims = [...outerDimensions].sort();
  const outerLevel = partitionLevels.find(
    level => {
      const sortedLevelDims = [...level.dimensions].sort();
      return sortedLevelDims.length === sortedOuterDims.length &&
        sortedLevelDims.every((d, i) => d === sortedOuterDims[i]);
    }
  );

  // Find the full partition level (most dimensions)
  const fullLevel = partitionLevels.reduce((max, level) =>
    level.dimensions.length > max.dimensions.length ? level : max
  );

  if (!outerLevel || outerLevel === fullLevel) {
    // Outer level is the full level, no changes needed
    return malloy;
  }

  // Split Malloy into outer and nested parts
  const nestIndex = malloy.indexOf('nest:');
  if (nestIndex === -1) {
    // No nesting, outer is the only level - use outer partition
    let result = malloy;
    for (const p of percentiles) {
      const fullColumnName = `${p.computedColumnName}${fullLevel.suffix}`;
      const outerColumnName = `${p.computedColumnName}${outerLevel.suffix}`;
      result = result.replace(
        new RegExp(`\\b${escapeRegExp(fullColumnName)}\\b`, 'g'),
        outerColumnName
      );
    }
    return result;
  }

  // Process outer part (before nest:) to use outer partition
  const outerPart = malloy.slice(0, nestIndex);
  const nestedPart = malloy.slice(nestIndex);

  let processedOuter = outerPart;
  for (const p of percentiles) {
    const fullColumnName = `${p.computedColumnName}${fullLevel.suffix}`;
    const outerColumnName = `${p.computedColumnName}${outerLevel.suffix}`;
    processedOuter = processedOuter.replace(
      new RegExp(`\\b${escapeRegExp(fullColumnName)}\\b`, 'g'),
      outerColumnName
    );
  }

  return processedOuter + nestedPart;
}

// ---
// ALL PATTERN DETECTION
// ---

/**
 * Information about dimensions that are collapsed by ALL patterns
 */
export interface PartitionLevel {
  /** Dimensions in this partition level (sorted for consistent column naming) */
  dimensions: string[];
  /** Column suffix for this partition level (e.g., '_state_gender' or '' for global) */
  suffix: string;
}

/**
 * Find all partition levels needed for percentile computation.
 *
 * When a query has ALL patterns, we need multiple partition levels:
 * - Full partition: all dimensions (for detailed cells)
 * - Partial partitions: dimensions without those collapsed by ALL
 * - Global partition: no dimensions (for grand totals)
 *
 * @param stmt Parsed TPL statement
 * @returns Array of partition levels needed
 */
export function findPartitionLevels(stmt: TPLStatement): PartitionLevel[] {
  const allDimensions = findDimensions(stmt);

  // If no dimensions, return global only
  if (allDimensions.length === 0) {
    return [{ dimensions: [], suffix: '' }];
  }

  // Find dimensions that are in sibling groups with ALL
  const collapsedDimSets = findCollapsedDimensions(stmt);

  // Build all unique partition levels needed
  const levels = new Map<string, PartitionLevel>();

  // Always include the full partition level
  const fullSuffix = allDimensions.length > 0
    ? '__' + allDimensions.sort().join('_')
    : '';
  levels.set(fullSuffix, { dimensions: allDimensions, suffix: fullSuffix });

  // For each collapsed dimension set, create a partial partition
  for (const collapsedDims of collapsedDimSets) {
    const partialDims = allDimensions.filter(d => !collapsedDims.includes(d));
    const suffix = partialDims.length > 0
      ? '__' + partialDims.sort().join('_')
      : '';

    if (!levels.has(suffix)) {
      levels.set(suffix, { dimensions: partialDims, suffix });
    }
  }

  return Array.from(levels.values());
}

/**
 * Find dimension sets that are collapsed by ALL patterns.
 *
 * Example: COLS gender | ALL means 'gender' is collapsed
 * Example: ROWS (state | ALL) * gender means 'state' is collapsed
 *
 * @returns Array of dimension name arrays (each array is a set of collapsed dimensions)
 */
export function findCollapsedDimensions(stmt: TPLStatement): string[][] {
  const collapsedSets: string[][] = [];

  const findInAxis = (axis: AxisExpression | null, axisName: 'row' | 'col') => {
    if (!axis) return;

    // Check top-level sibling groups for ALL
    const hasAll = axis.groups.some(group =>
      group.items.some(item => item.type === 'all')
    );

    if (hasAll) {
      // Collect dimensions from non-ALL sibling groups
      const dimsInSiblings: string[] = [];
      for (const group of axis.groups) {
        if (!group.items.some(item => item.type === 'all')) {
          collectDimensionsFromGroup(group, dimsInSiblings);
        }
      }
      if (dimsInSiblings.length > 0) {
        collapsedSets.push(dimsInSiblings);
      }
    }

    // Recursively check nested structures
    for (const group of axis.groups) {
      for (const item of group.items) {
        if (item.type === 'axis') {
          findInAxis(item, axisName);
        } else if (item.type === 'annotatedGroup' && item.inner) {
          findInAxis(item.inner, axisName);
        }
      }
    }
  };

  findInAxis(stmt.rowAxis, 'row');
  findInAxis(stmt.colAxis, 'col');

  return collapsedSets;
}

/**
 * Helper to collect dimension names from a group
 */
function collectDimensionsFromGroup(group: GroupExpression, dims: string[]): void {
  for (const item of group.items) {
    if (item.type === 'dimension') {
      dims.push(item.name);
    } else if (item.type === 'axis') {
      for (const subGroup of item.groups) {
        collectDimensionsFromGroup(subGroup, dims);
      }
    } else if (item.type === 'annotatedGroup' && item.inner) {
      for (const subGroup of item.inner.groups) {
        collectDimensionsFromGroup(subGroup, dims);
      }
    }
  }
}

// ---
// INTEGRATION HELPERS
// ---

/**
 * Configuration for percentile support in a query
 */
export interface PercentileConfig {
  /** Whether the query uses percentiles */
  hasPercentiles: boolean;
  /** The percentile aggregations found */
  percentiles: PercentileInfo[];
  /** Dimensions to partition by (full set) */
  partitionColumns: string[];
  /** All partition levels needed (for ALL patterns) */
  partitionLevels: PartitionLevel[];
  /** Whether the query has ALL patterns that require multiple partition levels */
  hasAllPatterns: boolean;
  /** Generated derived source SQL */
  derivedSQL?: string;
  /** Generated Malloy source definition */
  derivedMalloySource?: string;
  /** Transformed TPL query */
  transformedTPL?: string;
}

/**
 * Analyze a TPL statement and generate percentile configuration if needed.
 *
 * @param stmt Parsed TPL statement
 * @param tablePath Path to the source table
 * @param sourceName Malloy source name
 * @param dialect SQL dialect
 * @param originalTPL Original TPL query string
 * @returns Configuration for percentile support
 */
export function analyzeAndGeneratePercentileConfig(
  stmt: TPLStatement,
  tablePath: string,
  sourceName: string,
  dialect: SqlDialect,
  originalTPL: string
): PercentileConfig {
  const percentiles = findPercentileAggregations(stmt);

  if (percentiles.length === 0) {
    return {
      hasPercentiles: false,
      percentiles: [],
      partitionColumns: [],
      partitionLevels: [],
      hasAllPatterns: false,
    };
  }

  const partitionColumns = findDimensions(stmt);
  const partitionLevels = findPartitionLevels(stmt);
  const hasAllPatterns = partitionLevels.length > 1;

  // Extract WHERE clause from the statement if present
  // The WHERE clause is in Malloy syntax, which is compatible with SQL for simple expressions
  const whereClause = stmt.where || undefined;

  // Find the full partition level (most dimensions) for TPL transformation
  const fullLevel = partitionLevels.reduce((max, level) =>
    level.dimensions.length > max.dimensions.length ? level : max
  );

  // Generate SQL with all needed partition levels
  const derivedSQL = generateMultiLevelPercentileSQL(
    tablePath,
    percentiles,
    partitionLevels,
    dialect,
    whereClause
  );
  const derivedMalloySource = generatePercentileMalloySource(
    sourceName,
    derivedSQL,
    percentiles,
    dialect
  );
  // Transform TPL to use full partition column names (post-processing will fix outer aggregates)
  const transformedTPL = transformTPLForPercentiles(originalTPL, percentiles, fullLevel.suffix);

  return {
    hasPercentiles: true,
    percentiles,
    partitionColumns,
    partitionLevels,
    hasAllPatterns,
    derivedSQL,
    derivedMalloySource,
    transformedTPL,
  };
}

/**
 * Generate SQL with window functions for multiple partition levels.
 *
 * This creates a derived source with percentile columns for each partition level,
 * allowing correct values for both detailed cells and ALL (total) cells.
 *
 * Example columns for income.p50 with levels [state, gender] and [state]:
 * - __income_p50__gender_state: PARTITION BY gender, state (for detailed cells)
 * - __income_p50__state: PARTITION BY state (for ALL gender cells)
 */
export function generateMultiLevelPercentileSQL(
  tablePath: string,
  percentiles: PercentileInfo[],
  partitionLevels: PartitionLevel[],
  dialect: SqlDialect,
  whereClause?: string
): string {
  const windowFunctions: string[] = [];

  for (const level of partitionLevels) {
    for (const p of percentiles) {
      const columnName = `${p.computedColumnName}${level.suffix}`;
      const windowFunc = generatePercentileWindowFunction(
        p.measure,
        p.quantile,
        level.dimensions,
        dialect
      );
      windowFunctions.push(`${windowFunc} as ${columnName}`);
    }
  }

  const wherePart = whereClause ? ` WHERE ${whereClause}` : '';

  if (dialect === 'duckdb') {
    return `SELECT *, ${windowFunctions.join(', ')} FROM '${tablePath}'${wherePart}`;
  } else {
    return `SELECT *, ${windowFunctions.join(', ')} FROM \`${tablePath}\`${wherePart}`;
  }
}
