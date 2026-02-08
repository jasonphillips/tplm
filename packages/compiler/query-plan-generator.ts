/**
 * Query Plan Generator
 *
 * Generates tagged, deduplicated query specifications from a TableSpec.
 *
 * Key features:
 * 1. Tags each query with its position in the axis trees (TreePath)
 * 2. Deduplicates queries with identical structure
 * 3. Handles ACROSS modifiers for cross-dimensional aggregation
 * 4. Preserves all metadata (labels, formats, limits)
 */

import {
  TableSpec,
  AxisNode,
  DimensionNode,
  AggregateNode,
  TotalNode,
  SiblingGroup,
  AggregateInfo,
  TreePath,
  TreePathSegment,
  TaggedQuerySpec,
  QueryPlan,
  GroupingInfo,
  ColVariant,
  serializeTreePath,
  collectBranches,
} from "./table-spec.js";
import {
  LimitSpec,
  OrderSpec,
  AggregateExpr,
  OrderByExpression,
  AggregationMethod,
} from "../parser/ast.js";
import {
  escapeFieldName,
  buildAggExpression,
  buildPercentageAggExpression,
} from "./multi-query-utils.js";
import type { DimensionOrderingProvider } from "./dimension-utils.js";

// ---
// ORDER-BY HELPERS
// ---

// Module-level ordering provider for current query generation.
// Set by generateMalloyQueries and used by buildOrderByExpression.
let currentOrderingProvider: DimensionOrderingProvider | undefined;

// Module-level flag for NULL filtering in column dimensions.
// Set by generateMalloyQueries and used by buildNestClause.
// When false (default), each nest adds a WHERE clause filtering out NULL values
// for its specific column dimensions.
let currentIncludeNulls: boolean = false;

/**
 * Build the order_by field for a limit.
 *
 * - If limit.orderBy is specified, use that (field or aggregate expression)
 * - If no orderBy and dimension has definition order, use definition order
 * - Otherwise, order by the dimension name (alphabetic sort)
 *
 * @param limit The limit spec (may have orderBy)
 * @param dimensionName The dimension being limited (for alphabetic fallback)
 * @returns The Malloy order_by field expression
 */
function buildOrderByField(limit: LimitSpec, dimensionName: string): string {
  return buildOrderByExpression(limit.orderBy, dimensionName);
}

/**
 * Build the order_by field for an order spec (without limit).
 *
 * - If order.orderBy is specified, use that (field or aggregate expression)
 * - If no orderBy and dimension has definition order, use definition order
 * - Otherwise, order by the dimension name (alphabetic sort)
 *
 * @param order The order spec (may have orderBy)
 * @param dimensionName The dimension being ordered (for alphabetic fallback)
 * @returns The Malloy order_by field expression
 */
function buildOrderByFieldFromOrder(
  order: OrderSpec,
  dimensionName: string
): string {
  // For explicit orders (without limits), use definition order as fallback
  return buildOrderByExpression(order.orderBy, dimensionName, true);
}

/**
 * Build the order_by field expression from an orderBy value.
 * Shared logic for both limits and orders.
 *
 * @param orderBy The orderBy expression (field name, aggregate, ratio, or undefined)
 * @param dimensionName The dimension being ordered (for alphabetic fallback)
 * @param useDefinitionOrder If true and no orderBy specified, use definition order if available
 *                           (only for explicit orders, not for limits)
 */
function buildOrderByExpression(
  orderBy: string | OrderByExpression | undefined,
  dimensionName: string,
  useDefinitionOrder: boolean = false
): string {
  if (!orderBy) {
    // No explicit orderBy - check if we should use definition order
    if (
      useDefinitionOrder &&
      currentOrderingProvider?.hasDefinitionOrder(dimensionName)
    ) {
      // Use the ordering dimension for definition-order sorting
      const orderDimName =
        currentOrderingProvider.getOrderDimensionName(dimensionName);
      if (orderDimName) {
        return escapeFieldName(orderDimName);
      }
    }
    // Fall back to alphabetic order by the dimension
    return escapeFieldName(dimensionName);
  }

  if (typeof orderBy === "string") {
    // Simple field reference: @births or @revenue
    return escapeFieldName(orderBy);
  }

  // Complex expression: AggregateExpr or RatioExpr
  const expr = orderBy as OrderByExpression;

  if (expr.type === "aggregateExpr") {
    // e.g., @births.sum -> births_sum
    return buildAggregateOrderByName(expr);
  }

  if (expr.type === "ratioExpr") {
    // Ratios are more complex - for now, use numerator's aggregate
    // Full ratio support would require computing the ratio field
    return buildAggregateOrderByName(expr.numerator);
  }

  // Fallback
  return escapeFieldName(dimensionName);
}

/**
 * Build the aggregate name for order_by from an AggregateExpr.
 * e.g., { field: 'births', function: 'sum' } -> 'births_sum'
 */
function buildAggregateOrderByName(expr: AggregateExpr): string {
  // AggregationMethod uses 'mean' not 'avg', so no conversion needed
  const name = `${expr.field}_${expr.function}`;
  return escapeFieldName(name);
}

/**
 * Ensure that an orderBy aggregate is included in the aggregates list.
 * If the orderBy references an aggregate that's not in the list, add it.
 */
function ensureOrderByAggregateInList(
  orderByExpr: OrderByExpression | string | undefined,
  aggregates: AggregateInfo[]
): AggregateInfo[] {
  if (!orderByExpr || typeof orderByExpr === "string") {
    return aggregates;
  }

  const extractAggInfo = (
    expr: AggregateExpr
  ): { measure: string; aggregation: AggregationMethod } | null => {
    if (expr.type === "aggregateExpr") {
      return { measure: expr.field, aggregation: expr.function };
    }
    return null;
  };

  let aggInfo: { measure: string; aggregation: AggregationMethod } | null =
    null;

  if (orderByExpr.type === "aggregateExpr") {
    aggInfo = extractAggInfo(orderByExpr);
  } else if (orderByExpr.type === "ratioExpr") {
    // For ratio, use the numerator aggregate
    aggInfo = extractAggInfo(orderByExpr.numerator);
  }

  if (!aggInfo) {
    return aggregates;
  }

  // Check if this aggregate is already in the list
  const aggName = `${aggInfo.measure}_${aggInfo.aggregation}`;
  const exists = aggregates.some((a) => a.name === aggName);

  if (exists) {
    return aggregates;
  }

  // Add the aggregate
  const newAgg: AggregateInfo = {
    name: aggName,
    measure: aggInfo.measure,
    aggregation: aggInfo.aggregation,
    label: undefined,
    isPercentage: false,
  };

  return [...aggregates, newAgg];
}

// ---
// MAIN GENERATOR FUNCTION
// ---

/**
 * Generate a query plan from a TableSpec.
 *
 * This produces a set of deduplicated and merged queries, each tagged with
 * their position in the axis trees for result mapping.
 *
 * The plan undergoes three stages:
 * 1. Generate raw queries for each row × column branch combination
 * 2. Deduplicate queries with identical signatures
 * 3. Merge queries that share the same row structure (column sibling optimization)
 */
export function generateQueryPlan(spec: TableSpec): QueryPlan {
  // Collect all branches from both axes
  const rowBranches = spec.rowAxis ? collectBranches(spec.rowAxis) : [[]];
  const colBranches = spec.colAxis ? collectBranches(spec.colAxis) : [[]];

  // Generate raw queries for each row × column branch combination
  const rawQueries: RawQuery[] = [];

  for (const rowPath of rowBranches) {
    for (const colPath of colBranches) {
      const query = buildQueryFromPaths(spec, rowPath, colPath);
      if (query) {
        rawQueries.push(query);
      }
    }
  }

  // Deduplicate by signature
  const deduped = deduplicateQueries(rawQueries);

  // Merge queries that share the same row structure
  // This combines queries like COLS dim1 | dim2 into a single query with multiple nests
  const merged = mergeColumnVariants(deduped.queries, deduped.pathToQuery);

  // Build the final query plan
  return {
    queries: merged.queries,
    pathToQuery: merged.pathToQuery,
    mergeOrder: merged.queries.map((q) => q.id),
  };
}

// ---
// INTERNAL TYPES
// ---

interface RawQuery {
  rowPath: TreePath;
  colPath: TreePath;
  rowGroupings: GroupingInfo[];
  colGroupings: GroupingInfo[];
  aggregates: AggregateInfo[];
  isRowTotal: boolean;
  hasColTotal: boolean;
  rowTotalLabel?: string;
  colTotalLabel?: string;
  signature: string;
}

// ---
// QUERY BUILDING
// ---

/**
 * Build a query specification from row and column paths.
 */
function buildQueryFromPaths(
  spec: TableSpec,
  rowPath: TreePath,
  colPath: TreePath
): RawQuery | null {
  // Extract groupings from paths
  const rowGroupings = extractGroupingsFromPath(spec.rowAxis, rowPath);
  const colGroupings = extractGroupingsFromPath(spec.colAxis, colPath);

  // Check for totals in paths
  const isRowTotal = pathHasTotal(rowPath);
  const hasColTotal = pathHasTotal(colPath);

  // Get total labels if present
  const rowTotalLabel = isRowTotal
    ? getTotalLabelFromPath(spec.rowAxis, rowPath)
    : undefined;
  const colTotalLabel = hasColTotal
    ? getTotalLabelFromPath(spec.colAxis, colPath)
    : undefined;

  // Use global aggregates
  const aggregates = spec.aggregates;

  // Build signature for deduplication
  const signature = buildQuerySignature(
    rowGroupings,
    colGroupings,
    aggregates,
    isRowTotal,
    hasColTotal
  );

  return {
    rowPath,
    colPath,
    rowGroupings,
    colGroupings,
    aggregates,
    isRowTotal,
    hasColTotal,
    rowTotalLabel,
    colTotalLabel,
    signature,
  };
}

/**
 * Extract GroupingInfo array from a tree path.
 */
function extractGroupingsFromPath(
  tree: AxisNode | null,
  path: TreePath
): GroupingInfo[] {
  if (!tree) return [];

  const groupings: GroupingInfo[] = [];

  // Navigate the tree following the path
  let currentNode: AxisNode | null = tree;
  let pathIndex = 0;

  while (currentNode && pathIndex < path.length) {
    const segment = path[pathIndex];

    switch (segment.type) {
      case "dimension":
        if (
          currentNode.nodeType === "dimension" &&
          currentNode.name === segment.name
        ) {
          groupings.push({
            dimension: currentNode.name,
            label: currentNode.label,
            suppressLabel: currentNode.suppressLabel,
            limit: currentNode.limit,
            order: currentNode.order,
            acrossDimensions: currentNode.acrossDimensions,
          });
          currentNode = currentNode.child ?? null;
          pathIndex++;
        } else {
          // Path doesn't match tree - shouldn't happen
          break;
        }
        break;

      case "sibling":
        if (currentNode.nodeType === "siblings") {
          currentNode = currentNode.children[segment.index] ?? null;
          pathIndex++;
        } else {
          break;
        }
        break;

      case "total":
        if (currentNode.nodeType === "total") {
          // Total doesn't add a grouping - it collapses the parent
          currentNode = currentNode.child ?? null;
          pathIndex++;
        } else {
          break;
        }
        break;

      case "aggregate":
        // Aggregates don't add groupings
        pathIndex++;
        break;
    }
  }

  return groupings;
}

/**
 * Check if a path includes a total node.
 */
function pathHasTotal(path: TreePath): boolean {
  return path.some((segment) => segment.type === "total");
}

/**
 * Get the label from a total node in the path.
 */
function getTotalLabelFromPath(
  tree: AxisNode | null,
  path: TreePath
): string | undefined {
  if (!tree) return undefined;

  // Find the total segment and navigate to get its label
  let currentNode: AxisNode | null = tree;
  let pathIndex = 0;

  while (currentNode && pathIndex < path.length) {
    const segment = path[pathIndex];

    if (segment.type === "total" && currentNode.nodeType === "total") {
      return currentNode.label;
    }

    switch (currentNode.nodeType) {
      case "dimension":
        currentNode = currentNode.child ?? null;
        pathIndex++;
        break;
      case "siblings":
        if (segment.type === "sibling") {
          currentNode = currentNode.children[segment.index] ?? null;
          pathIndex++;
        } else {
          currentNode = null;
        }
        break;
      case "total":
        currentNode = currentNode.child ?? null;
        pathIndex++;
        break;
      case "aggregate":
        currentNode = null;
        break;
    }
  }

  return undefined;
}

/**
 * Build a signature string for query deduplication.
 *
 * Two queries are duplicates if they have:
 * - Same row groupings (dimensions in same order with same limits)
 * - Same column groupings
 * - Same aggregates
 * - Same total flags
 */
function buildQuerySignature(
  rowGroupings: GroupingInfo[],
  colGroupings: GroupingInfo[],
  aggregates: AggregateInfo[],
  isRowTotal: boolean,
  hasColTotal: boolean
): string {
  const parts: string[] = [];

  // Row groupings
  const rowPart = rowGroupings
    .map((g) => {
      let s = g.dimension;
      if (g.limit) {
        s += `[${g.limit.direction === "desc" ? "-" : ""}${g.limit.count}]`;
      }
      if (g.acrossDimensions) {
        s += `<${g.acrossDimensions.join(",")}>`;
      }
      return s;
    })
    .join("*");
  parts.push(`R:${rowPart || "TOTAL"}`);

  // Column groupings
  const colPart = colGroupings
    .map((g) => {
      let s = g.dimension;
      if (g.limit) {
        s += `[${g.limit.direction === "desc" ? "-" : ""}${g.limit.count}]`;
      }
      return s;
    })
    .join("*");
  parts.push(`C:${colPart || (hasColTotal ? "TOTAL" : "NONE")}`);

  // Aggregates
  const aggPart = aggregates
    .map((a) => a.name)
    .sort()
    .join(",");
  parts.push(`A:${aggPart}`);

  // Flags
  parts.push(`T:${isRowTotal ? "1" : "0"}${hasColTotal ? "1" : "0"}`);

  return parts.join("|");
}

// ---
// DEDUPLICATION
// ---

interface DeduplicationResult {
  queries: TaggedQuerySpec[];
  pathToQuery: Map<string, string>;
}

/**
 * Deduplicate queries by signature.
 *
 * Returns unique queries with IDs, and a mapping from paths to query IDs.
 */
function deduplicateQueries(rawQueries: RawQuery[]): DeduplicationResult {
  const signatureToQuery = new Map<string, TaggedQuerySpec>();
  const pathToQuery = new Map<string, string>();

  let queryIndex = 0;

  for (const raw of rawQueries) {
    const pathKey = `${serializeTreePath(raw.rowPath)}::${serializeTreePath(
      raw.colPath
    )}`;

    if (signatureToQuery.has(raw.signature)) {
      // Duplicate - map this path to the existing query
      const existing = signatureToQuery.get(raw.signature)!;
      pathToQuery.set(pathKey, existing.id);
    } else {
      // New unique query
      const queryId = `q${queryIndex++}`;
      const tagged: TaggedQuerySpec = {
        id: queryId,
        rowPath: raw.rowPath,
        colPath: raw.colPath,
        rowGroupings: raw.rowGroupings,
        colGroupings: raw.colGroupings,
        aggregates: raw.aggregates,
        isRowTotal: raw.isRowTotal,
        hasColTotal: raw.hasColTotal,
        rowTotalLabel: raw.rowTotalLabel,
        colTotalLabel: raw.colTotalLabel,
        signature: raw.signature,
      };
      signatureToQuery.set(raw.signature, tagged);
      pathToQuery.set(pathKey, queryId);
    }
  }

  return {
    queries: Array.from(signatureToQuery.values()),
    pathToQuery,
  };
}

// ---
// COLUMN VARIANT MERGING
// ---

interface MergeResult {
  queries: TaggedQuerySpec[];
  pathToQuery: Map<string, string>;
}

/**
 * Build a row-only signature for grouping queries by row structure.
 *
 * Two queries can be merged if they have the same row signature.
 * The row signature includes:
 * - Row groupings (dimensions, limits)
 * - Row total flag and label
 * - Aggregates (must be identical)
 */
function buildRowSignature(query: TaggedQuerySpec): string {
  const parts: string[] = [];

  // Row groupings
  const rowPart = query.rowGroupings
    .map((g) => {
      let s = g.dimension;
      if (g.limit) {
        s += `[${g.limit.direction === "desc" ? "-" : ""}${g.limit.count}]`;
      }
      if (g.acrossDimensions) {
        s += `<${g.acrossDimensions.join(",")}>`;
      }
      return s;
    })
    .join("*");
  parts.push(`R:${rowPart || "TOTAL"}`);

  // Aggregates (must be same for merge)
  const aggPart = query.aggregates
    .map((a) => a.name)
    .sort()
    .join(",");
  parts.push(`A:${aggPart}`);

  // Row total flag
  parts.push(`RT:${query.isRowTotal ? "1" : "0"}`);
  if (query.rowTotalLabel) {
    parts.push(`RTL:${query.rowTotalLabel}`);
  }

  return parts.join("|");
}

/**
 * Check if a query can participate in merging.
 *
 * Some queries cannot be merged:
 * - Queries with column groupings that have limits (requires restructuring)
 * - Queries with percentage aggregates that need flat structure
 *   (merging would break cross-scope all() expressions)
 */
function canMergeQuery(query: TaggedQuerySpec): boolean {
  // Check if any column grouping has a limit
  // Limits require restructured query builders that don't handle merging
  for (const g of query.colGroupings) {
    if (g.limit) {
      return false;
    }
  }

  // Check for percentage aggregates with specific scopes
  for (const agg of query.aggregates) {
    if (agg.isPercentage && agg.denominatorScope) {
      const scope = agg.denominatorScope;
      // 'all' scope with columns needs flat query
      if (scope === "all" && query.colGroupings.length > 0) {
        return false;
      }
      // 'rows' or 'cols' scope needs flat query
      if (scope === "rows" || scope === "cols") {
        return false;
      }
      // Specific dimension scopes may need flat query
      if (Array.isArray(scope)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Merge queries that share the same row structure into combined queries.
 *
 * This optimization reduces the number of database queries by combining
 * queries that differ only in their column groupings. For example:
 *
 * Before: COLS gender | sector_label generates 2 queries
 * After:  Single query with 2 nests: by_gender, by_sector_label
 *
 * The merged query produces all the data needed for both column variants
 * in a single database round-trip.
 */
function mergeColumnVariants(
  queries: TaggedQuerySpec[],
  pathToQuery: Map<string, string>
): MergeResult {
  // Separate mergeable from non-mergeable queries
  const mergeable: TaggedQuerySpec[] = [];
  const nonMergeable: TaggedQuerySpec[] = [];

  for (const q of queries) {
    if (canMergeQuery(q)) {
      mergeable.push(q);
    } else {
      nonMergeable.push(q);
    }
  }

  // Group mergeable queries by row signature
  const rowGroups = new Map<string, TaggedQuerySpec[]>();
  for (const q of mergeable) {
    const sig = buildRowSignature(q);
    const group = rowGroups.get(sig) || [];
    group.push(q);
    rowGroups.set(sig, group);
  }

  // Build merged queries
  const mergedQueries: TaggedQuerySpec[] = [];
  const newPathToQuery = new Map<string, string>();
  let queryIndex = 0;

  // Process each group
  for (const group of rowGroups.values()) {
    if (group.length === 1) {
      // Single query - no merging needed
      const q = group[0];
      const newId = `q${queryIndex++}`;
      const newQuery: TaggedQuerySpec = {
        ...q,
        id: newId,
      };
      mergedQueries.push(newQuery);

      // Update path mapping
      for (const [path, oldId] of pathToQuery.entries()) {
        if (oldId === q.id) {
          newPathToQuery.set(path, newId);
        }
      }
    } else {
      // Multiple queries to merge
      const merged = mergeQueryGroup(group, queryIndex++);
      mergedQueries.push(merged);

      // Update path mappings for all queries in the group
      for (const q of group) {
        for (const [path, oldId] of pathToQuery.entries()) {
          if (oldId === q.id) {
            newPathToQuery.set(path, merged.id);
          }
        }
      }
    }
  }

  // Add non-mergeable queries with new IDs
  for (const q of nonMergeable) {
    const newId = `q${queryIndex++}`;
    const newQuery: TaggedQuerySpec = {
      ...q,
      id: newId,
    };
    mergedQueries.push(newQuery);

    // Update path mapping
    for (const [path, oldId] of pathToQuery.entries()) {
      if (oldId === q.id) {
        newPathToQuery.set(path, newId);
      }
    }
  }

  return {
    queries: mergedQueries,
    pathToQuery: newPathToQuery,
  };
}

/**
 * Merge a group of queries with the same row structure into one.
 *
 * The first query becomes the primary, and others become additionalColVariants.
 */
function mergeQueryGroup(
  group: TaggedQuerySpec[],
  index: number
): TaggedQuerySpec {
  // Use the first query as the base
  const primary = group[0];

  // Create column variants from all other queries
  const additionalColVariants: ColVariant[] = group.slice(1).map((q) => ({
    colGroupings: q.colGroupings,
    isTotal: q.hasColTotal,
    totalLabel: q.colTotalLabel,
    colPath: q.colPath,
  }));

  // Build a new signature that reflects the merged state
  // Include column info from all variants for debugging
  const colParts = [
    buildColSignaturePart(primary.colGroupings, primary.hasColTotal),
    ...additionalColVariants.map((v) =>
      buildColSignaturePart(v.colGroupings, v.isTotal)
    ),
  ].join("+");

  const mergedSignature = `${buildRowSignature(primary)}|MERGED:${colParts}`;

  return {
    id: `q${index}`,
    rowPath: primary.rowPath,
    colPath: primary.colPath, // Primary's col path
    rowGroupings: primary.rowGroupings,
    colGroupings: primary.colGroupings,
    aggregates: primary.aggregates,
    isRowTotal: primary.isRowTotal,
    hasColTotal: primary.hasColTotal,
    rowTotalLabel: primary.rowTotalLabel,
    colTotalLabel: primary.colTotalLabel,
    signature: mergedSignature,
    additionalColVariants,
  };
}

/**
 * Build a column signature part for debugging/identification.
 */
function buildColSignaturePart(
  colGroupings: GroupingInfo[],
  isTotal: boolean
): string {
  if (isTotal && colGroupings.length === 0) {
    return "ALL";
  }
  return (
    colGroupings
      .map((g) => {
        let s = g.dimension;
        if (g.limit) {
          s += `[${g.limit.direction === "desc" ? "-" : ""}${g.limit.count}]`;
        }
        return s;
      })
      .join("*") || "NONE"
  );
}

// ---
// DEBUGGING
// ---

/**
 * Print a query plan for debugging.
 */
export function printQueryPlan(plan: QueryPlan): string {
  const lines: string[] = [];
  lines.push("QueryPlan:");
  lines.push(`  Total queries: ${plan.queries.length}`);
  lines.push(`  Path mappings: ${plan.pathToQuery.size}`);
  lines.push("");

  for (const query of plan.queries) {
    lines.push(`  Query ${query.id}:`);
    lines.push(`    signature: ${query.signature}`);
    lines.push(`    rowPath: ${serializeTreePath(query.rowPath)}`);
    lines.push(`    colPath: ${serializeTreePath(query.colPath)}`);

    const rowDims = query.rowGroupings.map((g) => {
      let s = g.dimension;
      if (g.limit)
        s += `[${g.limit.direction === "desc" ? "-" : ""}${g.limit.count}]`;
      if (g.acrossDimensions) s += ` ACROSS(${g.acrossDimensions.join(",")})`;
      return s;
    });
    lines.push(`    rowGroupings: [${rowDims.join(", ")}]`);

    const colDims = query.colGroupings.map((g) => g.dimension);
    lines.push(`    colGroupings: [${colDims.join(", ")}]`);

    lines.push(
      `    aggregates: [${query.aggregates.map((a) => a.name).join(", ")}]`
    );
    lines.push(`    isRowTotal: ${query.isRowTotal}`);
    lines.push(`    hasColTotal: ${query.hasColTotal}`);
    if (query.rowTotalLabel)
      lines.push(`    rowTotalLabel: "${query.rowTotalLabel}"`);
    if (query.colTotalLabel)
      lines.push(`    colTotalLabel: "${query.colTotalLabel}"`);
    lines.push("");
  }

  // Show dedup info
  const uniqueSigs = new Set(plan.queries.map((q) => q.signature));
  if (plan.pathToQuery.size > uniqueSigs.size) {
    lines.push(
      `  Deduplicated: ${
        plan.pathToQuery.size - uniqueSigs.size
      } duplicate queries merged`
    );
  }

  return lines.join("\n");
}

/**
 * Count how many queries would be generated without deduplication.
 */
export function countRawQueries(spec: TableSpec): number {
  const rowBranches = spec.rowAxis ? collectBranches(spec.rowAxis) : [[]];
  const colBranches = spec.colAxis ? collectBranches(spec.colAxis) : [[]];
  return rowBranches.length * colBranches.length;
}

// ---
// MALLOY QUERY GENERATION
// ---

export interface MalloyQuerySpec {
  id: string;
  malloy: string;
  rowGroupings: GroupingInfo[];
  colGroupings: GroupingInfo[];
  /**
   * When true, the Malloy query structure is inverted from the logical axes.
   * This happens when we restructure for global column limits:
   * - Malloy outer group_by = logical column dimension (for global limit)
   * - Malloy nested = logical row dimension
   *
   * The renderer should swap its interpretation of the data when this is true.
   */
  axesInverted?: boolean;
  /**
   * When true, this is a flat query where all dimensions are in a single group_by.
   * This happens for percentage aggregates with ACROSS COLS/ROWS scope.
   *
   * The grid builder should not expect nested by_X structures - all dimension
   * values are directly on each row.
   */
  isFlatQuery?: boolean;
}

/**
 * Options for generating Malloy queries.
 */
export interface GenerateMalloyOptions {
  /** Filter condition to apply to all queries (from WHERE clause) */
  where?: string;

  /**
   * Which axis was declared first in the source.
   * Used to determine limit priority when both axes have limits.
   * First-declared axis gets global limits, second gets per-parent limits.
   */
  firstAxis?: "row" | "col";

  /**
   * Ordering provider for definition-order sorting.
   * When provided with hasDefinitionOrder() returning true for a dimension,
   * that dimension will be sorted by definition order instead of alphabetically.
   */
  orderingProvider?: DimensionOrderingProvider;

  /**
   * If true, don't add NULL filters for dimensions.
   * When false (default), each nest adds a WHERE clause filtering out NULL values
   * for its specific column dimensions.
   */
  includeNulls?: boolean;
}

/**
 * Generate Malloy query strings from a QueryPlan.
 *
 * @param plan The query plan
 * @param sourceName The Malloy source name (e.g., 'names')
 * @param options Optional settings including WHERE clause and dimension registry
 * @returns Array of Malloy query specifications
 */
export function generateMalloyQueries(
  plan: QueryPlan,
  sourceName: string,
  options: GenerateMalloyOptions = {}
): MalloyQuerySpec[] {
  const firstAxis = options.firstAxis ?? "row";

  // Set module-level ordering provider for definition-order sorting
  currentOrderingProvider = options.orderingProvider;
  // Set module-level flag for NULL filtering (default: add NULL filters)
  currentIncludeNulls = options.includeNulls ?? false;

  try {
    return plan.queries.map((query) => {
      const result = buildMalloyFromSpec(
        query,
        sourceName,
        options.where,
        firstAxis
      );
      return {
        id: query.id,
        malloy: result.malloy,
        rowGroupings: query.rowGroupings,
        colGroupings: query.colGroupings,
        axesInverted: result.axesInverted,
        isFlatQuery: result.isFlatQuery,
      };
    });
  } finally {
    // Clear the module-level state after query generation
    currentOrderingProvider = undefined;
    currentIncludeNulls = false;
  }
}

interface BuildMalloyResult {
  malloy: string;
  axesInverted: boolean;
  isFlatQuery: boolean;
}

/**
 * Check if a query needs flat structure due to percentage aggregates.
 *
 * Flat queries are needed when:
 * - We have percentage aggregates with specific dimension scopes
 * - AND those dimensions span both row and column axes
 *
 * In nested queries, `all(agg, dim)` only works if `dim` is in the current scope.
 * Flat queries put all dimensions in the same group_by, making all dims accessible.
 */
function needsFlatQueryForPercentage(query: TaggedQuerySpec): boolean {
  // Check if any aggregate has a denominatorScope referencing specific dimensions
  for (const agg of query.aggregates) {
    if (agg.isPercentage && agg.denominatorScope) {
      const scope = agg.denominatorScope;

      // 'all' scope needs flat query when we have column groupings
      // because all() inside a nest only computes total within the nest scope
      if (scope === "all") {
        if (query.colGroupings.length > 0) {
          return true; // Need flat query for true grand total
        }
        continue; // No cols, nested structure is fine
      }

      // 'rows' and 'cols' need flat structure if we have both axes
      if (
        (scope === "rows" || scope === "cols") &&
        query.colGroupings.length > 0
      ) {
        return true;
      }

      // Specific dimension scope - check if it crosses axes
      if (Array.isArray(scope) && query.colGroupings.length > 0) {
        const rowDims = new Set(query.rowGroupings.map((g) => g.dimension));
        const colDims = new Set(query.colGroupings.map((g) => g.dimension));

        // If any scope dimension is in cols but aggregate computed at row level, need flat
        for (const dim of scope) {
          if (colDims.has(dim) || rowDims.has(dim)) {
            return true; // Any dimension reference needs flat for cross-scope access
          }
        }
      }
    }
  }

  return false;
}

/**
 * Build a Malloy query string from a TaggedQuerySpec.
 *
 * Key insight for limits:
 * - Declaration order determines priority: first-declared axis gets global limits
 * - Second-declared axis limits become per-parent (within the first axis's data)
 * - Within-axis nesting is always hierarchical (e.g., a * b[-3] = top 3 b per a)
 *
 * When the first-declared axis has limits, it becomes the outer query level.
 * The second-declared axis is nested inside, with its limits applied per-parent.
 */
function buildMalloyFromSpec(
  query: TaggedQuerySpec,
  sourceName: string,
  where: string | undefined,
  firstAxis: "row" | "col"
): BuildMalloyResult {
  // Check if we need flat query structure for percentage aggregates
  if (needsFlatQueryForPercentage(query)) {
    return {
      malloy: buildFlatQuery(query, sourceName, where),
      axesInverted: false,
      isFlatQuery: true,
    };
  }

  // Find the first column grouping with a limit (no ACROSS)
  const limitedColIndex = query.colGroupings.findIndex((g) => {
    const hasLimit = g.limit !== undefined;
    const hasAcross = g.acrossDimensions && g.acrossDimensions.length > 0;
    return hasLimit && !hasAcross;
  });

  // Find the first row grouping with a limit (no ACROSS)
  const limitedRowIndex = query.rowGroupings.findIndex((g) => {
    const hasLimit = g.limit !== undefined;
    const hasAcross = g.acrossDimensions && g.acrossDimensions.length > 0;
    return hasLimit && !hasAcross;
  });

  // Check if first row has a limit (for global row limit handling)
  const firstRowHasLimit = limitedRowIndex === 0;
  const colsHaveLimit = limitedColIndex !== -1;
  const rowsHaveLimit = limitedRowIndex !== -1;

  // Determine restructuring based on declaration order priority:
  // - First-declared axis with limits gets priority (global limits)
  // - Second-declared axis limits become per-parent

  // Column restructuring: make columns outer, rows nested inside
  // Do this when: cols are first AND have limits, OR cols have limits and rows don't
  const needsColRestructure =
    colsHaveLimit &&
    query.rowGroupings.length > 0 &&
    !query.isRowTotal &&
    (firstAxis === "col" || !firstRowHasLimit);

  if (needsColRestructure) {
    return {
      malloy: buildRestructuredQueryForColLimit(
        query,
        sourceName,
        where,
        limitedColIndex
      ),
      axesInverted: true,
      isFlatQuery: false,
    };
  }

  // Row restructuring: when there's hierarchy in rows with limits
  // This handles cases like state[-5] * gender where gender needs to be nested under state,
  // OR cases like state * city[-3] where state goes to group_by and city is nested.
  // Restructure whenever there are multiple row dimensions and one has a limit.
  const needsRowRestructure = rowsHaveLimit && query.rowGroupings.length > 1;

  if (needsRowRestructure) {
    return {
      malloy: buildRestructuredQueryForRowLimit(
        query,
        sourceName,
        where,
        limitedRowIndex
      ),
      axesInverted: false, // Row dims stay as "rows" for rendering
      isFlatQuery: false,
    };
  }

  // Standard query structure: rows are outer, cols are nested
  // This is the default and works when:
  // - Rows are first with limits (row limits are global, col limits per-row)
  // - No cross-axis limit conflicts
  return {
    malloy: buildStandardQuery(query, sourceName, where),
    axesInverted: false,
    isFlatQuery: false,
  };
}

/**
 * Build a restructured query where column dimensions with limits are applied
 * ACROSS the row dimensions (not per-row).
 *
 * Structure for COLS state * name[-3] ROWS year:
 * ```
 * group_by: state              // col dims before limited one
 * nest: by_name is {           // limited col dim
 *   group_by: name
 *   aggregate: births_sum
 *   nest: by_year is {         // row dims nested inside
 *     group_by: year
 *     aggregate: births_sum
 *   }
 *   order_by: births_sum desc  // limit applied here
 *   limit: 3
 * }
 * ```
 *
 * @param limitedColIndex Index of the column grouping with the limit
 */
function buildRestructuredQueryForColLimit(
  query: TaggedQuerySpec,
  sourceName: string,
  where: string | undefined,
  limitedColIndex: number
): string {
  const lines: string[] = [];
  const limitedColGrouping = query.colGroupings[limitedColIndex];

  // Column groupings before the limited one
  const colsBefore = query.colGroupings.slice(0, limitedColIndex);
  // Column groupings after the limited one (if any)
  const colsAfter = query.colGroupings.slice(limitedColIndex + 1);

  lines.push(`run: ${sourceName} -> {`);

  // Build WHERE clause: combine user's where + NULL filters for colsBefore dimensions
  let fullWhere = where;
  if (!currentIncludeNulls && colsBefore.length > 0) {
    const colsBeforeNullFilters = colsBefore
      .map((g) => `${escapeFieldName(g.dimension)} is not null`)
      .join(" and ");
    fullWhere = fullWhere
      ? `(${fullWhere}) and ${colsBeforeNullFilters}`
      : colsBeforeNullFilters;
  }

  if (fullWhere) {
    lines.push(`  where: ${fullWhere}`);
  }

  // Column dimensions BEFORE the limited one become outer group_by
  if (colsBefore.length > 0) {
    const groupByParts: string[] = [];
    for (const g of colsBefore) {
      const escaped = escapeFieldName(g.dimension);
      if (g.label && g.label !== g.dimension) {
        groupByParts.push(`\`${g.label}\` is ${escaped}`);
      } else {
        groupByParts.push(escaped);
      }
    }
    lines.push(`  group_by:`);
    for (const part of groupByParts) {
      lines.push(`    ${part}`);
    }
  }

  // The limited column dimension becomes a nest with limit
  const limitedEscaped = escapeFieldName(limitedColGrouping.dimension);
  const nestName = `by_${limitedColGrouping.dimension}`;
  lines.push(`  nest: ${nestName} is {`);

  // Add WHERE clause for NULL filter on the limited dimension (and colsAfter dims)
  if (!currentIncludeNulls) {
    const limitedAndAfterDims = [limitedColGrouping, ...colsAfter];
    const nullFilters = limitedAndAfterDims
      .map((g) => `${escapeFieldName(g.dimension)} is not null`)
      .join(" and ");
    lines.push(`    where: ${nullFilters}`);
  }

  // Group by the limited dimension
  if (
    limitedColGrouping.label &&
    limitedColGrouping.label !== limitedColGrouping.dimension
  ) {
    lines.push(
      `    group_by: \`${limitedColGrouping.label}\` is ${limitedEscaped}`
    );
  } else {
    lines.push(`    group_by: ${limitedEscaped}`);
  }

  // Aggregate at this level for ordering
  // Ensure the orderBy aggregate is included (it might not be displayed but is needed for ordering)
  let aggregatesToUse = query.aggregates;
  if (limitedColGrouping.limit?.orderBy) {
    aggregatesToUse = ensureOrderByAggregateInList(
      limitedColGrouping.limit.orderBy,
      aggregatesToUse
    );
  }
  const aggLines = buildAggregateLines(
    aggregatesToUse,
    "    ",
    query.rowGroupings,
    query.colGroupings
  );
  lines.push(...aggLines);

  // Nest remaining col dimensions (colsAfter) first, then row dimensions inside those
  // This maintains the col axis hierarchy: state > gender, with year inside
  if (colsAfter.length > 0) {
    // Pass empty array to skip NULL filters (already handled above)
    const colNestLines = buildColNestForRestructured(
      colsAfter,
      query.aggregates,
      query.rowGroupings,
      "    ",
      []
    );
    lines.push(...colNestLines);
  } else if (query.rowGroupings.length > 0) {
    // No remaining col dimensions, just nest row dimensions directly
    const rowNestLines = buildRowNestForRestructured(
      query.rowGroupings,
      query.aggregates,
      [],
      "    "
    );
    lines.push(...rowNestLines);
  }

  // Apply limit at the limited dimension level
  const orderDir =
    limitedColGrouping.limit!.direction === "desc" ? "desc" : "asc";
  const orderField = buildOrderByField(
    limitedColGrouping.limit!,
    limitedColGrouping.dimension
  );
  lines.push(`    order_by: ${orderField} ${orderDir}`);
  lines.push(`    limit: ${limitedColGrouping.limit!.count}`);

  lines.push(`  }`);
  lines.push("}");

  return lines.join("\n");
}

/**
 * Build a restructured query where row dimensions with limits are applied
 * ACROSS the column dimensions (not per-column).
 *
 * Structure for ROWS state * name[-3] COLS year:
 * ```
 * group_by: state              // row dims before limited one
 * nest: by_name is {           // limited row dim
 *   group_by: name
 *   aggregate: births_sum
 *   nest: by_year is {         // col dims nested inside
 *     group_by: year
 *     aggregate: births_sum
 *   }
 *   order_by: births_sum desc  // limit applied here
 *   limit: 3
 * }
 * ```
 *
 * @param limitedRowIndex Index of the row grouping with the limit
 */
function buildRestructuredQueryForRowLimit(
  query: TaggedQuerySpec,
  sourceName: string,
  where: string | undefined,
  limitedRowIndex: number
): string {
  const lines: string[] = [];
  const limitedRowGrouping = query.rowGroupings[limitedRowIndex];

  // Row groupings before the limited one
  const rowsBefore = query.rowGroupings.slice(0, limitedRowIndex);
  // Row groupings after the limited one (if any)
  const rowsAfter = query.rowGroupings.slice(limitedRowIndex + 1);

  lines.push(`run: ${sourceName} -> {`);

  if (where) {
    lines.push(`  where: ${where}`);
  }

  // Row dimensions BEFORE the limited one become outer group_by
  if (rowsBefore.length > 0) {
    const groupByParts: string[] = [];
    for (const g of rowsBefore) {
      const escaped = escapeFieldName(g.dimension);
      if (g.label && g.label !== g.dimension) {
        groupByParts.push(`\`${g.label}\` is ${escaped}`);
      } else {
        groupByParts.push(escaped);
      }
    }
    lines.push(`  group_by: ${groupByParts.join(", ")}`);
  }

  // The limited row dimension becomes a nest with limit
  const limitedEscaped = escapeFieldName(limitedRowGrouping.dimension);
  const nestName = `by_${limitedRowGrouping.dimension}`;
  lines.push(`  nest: ${nestName} is {`);

  // Group by the limited dimension
  if (
    limitedRowGrouping.label &&
    limitedRowGrouping.label !== limitedRowGrouping.dimension
  ) {
    lines.push(
      `    group_by: \`${limitedRowGrouping.label}\` is ${limitedEscaped}`
    );
  } else {
    lines.push(`    group_by: ${limitedEscaped}`);
  }

  // Aggregate at this level for ordering
  // Ensure the orderBy aggregate is included (it might not be displayed but is needed for ordering)
  let aggregatesToUse = query.aggregates;
  if (limitedRowGrouping.limit?.orderBy) {
    aggregatesToUse = ensureOrderByAggregateInList(
      limitedRowGrouping.limit.orderBy,
      aggregatesToUse
    );
  }
  const aggLines = buildAggregateLines(
    aggregatesToUse,
    "    ",
    query.rowGroupings,
    query.colGroupings
  );
  lines.push(...aggLines);

  // Nest any row dimensions after the limited one, with column dimensions nested inside
  // This creates the proper hierarchy: state > gender > year (not state > [gender, year])
  if (rowsAfter.length > 0) {
    const rowNestLines = buildRowNestForRestructured(
      rowsAfter,
      query.aggregates,
      query.colGroupings,
      "    "
    );
    lines.push(...rowNestLines);
  } else if (query.colGroupings.length > 0) {
    // No more row dimensions, just nest columns directly
    const colNestLines = buildNestClauseWithIndent(
      query.colGroupings,
      query.aggregates,
      false,
      "    "
    );
    lines.push(...colNestLines);
  }

  // Apply limit at the limited dimension level
  const orderDir =
    limitedRowGrouping.limit!.direction === "desc" ? "desc" : "asc";
  const orderField = buildOrderByField(
    limitedRowGrouping.limit!,
    limitedRowGrouping.dimension
  );
  lines.push(`    order_by: ${orderField} ${orderDir}`);
  lines.push(`    limit: ${limitedRowGrouping.limit!.count}`);

  lines.push(`  }`);
  lines.push("}");

  return lines.join("\n");
}

/**
 * Build a nest clause for row dimensions in a restructured query.
 * Column groupings are nested inside the innermost row dimension.
 */
function buildRowNestForRestructured(
  rowGroupings: GroupingInfo[],
  aggregates: AggregateInfo[],
  colGroupings: GroupingInfo[] = [],
  baseIndent: string = "  "
): string[] {
  if (rowGroupings.length === 0) return [];

  const result: string[] = [];
  const firstRowGroup = rowGroupings[0];
  const remainingRowGroups = rowGroupings.slice(1);

  // Check if we need a definition-order aggregate
  // Use it when: no explicit order specified AND dimension has definition order
  // This applies to both limited and unlimited queries
  let defOrderAgg: { name: string; dimName: string } | null = null;
  const hasExplicitOrder =
    firstRowGroup.limit?.orderBy || firstRowGroup.order?.orderBy;
  if (
    !hasExplicitOrder &&
    currentOrderingProvider?.hasDefinitionOrder(firstRowGroup.dimension)
  ) {
    const orderDimName = currentOrderingProvider.getOrderDimensionName(
      firstRowGroup.dimension
    );
    if (orderDimName) {
      defOrderAgg = { name: `${orderDimName}_min`, dimName: orderDimName };
    }
  }

  // Create nest for the first row dimension
  const escaped = escapeFieldName(firstRowGroup.dimension);
  const nestName = `by_${firstRowGroup.dimension}`;
  result.push(`${baseIndent}nest: ${nestName} is {`);

  // Group by this dimension
  if (firstRowGroup.label && firstRowGroup.label !== firstRowGroup.dimension) {
    result.push(
      `${baseIndent}  group_by: \`${firstRowGroup.label}\` is ${escaped}`
    );
  } else {
    result.push(`${baseIndent}  group_by: ${escaped}`);
  }

  // Add aggregates
  result.push(`${baseIndent}  aggregate:`);
  for (const agg of aggregates) {
    const expr = buildAggExpression(agg.measure, agg.aggregation);
    const escapedName = escapeFieldName(agg.name);
    result.push(`${baseIndent}    ${escapedName} is ${expr}`);
  }
  // Add definition-order aggregate inside the same aggregate block
  if (defOrderAgg) {
    result.push(
      `${baseIndent}    ${escapeFieldName(
        defOrderAgg.name
      )} is ${escapeFieldName(defOrderAgg.dimName)}.min()`
    );
  }

  // Recursively nest remaining row dimensions, with columns at the innermost level
  if (remainingRowGroups.length > 0) {
    const innerRowLines = buildRowNestForRestructured(
      remainingRowGroups,
      aggregates,
      colGroupings,
      baseIndent + "  "
    );
    result.push(...innerRowLines);
  } else if (colGroupings.length > 0) {
    // No more row dimensions - nest columns here
    const colNestLines = buildNestClauseWithIndent(
      colGroupings,
      aggregates,
      false,
      baseIndent + "  "
    );
    result.push(...colNestLines);
  }

  // Apply limit if this row grouping has one
  if (firstRowGroup.limit) {
    const orderDir = firstRowGroup.limit.direction === "desc" ? "desc" : "asc";
    // Use definition-order aggregate if available and no explicit orderBy
    const orderField =
      defOrderAgg && !firstRowGroup.limit.orderBy
        ? escapeFieldName(defOrderAgg.name)
        : buildOrderByField(firstRowGroup.limit, firstRowGroup.dimension);
    result.push(`${baseIndent}  order_by: ${orderField} ${orderDir}`);
    result.push(`${baseIndent}  limit: ${firstRowGroup.limit.count}`);
  } else if (firstRowGroup.order?.direction) {
    // Explicit order without limit - use definition order if available
    const orderField =
      defOrderAgg && !firstRowGroup.order.orderBy
        ? escapeFieldName(defOrderAgg.name)
        : buildOrderByFieldFromOrder(
            firstRowGroup.order,
            firstRowGroup.dimension
          );
    result.push(
      `${baseIndent}  order_by: ${orderField} ${firstRowGroup.order.direction}`
    );
  } else if (defOrderAgg) {
    // Use the definition-order aggregate that was already added
    result.push(
      `${baseIndent}  order_by: ${escapeFieldName(defOrderAgg.name)} asc`
    );
  }

  result.push(`${baseIndent}}`);

  return result;
}

/**
 * Build a nest clause for column dimensions in a restructured query.
 * Row groupings are nested inside the innermost column dimension.
 * This is the mirror of buildRowNestForRestructured for col-first queries.
 *
 * @param allColDimensions Optional - pass all column dimensions on first call for NULL filter.
 *                         On recursive calls, this is undefined.
 */
function buildColNestForRestructured(
  colGroupings: GroupingInfo[],
  aggregates: AggregateInfo[],
  rowGroupings: GroupingInfo[] = [],
  baseIndent: string = "  ",
  allColDimensions?: string[]
): string[] {
  if (colGroupings.length === 0) return [];

  const result: string[] = [];
  const firstColGroup = colGroupings[0];
  const remainingColGroups = colGroupings.slice(1);

  // Build NULL filter for first call only
  const colDimsForFilter =
    allColDimensions ?? colGroupings.map((g) => g.dimension);
  const isFirstLevel = allColDimensions === undefined;
  let colNullFilterWhere: string | null = null;
  if (isFirstLevel && !currentIncludeNulls && colDimsForFilter.length > 0) {
    const nullFilters = colDimsForFilter
      .map((dim) => `${escapeFieldName(dim)} is not null`)
      .join(" and ");
    colNullFilterWhere = nullFilters;
  }

  // Create nest for the first column dimension
  const escaped = escapeFieldName(firstColGroup.dimension);
  const nestName = `by_${firstColGroup.dimension}`;
  result.push(`${baseIndent}nest: ${nestName} is {`);

  // Add WHERE clause for column NULL filters at the first level only.
  if (colNullFilterWhere) {
    result.push(`${baseIndent}  where: ${colNullFilterWhere}`);
  }

  // Group by this dimension
  if (firstColGroup.label && firstColGroup.label !== firstColGroup.dimension) {
    result.push(
      `${baseIndent}  group_by: \`${firstColGroup.label}\` is ${escaped}`
    );
  } else {
    result.push(`${baseIndent}  group_by: ${escaped}`);
  }

  // Check if we need a definition-order aggregate (before building aggregates)
  // Use it when: no explicit order specified AND dimension has definition order
  // This applies to both limited and unlimited queries
  let defOrderAgg: { name: string; dimName: string } | null = null;
  const hasExplicitOrder =
    firstColGroup.limit?.orderBy || firstColGroup.order?.orderBy;
  if (
    !hasExplicitOrder &&
    currentOrderingProvider?.hasDefinitionOrder(firstColGroup.dimension)
  ) {
    const orderDimName = currentOrderingProvider.getOrderDimensionName(
      firstColGroup.dimension
    );
    if (orderDimName) {
      defOrderAgg = { name: `${orderDimName}_min`, dimName: orderDimName };
    }
  }

  // Add aggregates (including ordering aggregate if needed)
  result.push(`${baseIndent}  aggregate:`);
  for (const agg of aggregates) {
    const expr = buildAggExpression(agg.measure, agg.aggregation);
    const escapedName = escapeFieldName(agg.name);
    result.push(`${baseIndent}    ${escapedName} is ${expr}`);
  }
  // Add ordering aggregate inside the same aggregate block
  if (defOrderAgg) {
    result.push(
      `${baseIndent}    ${escapeFieldName(
        defOrderAgg.name
      )} is ${escapeFieldName(defOrderAgg.dimName)}.min()`
    );
  }

  // Recursively nest remaining column dimensions, with rows at the innermost level
  if (remainingColGroups.length > 0) {
    // Pass empty array to signal this is not the first level (NULL filters already added)
    const innerColLines = buildColNestForRestructured(
      remainingColGroups,
      aggregates,
      rowGroupings,
      baseIndent + "  ",
      []
    );
    result.push(...innerColLines);
  } else if (rowGroupings.length > 0) {
    // No more column dimensions - nest rows here
    const rowNestLines = buildRowNestForRestructured(
      rowGroupings,
      aggregates,
      [],
      baseIndent + "  "
    );
    result.push(...rowNestLines);
  }

  // Apply limit if this column grouping has one
  if (firstColGroup.limit) {
    const orderDir = firstColGroup.limit.direction === "desc" ? "desc" : "asc";
    // Use definition-order aggregate if available and no explicit orderBy
    const orderField =
      defOrderAgg && !firstColGroup.limit.orderBy
        ? escapeFieldName(defOrderAgg.name)
        : buildOrderByField(firstColGroup.limit, firstColGroup.dimension);
    result.push(`${baseIndent}  order_by: ${orderField} ${orderDir}`);
    result.push(`${baseIndent}  limit: ${firstColGroup.limit.count}`);
  } else if (firstColGroup.order?.direction) {
    // Explicit order without limit - use definition order if available
    const orderField =
      defOrderAgg && !firstColGroup.order.orderBy
        ? escapeFieldName(defOrderAgg.name)
        : buildOrderByFieldFromOrder(
            firstColGroup.order,
            firstColGroup.dimension
          );
    result.push(
      `${baseIndent}  order_by: ${orderField} ${firstColGroup.order.direction}`
    );
  } else if (defOrderAgg) {
    // Use the already-added ordering aggregate
    result.push(
      `${baseIndent}  order_by: ${escapeFieldName(defOrderAgg.name)} asc`
    );
  }

  result.push(`${baseIndent}}`);

  return result;
}

/**
 * Build a nest clause with custom indentation.
 */
function buildNestClauseWithIndent(
  colGroupings: GroupingInfo[],
  aggregates: AggregateInfo[],
  skipLimits: boolean,
  baseIndent: string
): string[] {
  if (colGroupings.length === 0) return [];

  // Build NULL filter WHERE clause for column dimensions if needed.
  const colDimensions = colGroupings.map((g) => g.dimension);
  let colNullFilterWhere: string | null = null;
  if (!currentIncludeNulls && colDimensions.length > 0) {
    const nullFilters = colDimensions
      .map((dim) => `${escapeFieldName(dim)} is not null`)
      .join(" and ");
    colNullFilterWhere = nullFilters;
  }

  // Build nested structure for column groupings
  function buildLevel(groupings: GroupingInfo[], level: number): string[] {
    if (groupings.length === 0) return [];

    const currentGroup = groupings[0];
    const remaining = groupings.slice(1);
    const indent = baseIndent + "  ".repeat(level);
    const result: string[] = [];

    const nestName = `by_${currentGroup.dimension}`;
    result.push(`${indent}nest: ${nestName} is {`);

    // Add WHERE clause for column NULL filters at the first nest level only.
    if (level === 0 && colNullFilterWhere) {
      result.push(`${indent}  where: ${colNullFilterWhere}`);
    }

    const escaped = escapeFieldName(currentGroup.dimension);
    if (currentGroup.label && currentGroup.label !== currentGroup.dimension) {
      result.push(
        `${indent}  group_by: \`${currentGroup.label}\` is ${escaped}`
      );
    } else {
      result.push(`${indent}  group_by: ${escaped}`);
    }

    // Check if we need a definition-order aggregate (before building aggregates)
    // Use it when: no explicit order specified AND dimension has definition order
    let defOrderAgg: { name: string; dimName: string } | null = null;
    const hasExplicitOrder =
      currentGroup.limit?.orderBy || currentGroup.order?.orderBy;
    if (
      !hasExplicitOrder &&
      currentOrderingProvider?.hasDefinitionOrder(currentGroup.dimension)
    ) {
      const orderDimName = currentOrderingProvider.getOrderDimensionName(
        currentGroup.dimension
      );
      if (orderDimName) {
        defOrderAgg = { name: `${orderDimName}_min`, dimName: orderDimName };
      }
    }

    // Add aggregates (including ordering aggregate if needed)
    result.push(`${indent}  aggregate:`);
    for (const agg of aggregates) {
      const expr = buildAggExpression(agg.measure, agg.aggregation);
      const escapedName = escapeFieldName(agg.name);
      result.push(`${indent}    ${escapedName} is ${expr}`);
    }
    // Add ordering aggregate inside the same aggregate block
    if (defOrderAgg) {
      result.push(
        `${indent}    ${escapeFieldName(defOrderAgg.name)} is ${escapeFieldName(
          defOrderAgg.dimName
        )}.min()`
      );
    }

    // Recurse for remaining groupings
    if (remaining.length > 0) {
      result.push(...buildLevel(remaining, level + 1));
    }

    // Apply limit if present and not skipping
    if (!skipLimits && currentGroup.limit) {
      const orderDir = currentGroup.limit.direction === "desc" ? "desc" : "asc";
      // Use definition-order aggregate if available and no explicit orderBy
      const orderField =
        defOrderAgg && !currentGroup.limit.orderBy
          ? escapeFieldName(defOrderAgg.name)
          : buildOrderByField(currentGroup.limit, currentGroup.dimension);
      result.push(`${indent}  order_by: ${orderField} ${orderDir}`);
      result.push(`${indent}  limit: ${currentGroup.limit.count}`);
    } else if (currentGroup.order?.direction) {
      // Explicit order without limit - use definition order if available
      const orderField =
        defOrderAgg && !currentGroup.order.orderBy
          ? escapeFieldName(defOrderAgg.name)
          : buildOrderByFieldFromOrder(
              currentGroup.order,
              currentGroup.dimension
            );
      result.push(
        `${indent}  order_by: ${orderField} ${currentGroup.order.direction}`
      );
    } else if (defOrderAgg) {
      // Use the already-added ordering aggregate
      result.push(
        `${indent}  order_by: ${escapeFieldName(defOrderAgg.name)} asc`
      );
    }

    result.push(`${indent}}`);
    return result;
  }

  return buildLevel(colGroupings, 0);
}

/**
 * Build a standard (non-restructured) query.
 *
 * For merged queries with additionalColVariants, this generates multiple nests
 * and/or outer aggregates in a single query:
 *
 * COLS gender | sector_label  →  two nests: by_gender, by_sector_label
 * COLS education | ALL        →  one nest (by_education) + outer aggregate
 */
function buildStandardQuery(
  query: TaggedQuerySpec,
  sourceName: string,
  where?: string
): string {
  const lines: string[] = [];

  // Start with run statement
  lines.push(`run: ${sourceName} -> {`);

  // Add WHERE clause if present (distributed to ALL queries)
  if (where) {
    lines.push(`  where: ${where}`);
  }

  // Build group_by clause from row groupings (non-total dimensions)
  const groupByDims: string[] = [];

  for (const g of query.rowGroupings) {
    const escaped = escapeFieldName(g.dimension);
    // Handle labels
    if (g.label && g.label !== g.dimension) {
      groupByDims.push(`\`${g.label}\` is ${escaped}`);
    } else {
      groupByDims.push(escaped);
    }
  }

  if (groupByDims.length > 0) {
    lines.push(`  group_by: ${groupByDims.join(", ")}`);
  }

  // Check if we need outer aggregate for ordering (row-level limits/orders when columns exist)
  const firstRowDimWithLimit = query.rowGroupings.find((g) => g.limit);
  const firstRowDimWithOrder = query.rowGroupings.find((g) => g.order?.orderBy);

  // Collect all column variants for merged query handling
  const allColVariants = collectAllColVariants(query);

  // Determine if any variant has column groupings (nesting)
  const hasAnyColGroupings = allColVariants.some(
    (v) => v.colGroupings.length > 0
  );
  const needsOuterAggregate =
    (firstRowDimWithLimit || firstRowDimWithOrder) && hasAnyColGroupings;

  // Check if we need outer aggregate for a total variant (col groupings = 0, isTotal = true)
  const hasTotalVariant = allColVariants.some(
    (v) => v.colGroupings.length === 0 && v.isTotal
  );

  // Ensure orderBy aggregate is included if needed
  let aggregatesToUse = query.aggregates;
  if (firstRowDimWithLimit?.limit?.orderBy) {
    aggregatesToUse = ensureOrderByAggregateInList(
      firstRowDimWithLimit.limit.orderBy,
      aggregatesToUse
    );
  } else if (firstRowDimWithOrder?.order?.orderBy) {
    aggregatesToUse = ensureOrderByAggregateInList(
      firstRowDimWithOrder.order.orderBy,
      aggregatesToUse
    );
  }

  // Check if first row dimension needs definition order (for ordering aggregate)
  // We want definition order unless there's an explicit orderBy on the limit/order
  let rowOrderingAgg: { name: string; dimName: string } | null = null;
  const firstRowDim = query.rowGroupings[0]?.dimension;
  const hasExplicitRowOrder =
    firstRowDimWithLimit?.limit?.orderBy ||
    firstRowDimWithOrder?.order?.orderBy;
  if (
    firstRowDim &&
    !hasExplicitRowOrder &&
    currentOrderingProvider?.hasDefinitionOrder(firstRowDim)
  ) {
    const orderDimName =
      currentOrderingProvider.getOrderDimensionName(firstRowDim);
    if (orderDimName) {
      rowOrderingAgg = { name: `${orderDimName}_min`, dimName: orderDimName };
    }
  }

  // Build aggregate clause at outer level if:
  // 1. No column groupings at all (row-only query)
  // 2. Need outer aggregate for ordering
  // 3. Have a total variant (ALL in COLS)
  // 4. Need ordering aggregate for definition order
  if (
    !hasAnyColGroupings ||
    needsOuterAggregate ||
    hasTotalVariant ||
    rowOrderingAgg
  ) {
    const aggLines = buildAggregateLines(
      aggregatesToUse,
      "  ",
      query.rowGroupings,
      query.colGroupings
    );
    lines.push(...aggLines);
    // Add ordering aggregate if needed
    if (rowOrderingAgg) {
      lines.push(
        `    ${escapeFieldName(rowOrderingAgg.name)} is ${escapeFieldName(
          rowOrderingAgg.dimName
        )}.min()`
      );
    }
  }

  // Build nest clauses for all column variants that have groupings
  // Track first dimensions we've seen to detect when we need unique suffixes
  const seenFirstDims = new Map<string, number>();
  for (const variant of allColVariants) {
    if (variant.colGroupings.length > 0) {
      const firstDim = variant.colGroupings[0].dimension;
      const count = seenFirstDims.get(firstDim) || 0;
      seenFirstDims.set(firstDim, count + 1);

      // Add suffix if this first dimension was already used (to avoid "Cannot redefine" error)
      const suffix = count > 0 ? `_${count}` : "";
      const nestLines = buildNestClause(
        variant.colGroupings,
        query.aggregates,
        false,
        query.rowGroupings,
        suffix
      );
      lines.push(...nestLines);
    }
  }

  // Add limit/order for row dimensions
  if (firstRowDimWithLimit) {
    const g = firstRowDimWithLimit;
    const orderDir = g.limit!.direction === "desc" ? "desc" : "asc";
    // Use definition-order aggregate if available and no explicit orderBy
    const orderField =
      rowOrderingAgg && !g.limit!.orderBy
        ? escapeFieldName(rowOrderingAgg.name)
        : buildOrderByField(g.limit!, g.dimension);
    lines.push(`  order_by: ${orderField} ${orderDir}`);
    lines.push(`  limit: ${g.limit!.count}`);
  } else if (groupByDims.length > 0) {
    // Check if any row dimension has explicit order without limit
    const firstDimWithOrder = query.rowGroupings.find(
      (g) => g.order?.direction
    );
    if (firstDimWithOrder && firstDimWithOrder.order) {
      const orderField = buildOrderByFieldFromOrder(
        firstDimWithOrder.order,
        firstDimWithOrder.dimension
      );
      lines.push(
        `  order_by: ${orderField} ${firstDimWithOrder.order.direction}`
      );
    } else if (rowOrderingAgg) {
      // Use the ordering aggregate that was already added above
      lines.push(`  order_by: ${escapeFieldName(rowOrderingAgg.name)} asc`);
    }
    // No explicit limit - add a high default limit to avoid Malloy's default 10-row limit.
    // This ensures all row dimension combinations are returned.
    // We use a very high limit rather than no limit to be explicit.
    lines.push(`  limit: 100000`);
  }

  lines.push("}");

  return lines.join("\n");
}

/**
 * Collect all column variants for a query (primary + additional).
 *
 * Returns a normalized array of column variants for consistent handling
 * of both simple and merged queries.
 */
function collectAllColVariants(query: TaggedQuerySpec): ColVariant[] {
  // Start with the primary column variant
  const primary: ColVariant = {
    colGroupings: query.colGroupings,
    isTotal: query.hasColTotal,
    totalLabel: query.colTotalLabel,
    colPath: query.colPath,
  };

  const variants = [primary];

  // Add additional variants if this is a merged query
  if (query.additionalColVariants) {
    variants.push(...query.additionalColVariants);
  }

  return variants;
}

/**
 * Build a flat query with all dimensions in a single group_by.
 *
 * This is used when percentage aggregates need cross-scope access to dimensions.
 * Flat queries allow all dimensions to be referenced in all() expressions.
 *
 * The grid spec builder can still render this as a proper crosstab by knowing
 * which dimensions are rows vs columns from the query metadata.
 */
function buildFlatQuery(
  query: TaggedQuerySpec,
  sourceName: string,
  where?: string
): string {
  const lines: string[] = [];

  lines.push(`run: ${sourceName} -> {`);

  // For flat queries, we need to add column dimension null filters to the WHERE clause.
  // Unlike nested queries where column filters go into each nest, flat queries put all
  // dimensions in a single group_by, so we need all null filters at the top level.
  let fullWhere = where;
  if (!currentIncludeNulls && query.colGroupings.length > 0) {
    const colNullFilters = query.colGroupings
      .map((g) => `${escapeFieldName(g.dimension)} is not null`)
      .join(" and ");
    fullWhere = fullWhere
      ? `${fullWhere} and ${colNullFilters}`
      : colNullFilters;
  }

  if (fullWhere) {
    lines.push(`  where: ${fullWhere}`);
  }

  // Put ALL dimensions in a single group_by
  const allDims: string[] = [];

  for (const g of query.rowGroupings) {
    const escaped = escapeFieldName(g.dimension);
    if (g.label && g.label !== g.dimension) {
      allDims.push(`\`${g.label}\` is ${escaped}`);
    } else {
      allDims.push(escaped);
    }
  }

  for (const g of query.colGroupings) {
    const escaped = escapeFieldName(g.dimension);
    if (g.label && g.label !== g.dimension) {
      allDims.push(`\`${g.label}\` is ${escaped}`);
    } else {
      allDims.push(escaped);
    }
  }

  if (allDims.length > 0) {
    lines.push(`  group_by: ${allDims.join(", ")}`);
  }

  // Apply first limit from either axis (simplified - full limit handling would be more complex)
  const firstRowLimit = query.rowGroupings.find((g) => g.limit);
  const firstColLimit = query.colGroupings.find((g) => g.limit);
  const primaryLimit = firstRowLimit ?? firstColLimit;

  // Check if we need a definition-order aggregate (before building aggregates)
  // We want definition order unless there's an explicit orderBy on the limit
  let defOrderAgg: { name: string; dimName: string } | null = null;
  const hasExplicitOrder = primaryLimit?.limit?.orderBy;
  const firstDim =
    query.rowGroupings[0]?.dimension ?? query.colGroupings[0]?.dimension;
  if (
    !hasExplicitOrder &&
    firstDim &&
    currentOrderingProvider?.hasDefinitionOrder(firstDim)
  ) {
    const orderDimName =
      currentOrderingProvider.getOrderDimensionName(firstDim);
    if (orderDimName) {
      defOrderAgg = { name: `${orderDimName}_min`, dimName: orderDimName };
    }
  }

  // Build aggregates with all dimensions in scope
  // Ensure the orderBy aggregate is included (it might not be displayed but is needed for ordering)
  let aggregatesToUse = query.aggregates;
  if (primaryLimit?.limit?.orderBy) {
    aggregatesToUse = ensureOrderByAggregateInList(
      primaryLimit.limit.orderBy,
      aggregatesToUse
    );
  }
  const aggLines = buildAggregateLines(
    aggregatesToUse,
    "  ",
    query.rowGroupings,
    query.colGroupings
  );
  lines.push(...aggLines);

  // Add ordering aggregate inside the same aggregate block
  if (defOrderAgg) {
    lines.push(
      `    ${escapeFieldName(defOrderAgg.name)} is ${escapeFieldName(
        defOrderAgg.dimName
      )}.min()`
    );
  }

  if (primaryLimit?.limit) {
    const orderDir = primaryLimit.limit.direction === "desc" ? "desc" : "asc";
    // Use definition-order aggregate if available and no explicit orderBy
    const orderField =
      defOrderAgg && !primaryLimit.limit.orderBy
        ? escapeFieldName(defOrderAgg.name)
        : buildOrderByField(primaryLimit.limit, primaryLimit.dimension);
    lines.push(`  order_by: ${orderField} ${orderDir}`);
    lines.push(`  limit: ${primaryLimit.limit.count * 100}`); // Higher limit for flat queries
  } else {
    // Use the already-added ordering aggregate if present
    if (defOrderAgg) {
      lines.push(`  order_by: ${escapeFieldName(defOrderAgg.name)} asc`);
    }
    lines.push(`  limit: 100000`);
  }

  lines.push("}");

  return lines.join("\n");
}

/**
 * Build a map from dimension name to output name (label if aliased, else dimension name).
 * This is needed for all() expressions which must reference the output column names.
 */
function buildDimToOutputNameMap(
  rowGroupings: GroupingInfo[] = [],
  colGroupings: GroupingInfo[] = []
): Map<string, string> {
  const map = new Map<string, string>();
  for (const g of rowGroupings) {
    // If there's a label and it's different from dimension, use the label as output name
    map.set(
      g.dimension,
      g.label && g.label !== g.dimension ? g.label : g.dimension
    );
  }
  for (const g of colGroupings) {
    map.set(
      g.dimension,
      g.label && g.label !== g.dimension ? g.label : g.dimension
    );
  }
  return map;
}

/**
 * Build aggregate lines for Malloy.
 *
 * @param aggregates The aggregates to build
 * @param indent The indentation prefix
 * @param rowGroupings Row groupings (for percentage ACROSS COLS and label mapping)
 * @param colGroupings Column groupings (for percentage ACROSS ROWS and label mapping)
 */
function buildAggregateLines(
  aggregates: AggregateInfo[],
  indent: string,
  rowGroupings: GroupingInfo[] = [],
  colGroupings: GroupingInfo[] = []
): string[] {
  if (aggregates.length === 0) return [];

  const rowDimensions = rowGroupings.map((g) => g.dimension);
  const colDimensions = colGroupings.map((g) => g.dimension);
  const dimToOutputName = buildDimToOutputNameMap(rowGroupings, colGroupings);

  const lines: string[] = [];
  lines.push(`${indent}aggregate:`);

  for (const agg of aggregates) {
    let expr: string;
    if (agg.isPercentage && agg.denominatorScope) {
      // Build percentage expression with all() for denominator
      expr = buildPercentageAggExpression(
        agg.measure,
        agg.aggregation,
        agg.denominatorScope,
        rowDimensions,
        colDimensions,
        dimToOutputName
      );
    } else {
      expr = buildAggExpression(agg.measure, agg.aggregation);
    }
    const escapedName = escapeFieldName(agg.name);
    lines.push(`${indent}  ${escapedName} is ${expr}`);
  }

  return lines;
}

/**
 * Build the nest clause for column pivots.
 *
 * @param colGroupings Column groupings to nest
 * @param aggregates Aggregates to compute
 * @param skipLimits If true, don't apply limits (used for total queries)
 * @param rowGroupings Row groupings (for percentage calculations and label mapping)
 * @param nestNameSuffix Suffix to add to nest names (for uniqueness when multiple variants share first dim)
 */
function buildNestClause(
  colGroupings: GroupingInfo[],
  aggregates: AggregateInfo[],
  skipLimits: boolean = false,
  rowGroupings: GroupingInfo[] = [],
  nestNameSuffix: string = ""
): string[] {
  if (colGroupings.length === 0) return [];

  const indent = "  ";
  const rowDimensions = rowGroupings.map((g) => g.dimension);
  const colDimensions = colGroupings.map((g) => g.dimension);
  const dimToOutputName = buildDimToOutputNameMap(rowGroupings, colGroupings);

  // Build NULL filter WHERE clause for column dimensions if needed.
  // This is where we fix the concatenation bug: each nest gets its OWN
  // NULL filters for its specific column dimensions, rather than all
  // column dimensions being filtered at the global level.
  let colNullFilterWhere: string | null = null;
  if (!currentIncludeNulls && colDimensions.length > 0) {
    const nullFilters = colDimensions
      .map((dim) => `${escapeFieldName(dim)} is not null`)
      .join(" and ");
    colNullFilterWhere = nullFilters;
  }

  // Helper to build aggregate expression (handles percentages)
  function buildAggExpr(agg: AggregateInfo): string {
    if (agg.isPercentage && agg.denominatorScope) {
      return buildPercentageAggExpression(
        agg.measure,
        agg.aggregation,
        agg.denominatorScope,
        rowDimensions,
        colDimensions,
        dimToOutputName
      );
    }
    return buildAggExpression(agg.measure, agg.aggregation);
  }

  // Helper to extract aggregate from orderBy expression and add it to aggregates if not already present
  function ensureOrderByAggregate(
    orderByExpr: OrderByExpression | string | undefined,
    aggregatesToUse: AggregateInfo[]
  ): AggregateInfo[] {
    if (!orderByExpr || typeof orderByExpr === "string") {
      return aggregatesToUse;
    }

    const extractAggInfo = (
      expr: AggregateExpr
    ): { measure: string; aggregation: AggregationMethod } | null => {
      if (expr.type === "aggregateExpr") {
        return { measure: expr.field, aggregation: expr.function };
      }
      return null;
    };

    let aggInfo: { measure: string; aggregation: AggregationMethod } | null =
      null;

    if (orderByExpr.type === "aggregateExpr") {
      aggInfo = extractAggInfo(orderByExpr);
    } else if (orderByExpr.type === "ratioExpr") {
      // For ratio, use the numerator aggregate
      aggInfo = extractAggInfo(orderByExpr.numerator);
    }

    if (!aggInfo) {
      return aggregatesToUse;
    }

    // Check if this aggregate is already in the list
    const aggName = `${aggInfo.measure}_${aggInfo.aggregation}`;
    const exists = aggregatesToUse.some((a) => a.name === aggName);

    if (exists) {
      return aggregatesToUse;
    }

    // Add the aggregate
    const newAgg: AggregateInfo = {
      name: aggName,
      measure: aggInfo.measure,
      aggregation: aggInfo.aggregation,
      label: undefined,
      isPercentage: false,
    };

    return [...aggregatesToUse, newAgg];
  }

  // Recursively build nested structure
  // Aggregates are ALWAYS needed at the leaf level for cell values.
  // They're also needed at levels with limits for order_by to work.
  function buildLevel(groupings: GroupingInfo[], depth: number): string[] {
    if (groupings.length === 0) {
      // Leaf level - always add aggregates here for cell values
      const result: string[] = [];
      result.push(`${indent.repeat(depth)}aggregate:`);
      for (const agg of aggregates) {
        const expr = buildAggExpr(agg);
        const escapedName = escapeFieldName(agg.name);
        result.push(`${indent.repeat(depth + 1)}${escapedName} is ${expr}`);
      }
      return result;
    }

    const g = groupings[0];
    const escaped = escapeFieldName(g.dimension);
    // Add suffix only to the outermost nest (depth === 1) to avoid duplicate top-level names
    const nestName =
      depth === 1 ? `by_${g.dimension}${nestNameSuffix}` : `by_${g.dimension}`;
    const remaining = groupings.slice(1);
    const isLeaf = remaining.length === 0;

    // Check if we should apply limit at this level
    const applyLimit = g.limit && !skipLimits;

    // Check if order needs aggregates (orderBy is an expression, not just a field name)
    const orderNeedsAggregate =
      g.order?.orderBy && typeof g.order.orderBy !== "string";

    // Check if we need a definition-order aggregate
    // We want definition order unless there's an explicit orderBy on the limit or explicit order direction
    let defOrderAgg: { name: string; dimName: string } | null = null;
    const hasExplicitOrder = g.limit?.orderBy || g.order?.direction;
    if (
      !hasExplicitOrder &&
      currentOrderingProvider?.hasDefinitionOrder(g.dimension)
    ) {
      const orderDimName = currentOrderingProvider.getOrderDimensionName(
        g.dimension
      );
      if (orderDimName) {
        defOrderAgg = { name: `${orderDimName}_min`, dimName: orderDimName };
      }
    }

    // Ensure orderBy aggregate is in the list (for both limit and order)
    let aggregatesToUse = aggregates;
    if (g.limit?.orderBy) {
      aggregatesToUse = ensureOrderByAggregate(
        g.limit.orderBy,
        aggregatesToUse
      );
    } else if (g.order?.orderBy) {
      aggregatesToUse = ensureOrderByAggregate(
        g.order.orderBy,
        aggregatesToUse
      );
    }

    const result: string[] = [];
    result.push(`${indent.repeat(depth)}nest: ${nestName} is {`);

    // Add WHERE clause for column NULL filters at the first nest level only.
    // This ensures each column section filters only on ITS dimensions.
    if (depth === 1 && colNullFilterWhere) {
      result.push(`${indent.repeat(depth + 1)}where: ${colNullFilterWhere}`);
    }

    // Group by with label if present
    if (g.label && g.label !== g.dimension) {
      result.push(
        `${indent.repeat(depth + 1)}group_by: \`${g.label}\` is ${escaped}`
      );
    } else {
      result.push(`${indent.repeat(depth + 1)}group_by: ${escaped}`);
    }

    // Add aggregates if:
    // 1. There's a limit at this level (needed for order_by), OR
    // 2. There's an order with aggregate expression (needed for order_by), OR
    // 3. This is the leaf level (needed for cell values), OR
    // 4. We need a definition-order aggregate
    if (applyLimit || orderNeedsAggregate || isLeaf || defOrderAgg) {
      result.push(`${indent.repeat(depth + 1)}aggregate:`);
      for (const agg of aggregatesToUse) {
        const expr = buildAggExpr(agg);
        const escapedName = escapeFieldName(agg.name);
        result.push(`${indent.repeat(depth + 2)}${escapedName} is ${expr}`);
      }
      // Add definition-order aggregate inside the same aggregate block
      if (defOrderAgg) {
        result.push(
          `${indent.repeat(depth + 2)}${escapeFieldName(
            defOrderAgg.name
          )} is ${escapeFieldName(defOrderAgg.dimName)}.min()`
        );
      }
    }

    // If there's a limit and we're not skipping limits, add order_by and limit
    if (applyLimit) {
      const orderDir = g.limit!.direction === "desc" ? "desc" : "asc";
      // Use definition-order aggregate if available and no explicit orderBy
      const orderField =
        defOrderAgg && !g.limit!.orderBy
          ? escapeFieldName(defOrderAgg.name)
          : buildOrderByField(g.limit!, g.dimension);
      result.push(
        `${indent.repeat(depth + 1)}order_by: ${orderField} ${orderDir}`
      );
      result.push(`${indent.repeat(depth + 1)}limit: ${g.limit!.count}`);
    } else if (g.order?.direction) {
      // Explicit order without limit - add order_by only
      const orderField = buildOrderByFieldFromOrder(g.order, g.dimension);
      result.push(
        `${indent.repeat(depth + 1)}order_by: ${orderField} ${
          g.order.direction
        }`
      );
    } else if (defOrderAgg) {
      // Use the definition-order aggregate that was already added
      result.push(
        `${indent.repeat(depth + 1)}order_by: ${escapeFieldName(
          defOrderAgg.name
        )} asc`
      );
    }

    // Recurse for next level (skip if leaf - we already added aggregates)
    if (!isLeaf) {
      const innerLines = buildLevel(remaining, depth + 1);
      result.push(...innerLines);
    }

    result.push(`${indent.repeat(depth)}}`);

    return result;
  }

  return buildLevel(colGroupings, 1);
}
