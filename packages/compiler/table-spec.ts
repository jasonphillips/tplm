/**
 * Table Specification - The Authoritative Structure
 *
 * This module defines the canonical representation of a TPL table.
 * It captures the FULL structure of both axes as trees, with explicit
 * representation of:
 *
 * - Nesting (*) as parent-child relationships
 * - Siblings (|) as explicit sibling groups
 * - ALL/totals with custom labels
 * - Limits, ordering, ACROSS modifiers
 * - Labels and formats
 *
 * This structure is:
 * 1. Built from the parsed AST
 * 2. Used to generate Malloy queries (with tree position tags)
 * 3. Preserved through to rendering (no reconstruction needed)
 * 4. The single source of truth for header structure
 */

import {
  LimitSpec,
  OrderSpec,
  FormatSpec,
  AggregationMethod,
  OrderByExpression,
  TableOptions,
} from '../parser/ast.js';

// ---
// AXIS TREE STRUCTURE
// ---

/**
 * A node in the axis tree.
 *
 * Key insight: A node has at most ONE child, but that child can be
 * a SiblingGroup containing multiple alternatives.
 *
 * Examples:
 *   year * gender             → DimensionNode(year, child: DimensionNode(gender))
 *   year * (gender | state)   → DimensionNode(year, child: SiblingGroup([gender, state]))
 *   (gender | name) * state   → SiblingGroup([gender→state, name→state])
 */
export type AxisNode =
  | DimensionNode
  | AggregateNode
  | PercentageAggregateNode
  | TotalNode
  | SiblingGroup;

/**
 * A dimension node represents a grouping level.
 */
export interface DimensionNode {
  readonly nodeType: 'dimension';

  /** The dimension/field name */
  readonly name: string;

  /** Display label (e.g., "US State") */
  readonly label?: string;

  /** If true, suppress the label in headers */
  readonly suppressLabel?: boolean;

  /** Limit specification (e.g., [-5] for top 5) */
  readonly limit?: LimitSpec;

  /** Explicit ordering (ASC/DESC keyword) */
  readonly order?: OrderSpec;

  /**
   * ACROSS modifier: dimensions to exclude from aggregation.
   * For `state[-5@(births.sum ACROSS name)]`, this means:
   * "compute births.sum ignoring name grouping for ordering"
   */
  readonly acrossDimensions?: string[];

  /** The next node in the nesting chain (if any) */
  readonly child?: AxisNode;
}

/**
 * An aggregate node is a leaf - measure bound to aggregation function.
 */
export interface AggregateNode {
  readonly nodeType: 'aggregate';

  /** The measure/field name */
  readonly measure: string;

  /** The aggregation function */
  readonly aggregation: AggregationMethod;

  /** Display format */
  readonly format?: FormatSpec;

  /** Display label */
  readonly label?: string;
}

/**
 * A percentage aggregate node - computes value as percentage of a denominator.
 *
 * The denominator scope determines what to divide by:
 * - 'all': grand total (all cells sum to 100%)
 * - 'rows': column total (each column sums to 100%, SAS COLPCTN)
 * - 'cols': row total (each row sums to 100%, SAS ROWPCTN)
 * - string[]: specific dimensions to group by for denominator
 */
export interface PercentageAggregateNode {
  readonly nodeType: 'percentageAggregate';

  /** The measure/field name (optional for count) */
  readonly measure?: string;

  /** The aggregation function */
  readonly aggregation: AggregationMethod;

  /**
   * Denominator scope:
   * - 'all': grand total (cell percentage)
   * - 'rows': column total (column percentage)
   * - 'cols': row total (row percentage)
   * - string[]: percentage within specific dimension groupings
   */
  readonly denominatorScope: 'all' | 'rows' | 'cols' | string[];

  /** Display format */
  readonly format?: FormatSpec;

  /** Display label */
  readonly label?: string;
}

/**
 * A total node represents ALL - aggregates across all values.
 * It collapses the parent dimension(s) and aggregates.
 */
export interface TotalNode {
  readonly nodeType: 'total';

  /** Custom label (e.g., "All States", default: "Total") */
  readonly label?: string;

  /**
   * What comes after the total (if anything).
   * For `(state | ALL) * gender`, the ALL's child is gender.
   */
  readonly child?: AxisNode;
}

/**
 * A sibling group represents mutually exclusive alternatives (| operator).
 *
 * Key insight: Each child of a SiblingGroup is a complete sub-tree.
 * The siblings are NOT at the same "level" - they're alternative PATHS.
 *
 * For `(gender | name) * state`:
 *   SiblingGroup([
 *     DimensionNode(gender, child: DimensionNode(state)),
 *     DimensionNode(name, child: DimensionNode(state))
 *   ])
 *
 * For `year * (gender | state)`:
 *   DimensionNode(year, child:
 *     SiblingGroup([
 *       DimensionNode(gender),
 *       DimensionNode(state)
 *     ])
 *   )
 */
export interface SiblingGroup {
  readonly nodeType: 'siblings';

  /** The alternative branches (each is a complete sub-tree) */
  readonly children: AxisNode[];
}

// ---
// TABLE SPECIFICATION
// ---

/**
 * The complete table specification.
 * This is the authoritative structure for the entire table.
 */
export interface TableSpec {
  /** Data source name (from FROM clause or options) */
  readonly source?: string;

  /** Filter condition (from WHERE clause) */
  readonly where?: string;

  /** Table-level options (from OPTIONS clause) */
  readonly options: TableOptions;

  /** Row axis specification */
  readonly rowAxis: AxisNode | null;

  /** Column axis specification */
  readonly colAxis: AxisNode | null;

  /** All aggregates in the table (collected from both axes) */
  readonly aggregates: AggregateInfo[];

  /**
   * Which axis was declared first in the source.
   * Used for limit priority: first-declared axis gets global limits,
   * second-declared axis gets per-parent limits.
   */
  readonly firstAxis: 'row' | 'col';
}

/**
 * Information about an aggregate in the table.
 */
export interface AggregateInfo {
  /** Unique name (e.g., "births_sum") */
  readonly name: string;

  /** Source measure */
  readonly measure: string;

  /** Aggregation function */
  readonly aggregation: AggregationMethod;

  /** Display format */
  readonly format?: FormatSpec;

  /** Display label */
  readonly label?: string;

  /**
   * If true, this is a percentage aggregate that divides by a denominator.
   */
  readonly isPercentage?: boolean;

  /**
   * For percentage aggregates, the scope of the denominator:
   * - 'all': grand total (all cells sum to 100%)
   * - 'rows': column total (each column sums to 100%)
   * - 'cols': row total (each row sums to 100%)
   * - string[]: specific dimensions to group by for denominator
   */
  readonly denominatorScope?: 'all' | 'rows' | 'cols' | string[];
}

// ---
// TREE PATH - POSITION IN THE TREE
// ---

/**
 * A path through the axis tree, identifying a specific branch.
 *
 * Used to tag queries so we know exactly where their results belong.
 */
export type TreePath = TreePathSegment[];

export type TreePathSegment =
  | { readonly type: 'dimension'; readonly name: string }
  | { readonly type: 'sibling'; readonly index: number }
  | { readonly type: 'total'; readonly label?: string }
  | { readonly type: 'aggregate'; readonly name: string };

/**
 * Serialize a tree path to a string for comparison/deduplication.
 */
export function serializeTreePath(path: TreePath): string {
  return path.map(segment => {
    switch (segment.type) {
      case 'dimension': return `D:${segment.name}`;
      case 'sibling': return `S:${segment.index}`;
      case 'total': return `T:${segment.label ?? ''}`;
      case 'aggregate': return `A:${segment.name}`;
    }
  }).join('|');
}

// ---
// QUERY SPECIFICATION - TAGGED WITH TREE POSITION
// ---

/**
 * A query specification with its position in the tree.
 */
export interface TaggedQuerySpec {
  /** Unique identifier for this query */
  readonly id: string;

  /** Position in row axis tree */
  readonly rowPath: TreePath;

  /** Position in column axis tree */
  readonly colPath: TreePath;

  /** Row groupings for this query */
  readonly rowGroupings: GroupingInfo[];

  /** Column groupings (pivots) for this query */
  readonly colGroupings: GroupingInfo[];

  /** Aggregates to compute */
  readonly aggregates: AggregateInfo[];

  /** Whether this query represents a row total (ALL on rows) */
  readonly isRowTotal: boolean;

  /** Whether this query includes a column total (ALL on cols) */
  readonly hasColTotal: boolean;

  /** Custom label for row total */
  readonly rowTotalLabel?: string;

  /** Custom label for column total */
  readonly colTotalLabel?: string;

  /**
   * For deduplication: the structural signature of this query.
   * Queries with the same signature can be merged.
   */
  readonly signature: string;

  /**
   * Additional column variants for merged queries.
   *
   * When present, this query was created by merging multiple queries
   * that share the same row structure. The primary column groupings
   * are in `colGroupings` and `hasColTotal`. Additional variants
   * (other column siblings) are stored here.
   *
   * Each variant results in a separate nest (or outer aggregate)
   * in the generated Malloy query.
   */
  readonly additionalColVariants?: ColVariant[];
}

/**
 * Grouping information for a dimension.
 */
export interface GroupingInfo {
  /** Dimension name */
  readonly dimension: string;

  /** Display label */
  readonly label?: string;

  /** Suppress label in headers */
  readonly suppressLabel?: boolean;

  /** Limit specification */
  readonly limit?: LimitSpec;

  /** Ordering */
  readonly order?: OrderSpec;

  /**
   * ACROSS dimensions: when this grouping's limit/order uses an aggregate
   * computed WITHOUT certain parent dimensions.
   */
  readonly acrossDimensions?: string[];
}

/**
 * A column variant for merged queries.
 *
 * When multiple queries share the same row structure but differ in column
 * groupings (e.g., from COLS dim1 | dim2), they can be merged into a single
 * query with multiple column variants. Each variant becomes a separate nest
 * (or outer aggregate for totals) in the Malloy query.
 */
export interface ColVariant {
  /** Column groupings for this variant (empty for ALL/total) */
  readonly colGroupings: GroupingInfo[];

  /** Whether this variant is a total (ALL) */
  readonly isTotal: boolean;

  /** Label for the total (if isTotal) */
  readonly totalLabel?: string;

  /** Tree path for this column variant */
  readonly colPath: TreePath;
}

// ---
// QUERY PLAN
// ---

/**
 * A query plan with deduplication.
 */
export interface QueryPlan {
  /** Unique queries to execute (deduplicated) */
  readonly queries: TaggedQuerySpec[];

  /**
   * Mapping from tree paths to query IDs.
   * Multiple paths may map to the same query (when deduplicated).
   */
  readonly pathToQuery: Map<string, string>;

  /** The merge order for rendering */
  readonly mergeOrder: string[];
}

// ---
// GRID SPEC - THE RENDERING STRUCTURE
// ---

/**
 * The grid specification for rendering.
 *
 * This is derived from TableSpec + query results.
 * It provides everything the renderer needs WITHOUT reconstruction.
 */
/**
 * Dimension-value map for cell lookup.
 * Maps dimension name → actual value (e.g., {"year": 2017, "state": "CA"})
 */
export type DimensionValues = Map<string, string | number>;

export interface GridSpec {
  /** Row header structure (directly from row axis tree) */
  readonly rowHeaders: HeaderNode[];

  /** Column header structure (directly from column axis tree) */
  readonly colHeaders: HeaderNode[];

  /**
   * Cell accessor function.
   * Given row dimension values and column dimension values, returns the cell value.
   * The renderer collects values by traversing the header tree.
   */
  readonly getCell: (
    rowValues: DimensionValues,
    colValues: DimensionValues,
    aggregate?: string
  ) => CellValue;

  /** All aggregates (for knowing which values to render per cell) */
  readonly aggregates: AggregateInfo[];

  /** Whether there's a row total */
  readonly hasRowTotal: boolean;

  /** Whether there's a column total */
  readonly hasColTotal: boolean;

  /** Table-level options */
  readonly options: TableOptions;

  /**
   * Whether to use corner-style row headers (labels in top-left corner).
   * True when options.rowHeaders === 'above' AND row axis doesn't have
   * sibling concatenation at the root level.
   */
  readonly useCornerRowHeaders: boolean;

  /**
   * Row dimension labels for corner display (in order of nesting depth).
   * Only populated when useCornerRowHeaders is true.
   * Each entry contains { dimension, label } for display in the corner.
   */
  readonly cornerRowLabels?: Array<{ dimension: string; label: string }>;

  /**
   * Row dimension labels for left-mode display (when siblings exist).
   * Contains labels for each header column, where:
   * - Empty string = no label should be displayed (default dimension name or no custom label)
   * - Non-empty string = custom label that should be displayed
   *
   * This enables the user's requested behavior: in left mode, only show
   * header labels when the user explicitly provides a custom label.
   */
  readonly leftModeRowLabels?: Array<{ dimension?: string; label: string; hasCustomLabel: boolean }>;
}

/**
 * A node in the header tree.
 *
 * This directly mirrors the axis tree structure but is enriched
 * with span information and values from query results.
 */
export interface HeaderNode {
  /** The type of header */
  readonly type: 'dimension' | 'total' | 'sibling-label';

  /** For dimensions: the dimension name */
  readonly dimension?: string;

  /** The display value (dimension value or total label) */
  readonly value: string;

  /** The display label (dimension label or total label) */
  readonly label?: string;

  /** How many rows/columns this header spans */
  readonly span: number;

  /** Depth in the header hierarchy (0 = outermost) */
  readonly depth: number;

  /** Child headers (for nested structure) */
  readonly children?: HeaderNode[];

  /** Path to this header position */
  readonly path: TreePath;
}

/**
 * A cell value with formatting.
 */
export interface CellValue {
  /** The raw numeric value */
  readonly raw: number | null;

  /** The formatted display string */
  readonly formatted: string;

  /** The aggregate this value belongs to */
  readonly aggregate: string;

  /** Path description for tooltips */
  readonly pathDescription: string;
}

// ---
// TREE UTILITIES
// ---

/**
 * Walk the axis tree and call a visitor for each node.
 */
export function walkAxisTree(
  node: AxisNode | null,
  visitor: (node: AxisNode, path: TreePath) => void,
  path: TreePath = []
): void {
  if (!node) return;

  visitor(node, path);

  switch (node.nodeType) {
    case 'dimension':
      if (node.child) {
        walkAxisTree(node.child, visitor, [
          ...path,
          { type: 'dimension', name: node.name }
        ]);
      }
      break;

    case 'total':
      if (node.child) {
        walkAxisTree(node.child, visitor, [
          ...path,
          { type: 'total', label: node.label }
        ]);
      }
      break;

    case 'siblings':
      for (let i = 0; i < node.children.length; i++) {
        walkAxisTree(node.children[i], visitor, [
          ...path,
          { type: 'sibling', index: i }
        ]);
      }
      break;

    case 'aggregate':
    case 'percentageAggregate':
      // Leaf node, no children
      break;
  }
}

/**
 * Collect all unique branches (paths from root to leaf) in the tree.
 */
export function collectBranches(node: AxisNode | null): TreePath[] {
  const branches: TreePath[] = [];

  function collect(n: AxisNode | null, path: TreePath): void {
    if (!n) {
      if (path.length > 0) {
        branches.push(path);
      }
      return;
    }

    switch (n.nodeType) {
      case 'dimension':
        const dimPath: TreePath = [...path, { type: 'dimension', name: n.name }];
        if (n.child) {
          collect(n.child, dimPath);
        } else {
          branches.push(dimPath);
        }
        break;

      case 'total':
        const totalPath: TreePath = [...path, { type: 'total', label: n.label }];
        if (n.child) {
          collect(n.child, totalPath);
        } else {
          branches.push(totalPath);
        }
        break;

      case 'siblings':
        for (let i = 0; i < n.children.length; i++) {
          collect(n.children[i], [...path, { type: 'sibling', index: i }]);
        }
        break;

      case 'aggregate':
        branches.push([...path, { type: 'aggregate', name: n.measure + '_' + n.aggregation }]);
        break;

      case 'percentageAggregate':
        const pctMeasure = n.measure ?? '';
        branches.push([...path, { type: 'aggregate', name: pctMeasure + '_' + n.aggregation + '_pct' }]);
        break;
    }
  }

  collect(node, []);
  return branches;
}

/**
 * Get all aggregates from an axis tree.
 */
export function collectAggregates(node: AxisNode | null): AggregateInfo[] {
  const aggregates: AggregateInfo[] = [];
  const seen = new Set<string>();

  walkAxisTree(node, (n) => {
    if (n.nodeType === 'aggregate') {
      const name = `${n.measure}_${n.aggregation}`;
      if (!seen.has(name)) {
        seen.add(name);
        aggregates.push({
          name,
          measure: n.measure,
          aggregation: n.aggregation,
          format: n.format,
          label: n.label,
        });
      }
    } else if (n.nodeType === 'percentageAggregate') {
      const measure = n.measure ?? '';
      const name = `${measure}_${n.aggregation}_pct`;
      if (!seen.has(name)) {
        seen.add(name);
        aggregates.push({
          name,
          measure,
          aggregation: n.aggregation,
          format: n.format ?? { type: 'rawPercent' },  // Default to rawPercent (Malloy already outputs 100*value/denom)
          label: n.label,
          isPercentage: true,
          denominatorScope: n.denominatorScope,
        });
      }
    }
  });

  return aggregates;
}

/**
 * Get all dimensions from an axis tree (in order, without duplicates).
 */
export function collectDimensions(node: AxisNode | null): string[] {
  const dimensions: string[] = [];
  const seen = new Set<string>();

  walkAxisTree(node, (n) => {
    if (n.nodeType === 'dimension' && !seen.has(n.name)) {
      seen.add(n.name);
      dimensions.push(n.name);
    }
  });

  return dimensions;
}

/**
 * Check if a tree contains any siblings.
 */
export function hasSiblings(node: AxisNode | null): boolean {
  let found = false;
  walkAxisTree(node, (n) => {
    if (n.nodeType === 'siblings') {
      found = true;
    }
  });
  return found;
}

/**
 * Check if a tree contains any totals.
 */
export function hasTotals(node: AxisNode | null): boolean {
  let found = false;
  walkAxisTree(node, (n) => {
    if (n.nodeType === 'total') {
      found = true;
    }
  });
  return found;
}

/**
 * Get the depth of a tree (longest path from root to leaf).
 */
export function getTreeDepth(node: AxisNode | null): number {
  if (!node) return 0;

  switch (node.nodeType) {
    case 'dimension':
      return 1 + getTreeDepth(node.child ?? null);

    case 'total':
      return 1 + getTreeDepth(node.child ?? null);

    case 'siblings':
      return Math.max(...node.children.map((c: AxisNode) => getTreeDepth(c)));

    case 'aggregate':
    case 'percentageAggregate':
      return 1;
  }
}

/**
 * Print a tree for debugging.
 */
export function printAxisTree(node: AxisNode | null, indent: string = ''): string {
  if (!node) return `${indent}(empty)`;

  const lines: string[] = [];

  switch (node.nodeType) {
    case 'dimension':
      let dimStr = `${indent}DIM: ${node.name}`;
      if (node.label) dimStr += ` "${node.label}"`;
      if (node.limit) {
        dimStr += ` [${node.limit.direction === 'desc' ? '-' : ''}${node.limit.count}]`;
      }
      if (node.acrossDimensions) {
        dimStr += ` ACROSS(${node.acrossDimensions.join(', ')})`;
      }
      lines.push(dimStr);
      if (node.child) {
        lines.push(printAxisTree(node.child, indent + '  '));
      }
      break;

    case 'total':
      lines.push(`${indent}TOTAL${node.label ? ` "${node.label}"` : ''}`);
      if (node.child) {
        lines.push(printAxisTree(node.child, indent + '  '));
      }
      break;

    case 'siblings':
      lines.push(`${indent}SIBLINGS:`);
      for (let i = 0; i < node.children.length; i++) {
        lines.push(`${indent}  [${i}]:`);
        lines.push(printAxisTree(node.children[i], indent + '    '));
      }
      break;

    case 'aggregate':
      let aggStr = `${indent}AGG: ${node.measure}.${node.aggregation}`;
      if (node.label) aggStr += ` "${node.label}"`;
      if (node.format) aggStr += ` :${node.format.type}`;
      lines.push(aggStr);
      break;

    case 'percentageAggregate':
      const pctMeasure = node.measure ?? '(count)';
      let pctStr = `${indent}PCT: ${pctMeasure}.${node.aggregation} ACROSS ${
        Array.isArray(node.denominatorScope)
          ? node.denominatorScope.join(', ')
          : node.denominatorScope
      }`;
      if (node.label) pctStr += ` "${node.label}"`;
      if (node.format) pctStr += ` :${node.format.type}`;
      lines.push(pctStr);
      break;
  }

  return lines.join('\n');
}
