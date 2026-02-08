/**
 * Grid Spec Builder
 *
 * Transforms TableSpec + query results into a GridSpec for rendering.
 *
 * Key responsibilities:
 * 1. Build row header hierarchy from axis tree + actual dimension values
 * 2. Build column header hierarchy from axis tree + actual dimension values
 * 3. Create cell lookup function mapping (rowPath, colPath) → cell value
 * 4. Handle totals, nested data, and cross-dimensional aggregation (ACROSS)
 */

import {
  TableSpec,
  AxisNode,
  DimensionNode,
  AggregateNode,
  PercentageAggregateNode,
  TotalNode,
  SiblingGroup,
  TreePath,
  TreePathSegment,
  TaggedQuerySpec,
  QueryPlan,
  GridSpec,
  HeaderNode,
  CellValue,
  AggregateInfo,
  GroupingInfo,
  ColVariant,
  DimensionValues,
  serializeTreePath,
  collectBranches,
} from "./table-spec.js";
import { MalloyQuerySpec } from "./query-plan-generator.js";
import type { DimensionOrderingProvider } from "./dimension-utils.js";

// Module-level reference to ordering provider for definition-order sorting
let currentOrderingProvider: DimensionOrderingProvider | undefined;

// ---
// MAIN BUILDER FUNCTION
// ---

/**
 * Query results indexed by query ID.
 */
export type QueryResults = Map<string, any[]>;

/**
 * Options for buildGridSpec
 */
export interface BuildGridSpecOptions {
  malloyQueries?: MalloyQuerySpec[];
  /** Ordering provider for definition-order sorting */
  orderingProvider?: DimensionOrderingProvider;
}

/**
 * Build a GridSpec from a TableSpec and query results.
 *
 * @param spec The table specification
 * @param plan The query plan
 * @param results Query results indexed by query ID
 * @param malloyQueriesOrOptions Optional Malloy query specs or options object
 */
export function buildGridSpec(
  spec: TableSpec,
  plan: QueryPlan,
  results: QueryResults,
  malloyQueriesOrOptions?: MalloyQuerySpec[] | BuildGridSpecOptions
): GridSpec {
  // Handle both old signature (array) and new signature (options object)
  let malloyQueries: MalloyQuerySpec[] | undefined;
  let orderingProvider: DimensionOrderingProvider | undefined;

  if (Array.isArray(malloyQueriesOrOptions)) {
    malloyQueries = malloyQueriesOrOptions;
  } else if (malloyQueriesOrOptions) {
    malloyQueries = malloyQueriesOrOptions.malloyQueries;
    orderingProvider = malloyQueriesOrOptions.orderingProvider;
  }

  // Set module-level ordering provider for definition-order sorting
  currentOrderingProvider = orderingProvider;

  try {
    // Build maps of query ID to special handling flags
    const invertedQueries = new Set<string>();
    const flatQueries = new Set<string>();
    if (malloyQueries) {
      for (const mq of malloyQueries) {
        if (mq.axesInverted) {
          invertedQueries.add(mq.id);
        }
        if (mq.isFlatQuery) {
          flatQueries.add(mq.id);
        }
      }
    }

    // Build header structures from axis trees
    let rowHeaders = buildHeaderHierarchy(spec.rowAxis, plan, results, "row");
    const colHeaders = buildHeaderHierarchy(spec.colAxis, plan, results, "col");

    // Handle aggregate-only row axis: when rowHeaders is empty but we have aggregates,
    // create a synthetic row header to represent the single aggregate row.
    // This ensures the table body has at least one row to display data.
    if (rowHeaders.length === 0 && spec.aggregates.length > 0) {
      // Check if the row axis contains only aggregates (no dimensions)
      const rowDimensions = collectDimensionsFromAxis(spec.rowAxis);
      if (rowDimensions.length === 0) {
        // Create synthetic row headers for each aggregate
        // If there's only one aggregate, create a single row with the aggregate label
        // If multiple aggregates, each gets its own row
        if (spec.aggregates.length === 1) {
          const agg = spec.aggregates[0];
          rowHeaders = [
            {
              type: "dimension" as const,
              dimension: "_aggregate",
              value:
                agg.label ?? formatAggregateName(agg.measure, agg.aggregation),
              label: agg.label,
              span: 1,
              depth: 0,
              path: [{ type: "aggregate" as const, name: agg.name }],
            },
          ];
        } else {
          // Multiple aggregates - each gets its own row
          rowHeaders = spec.aggregates.map((agg, idx) => ({
            type: "dimension" as const,
            dimension: "_aggregate",
            value:
              agg.label ?? formatAggregateName(agg.measure, agg.aggregation),
            label: agg.label,
            span: 1,
            depth: 0,
            path: [
              { type: "sibling" as const, index: idx },
              { type: "aggregate" as const, name: agg.name },
            ],
          }));
        }
      }
    }

    // Build cell lookup (value-based)
    const cellLookup = buildCellLookup(
      spec,
      plan,
      results,
      invertedQueries,
      flatQueries
    );

    // Check for totals
    const hasRowTotal = axisHasTotal(spec.rowAxis);
    const hasColTotal = axisHasTotal(spec.colAxis);

    // Determine if corner-style row headers should be used
    // Only valid when rowHeaders:above is set AND row axis doesn't have siblings at root
    const useCornerRowHeaders = shouldUseCornerRowHeaders(spec);
    const cornerRowLabels = useCornerRowHeaders
      ? extractRowDimensionLabels(spec.rowAxis)
      : undefined;

    // For left mode (when siblings exist), extract labels to show in corner
    // Only show labels for dimensions that have custom labels
    const leftModeRowLabels =
      !useCornerRowHeaders && rowHeaders.length > 0
        ? extractLeftModeRowLabels(rowHeaders)
        : undefined;

    return {
      rowHeaders,
      colHeaders,
      getCell: (rowValues, colValues, aggregate) =>
        cellLookup.get(rowValues, colValues, aggregate),
      aggregates: spec.aggregates,
      hasRowTotal,
      hasColTotal,
      options: spec.options,
      useCornerRowHeaders,
      cornerRowLabels,
      leftModeRowLabels,
    };
  } finally {
    // Clear the registry after building
    currentOrderingProvider = undefined;
  }
}

// ---
// HEADER HIERARCHY BUILDER
// ---

/**
 * Build header hierarchy from an axis tree and query results.
 *
 * This walks the axis tree structure and populates it with actual
 * values from the query results.
 */
function buildHeaderHierarchy(
  tree: AxisNode | null,
  plan: QueryPlan,
  results: QueryResults,
  axis: "row" | "col"
): HeaderNode[] {
  if (!tree) return [];

  // Collect all branches to understand the structure
  const branches = collectBranches(tree);

  // For each branch, find the corresponding query and extract values
  const headers: HeaderNode[] = [];

  return buildHeaderNodes(tree, plan, results, axis, [], 0);
}

/**
 * Recursively build header nodes from an axis tree.
 *
 * Key insight: Aggregates are NOT header levels - they define what value
 * goes in cells. The header tree ends at the last dimension.
 * Aggregate children mean "this dimension cell has these values".
 *
 * @param parentValues Context: dimension values of parent headers (e.g., state=CA)
 *   Used to filter child dimension values to only those that exist under this parent.
 */
function buildHeaderNodes(
  node: AxisNode | null,
  plan: QueryPlan,
  results: QueryResults,
  axis: "row" | "col",
  currentPath: TreePath,
  depth: number,
  parentValues: Map<string, string | number> = new Map()
): HeaderNode[] {
  if (!node) return [];

  switch (node.nodeType) {
    case "dimension":
      return buildDimensionHeaders(
        node,
        plan,
        results,
        axis,
        currentPath,
        depth,
        parentValues
      );

    case "total":
      return buildTotalHeaders(
        node,
        plan,
        results,
        axis,
        currentPath,
        depth,
        parentValues
      );

    case "siblings":
      return buildSiblingHeaders(
        node,
        plan,
        results,
        axis,
        currentPath,
        depth,
        parentValues
      );

    case "aggregate":
      // Single aggregates (even with labels) should NOT create header entries.
      // Header entries for aggregates are only appropriate when there are
      // multiple sibling aggregates (e.g., income.sum "Sum" | income.mean "Average").
      // The buildSiblingHeaders function handles that case.
      //
      // For a single aggregate like `gender * income.sum "Total Income"`,
      // the label should be used for column headers, not create row entries.
      return [];

    case "percentageAggregate":
      // Single percentage aggregates (even with labels) should NOT create header entries.
      // Header entries are only appropriate when there are multiple sibling aggregates.
      // The buildSiblingHeaders function handles that case.
      return [];
  }
}

/**
 * Build headers for a dimension node.
 *
 * When a dimension has a custom label (non-empty) and is not already within a sibling group,
 * we create a sibling-label wrapper to display the label above the dimension values.
 *
 * @param parentValues Context from parent dimensions for filtering child values
 */
function buildDimensionHeaders(
  node: DimensionNode,
  plan: QueryPlan,
  results: QueryResults,
  axis: "row" | "col",
  currentPath: TreePath,
  depth: number,
  parentValues: Map<string, string | number> = new Map()
): HeaderNode[] {
  // Check if this dimension has a custom non-empty label and we're not already in a sibling context
  // If so, we should create a sibling-label wrapper to display the label above dimension values
  const hasCustomLabel = node.label !== undefined && node.label !== "";
  const alreadyInSiblingContext = currentPath.some(
    (seg) => seg.type === "sibling"
  );

  if (hasCustomLabel && !alreadyInSiblingContext) {
    // Create a sibling-label wrapper for this dimension's label
    // Build value headers as children at depth+1
    const valueHeaders = buildDimensionValueHeaders(
      node,
      plan,
      results,
      axis,
      currentPath,
      depth + 1,
      parentValues
    );

    const span = valueHeaders.reduce((sum, c) => sum + c.span, 0);

    return [
      {
        type: "sibling-label" as const,
        dimension: node.name,
        value: node.label,
        label: node.label,
        span: span || 1,
        depth,
        children: valueHeaders.length > 0 ? valueHeaders : undefined,
        path: currentPath,
      },
    ];
  }

  // No custom label or already in sibling context - build value headers directly
  return buildDimensionValueHeaders(
    node,
    plan,
    results,
    axis,
    currentPath,
    depth,
    parentValues
  );
}

/**
 * Build value headers for a dimension node (the actual dimension values like "CA", "TX", etc.)
 */
function buildDimensionValueHeaders(
  node: DimensionNode,
  plan: QueryPlan,
  results: QueryResults,
  axis: "row" | "col",
  currentPath: TreePath,
  depth: number,
  parentValues: Map<string, string | number> = new Map()
): HeaderNode[] {
  // Find query results that contain this dimension
  // Pass parentValues to filter values to only those that exist under parent context
  const dimValues = extractDimensionValues(
    node.name,
    plan,
    results,
    axis,
    currentPath,
    parentValues
  );

  const headers: HeaderNode[] = [];

  for (const value of dimValues) {
    const valuePath: TreePath = [
      ...currentPath,
      { type: "dimension", name: node.name },
    ];

    // Create updated parent values including this dimension's value
    const childParentValues = new Map(parentValues);
    childParentValues.set(node.name, value);

    // Recursively build child headers with updated parent context
    const children = node.child
      ? buildHeaderNodes(
          node.child,
          plan,
          results,
          axis,
          valuePath,
          depth + 1,
          childParentValues
        )
      : [];

    // Calculate span (how many leaf descendants)
    const span =
      children.length > 0 ? children.reduce((sum, c) => sum + c.span, 0) : 1;

    headers.push({
      type: "dimension",
      dimension: node.name,
      value: String(value),
      label: node.label,
      span,
      depth,
      children: children.length > 0 ? children : undefined,
      path: valuePath,
    });
  }

  return headers;
}

/**
 * Build headers for a total node.
 */
function buildTotalHeaders(
  node: TotalNode,
  plan: QueryPlan,
  results: QueryResults,
  axis: "row" | "col",
  currentPath: TreePath,
  depth: number,
  parentValues: Map<string, string | number> = new Map()
): HeaderNode[] {
  const totalPath: TreePath = [
    ...currentPath,
    { type: "total", label: node.label },
  ];

  // Recursively build child headers if any
  const children = node.child
    ? buildHeaderNodes(
        node.child,
        plan,
        results,
        axis,
        totalPath,
        depth + 1,
        parentValues
      )
    : [];

  const span =
    children.length > 0 ? children.reduce((sum, c) => sum + c.span, 0) : 1;

  return [
    {
      type: "total",
      value: node.label ?? "Total",
      label: node.label,
      span,
      depth,
      children: children.length > 0 ? children : undefined,
      path: totalPath,
    },
  ];
}

/**
 * Build headers for sibling nodes.
 *
 * For multiple dimension siblings (like `gender | state`), we add a sibling-label
 * header to indicate which dimension the values belong to.
 *
 * For single dimension with totals (like `gender | ALL`), we DON'T add sibling-labels
 * since the total is just an extension of the dimension, not a separate section.
 */
function buildSiblingHeaders(
  node: SiblingGroup,
  plan: QueryPlan,
  results: QueryResults,
  axis: "row" | "col",
  currentPath: TreePath,
  depth: number,
  parentValues: Map<string, string | number> = new Map()
): HeaderNode[] {
  const allHeaders: HeaderNode[] = [];

  // Check if all children are aggregates (regular or percentage)
  const allAggregates = node.children.every(
    (child) =>
      child.nodeType === "aggregate" || child.nodeType === "percentageAggregate"
  );

  // Count dimension children - only use sibling-labels when there are 2+ dimensions
  // A single dimension with totals (dim | ALL) doesn't need sibling-labels
  const dimensionChildren = node.children.filter(
    (child) => child.nodeType === "dimension"
  );
  const hasMultipleDimensionSiblings = dimensionChildren.length >= 2;

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const siblingPath: TreePath = [
      ...currentPath,
      { type: "sibling", index: i },
    ];

    // Special handling for aggregate siblings: always create headers
    if (allAggregates && child.nodeType === "aggregate") {
      const aggNode = child as AggregateNode;
      const aggName = `${aggNode.measure}_${aggNode.aggregation}`;
      const displayValue =
        aggNode.label ??
        formatAggregateName(aggNode.measure, aggNode.aggregation);

      allHeaders.push({
        type: "dimension" as const,
        dimension: "_aggregate",
        value: displayValue,
        label: aggNode.label,
        span: 1,
        depth,
        path: [...siblingPath, { type: "aggregate", name: aggName }],
      });
    } else if (allAggregates && child.nodeType === "percentageAggregate") {
      // Handle percentage aggregate siblings
      const pctNode = child as PercentageAggregateNode;
      const aggName = `${pctNode.measure ?? ""}_${pctNode.aggregation}_pct`;
      const displayValue =
        pctNode.label ??
        formatAggregateName(pctNode.measure ?? "count", pctNode.aggregation);

      allHeaders.push({
        type: "dimension" as const,
        dimension: "_aggregate",
        value: displayValue,
        label: pctNode.label,
        span: 1,
        depth,
        path: [...siblingPath, { type: "aggregate", name: aggName }],
      });
    } else if (child.nodeType === "dimension") {
      // Check if we need a sibling-label for this dimension
      const dimNode = child as DimensionNode;
      const hasCustomLabel =
        dimNode.label !== undefined && dimNode.label !== "";

      // Create sibling-label wrapper when:
      // 1. Multiple dimension siblings (always need labels to distinguish them)
      // 2. Single dimension with custom label (need to show the custom label)
      // Skip sibling-label when:
      // - suppressLabel is true (label explicitly set to "")
      // - Single dimension without custom label (just show values directly)
      const needsSiblingLabel =
        (hasMultipleDimensionSiblings || hasCustomLabel) &&
        !dimNode.suppressLabel;

      if (dimNode.suppressLabel || !needsSiblingLabel) {
        // Build dimension value headers directly at current depth (no sibling-label wrapper)
        const valueHeaders = buildDimensionValueHeaders(
          dimNode,
          plan,
          results,
          axis,
          siblingPath,
          depth,
          parentValues
        );
        allHeaders.push(...valueHeaders);
      } else {
        const dimensionLabel = dimNode.label ?? dimNode.name;

        // Build child headers at depth+1 (under the sibling label)
        const childHeaders = buildHeaderNodes(
          child,
          plan,
          results,
          axis,
          siblingPath,
          depth + 1, // Increased depth for children
          parentValues
        );

        // Calculate span from children
        const span =
          childHeaders.length > 0
            ? childHeaders.reduce((sum, c) => sum + c.span, 0)
            : 1;

        // Create the sibling-label header with children
        allHeaders.push({
          type: "sibling-label" as const,
          dimension: dimNode.name,
          value: dimensionLabel,
          label: dimNode.label,
          span,
          depth,
          children: childHeaders.length > 0 ? childHeaders : undefined,
          path: siblingPath,
        });
      }
    } else {
      // Other cases (totals, etc.) - pass through as before
      const childHeaders = buildHeaderNodes(
        child,
        plan,
        results,
        axis,
        siblingPath,
        depth,
        parentValues
      );

      allHeaders.push(...childHeaders);
    }
  }

  return allHeaders;
}

/**
 * Format an aggregate name for display (e.g., "births sum" from "births", "sum")
 */
function formatAggregateName(measure: string, aggregation: string): string {
  // For count/n without a measure, just return the aggregation name
  // This handles cases like standalone "count" or "n"
  if (!measure || measure === "__pending__") {
    return aggregation === "count" ? "N" : aggregation;
  }

  // For count with a measure (e.g., income.count), just return "N" since
  // count doesn't really bind to a measure in Malloy
  if (aggregation === "count") {
    return "N";
  }

  return `${measure} ${aggregation}`;
}

/**
 * Extract unique dimension values from query results.
 * Values are sorted alphabetically by default, unless:
 * - The dimension has a limit (data order preserved from query)
 * - The dimension has an explicit order (data order preserved from query)
 *
 * @param parentValues Optional context: parent dimension values to filter by.
 *   For example, when building name headers under state=CA, only return names
 *   that exist in the data where state=CA.
 */
function extractDimensionValues(
  dimension: string,
  plan: QueryPlan,
  results: QueryResults,
  axis: "row" | "col",
  currentPath: TreePath,
  parentValues: Map<string, string | number> = new Map()
): (string | number)[] {
  // Use an array to preserve order (for cases with explicit order/limit)
  // and a Set to track uniqueness
  const valuesArray: (string | number)[] = [];
  const seenValues = new Set<string | number>();

  // Check if this dimension has an explicit order or limit
  // If so, we should preserve the data order from the query
  let hasExplicitOrder = false;
  let hasLimit = false;

  for (const query of plan.queries) {
    // Collect all groupings to check (including additionalColVariants for merged queries)
    const groupingsToCheck: GroupingInfo[][] = [];
    if (axis === "row") {
      groupingsToCheck.push(query.rowGroupings);
    } else {
      groupingsToCheck.push(query.colGroupings);
      if (query.additionalColVariants) {
        for (const variant of query.additionalColVariants) {
          groupingsToCheck.push(variant.colGroupings);
        }
      }
    }

    for (const groupings of groupingsToCheck) {
      const grouping = groupings.find((g) => g.dimension === dimension);
      if (grouping) {
        if (grouping.order?.direction) {
          hasExplicitOrder = true;
        }
        if (grouping.limit) {
          hasLimit = true;
        }
      }
    }
  }

  // Also preserve data order for TPL-native dimensions with definition order
  // These dimensions are ordered in the Malloy query via order_by on the _order aggregate
  const hasDefinitionOrder =
    currentOrderingProvider?.hasDefinitionOrder(dimension) ?? false;
  const preserveDataOrder = hasExplicitOrder || hasLimit || hasDefinitionOrder;

  // Look through all queries that have this dimension in the right axis
  for (const query of plan.queries) {
    const queryResults = results.get(query.id);
    if (!queryResults) continue;

    if (axis === "row") {
      // For row dimensions, check rowGroupings
      if (query.rowGroupings.some((g) => g.dimension === dimension)) {
        extractValuesFromDataOrdered(
          queryResults,
          dimension,
          valuesArray,
          seenValues,
          query.rowGroupings,
          0,
          parentValues
        );
      }
    } else {
      // For column dimensions, check primary colGroupings AND additionalColVariants
      // This handles merged queries where some dimensions are in additionalColVariants
      // Each variant may have a nest name suffix, but ONLY when its first dimension
      // collides with a previous variant's first dimension (to avoid "Cannot redefine" error)
      const allColGroupingsWithSuffix: Array<{
        groupings: GroupingInfo[];
        suffix: string;
      }> = [];
      const seenFirstDims = new Map<string, number>();

      // Add primary variant
      if (query.colGroupings.length > 0) {
        const firstDim = query.colGroupings[0].dimension;
        const count = seenFirstDims.get(firstDim) || 0;
        seenFirstDims.set(firstDim, count + 1);
        allColGroupingsWithSuffix.push({
          groupings: query.colGroupings,
          suffix: count > 0 ? `_${count}` : "",
        });
      }

      // Add additional variants
      if (query.additionalColVariants) {
        for (const variant of query.additionalColVariants) {
          if (variant.colGroupings.length > 0) {
            const firstDim = variant.colGroupings[0].dimension;
            const count = seenFirstDims.get(firstDim) || 0;
            seenFirstDims.set(firstDim, count + 1);
            allColGroupingsWithSuffix.push({
              groupings: variant.colGroupings,
              suffix: count > 0 ? `_${count}` : "",
            });
          }
        }
      }

      for (const {
        groupings: colGroupings,
        suffix,
      } of allColGroupingsWithSuffix) {
        if (colGroupings.some((g) => g.dimension === dimension)) {
          // For columns, we need to navigate through row nesting to find pivot structure
          extractColValuesFromDataOrdered(
            queryResults,
            dimension,
            valuesArray,
            seenValues,
            colGroupings,
            query.rowGroupings,
            parentValues,
            suffix
          );
        }
      }
    }
  }

  // If we should preserve data order (explicit order or limit), return as-is
  if (preserveDataOrder) {
    return valuesArray;
  }

  // Otherwise, sort for consistent display order
  // Default is alphabetical/numerical ascending
  valuesArray.sort((a, b) => {
    // Handle mixed string/number sorting
    if (typeof a === "number" && typeof b === "number") {
      return a - b; // Numeric ascending
    }
    return String(a).localeCompare(String(b)); // Alphabetic ascending
  });

  return valuesArray;
}

/**
 * Extract dimension values from query result data (for row dimensions).
 * Handles both flat structure (multiple dims in same group_by) and
 * nested structure (dims in separate nested levels).
 *
 * Also handles inverted queries where row dimensions might be nested
 * inside column structures (e.g., for global column limits).
 *
 * @param parentValues Context: only extract values from rows where parent dimensions match
 */
function extractValuesFromData(
  data: any[],
  dimension: string,
  values: Set<string | number>,
  groupings: GroupingInfo[],
  depth: number = 0,
  parentValues: Map<string, string | number> = new Map()
): void {
  if (!data || data.length === 0) return;

  // Find the grouping for this dimension to get its label (if any)
  const grouping = groupings.find((g) => g.dimension === dimension);
  // In Malloy output, labeled dimensions use the label as the column name
  const dataKey = grouping?.label ?? dimension;

  for (const row of data) {
    // Check if this row matches all parent dimension constraints
    let matchesParent = true;
    for (const [parentDim, parentVal] of parentValues) {
      // Find the grouping for parent dimension to get its label
      const parentGrouping = groupings.find((g) => g.dimension === parentDim);
      const parentDataKey = parentGrouping?.label ?? parentDim;
      const rowVal = row[parentDataKey] ?? row[parentDim];
      // Handle "(null)" matching: if parentVal is "(null)", match against null in data
      const matches =
        rowVal === undefined ||
        rowVal === parentVal ||
        (parentVal === "(null)" && rowVal === null);
      if (!matches) {
        matchesParent = false;
        break;
      }
    }

    if (!matchesParent) continue;

    // First, check if the dimension exists directly on this row (flat structure)
    // This handles cases where multiple dimensions are in the same group_by
    // Check both the label (if present) and the original dimension name
    let value = row[dataKey];
    if (value === undefined) {
      value = row[dimension];
    }
    // Include null values as "(null)" to ensure limit counts match displayed rows
    if (value === null) {
      value = "(null)";
    }
    if (value !== undefined) {
      values.add(value);
    }

    // Check ALL nested structures, not just those in the expected groupings
    // This handles inverted queries where row dims might be inside column nesting
    for (const key of Object.keys(row)) {
      if (key.startsWith("by_") && Array.isArray(row[key])) {
        extractValuesFromData(
          row[key],
          dimension,
          values,
          groupings,
          depth + 1,
          parentValues
        );
      }
    }
  }
}

/**
 * Extract dimension values from column pivot structure.
 * Must navigate through row nesting to find column pivots.
 *
 * Also handles flat queries where column dimensions are at the top level
 * (no nesting) - same as row dimensions.
 *
 * @param parentValues Context: only extract values where parent dimensions match
 */
function extractColValuesFromData(
  data: any[],
  dimension: string,
  values: Set<string | number>,
  colGroupings: GroupingInfo[],
  rowGroupings: GroupingInfo[] = [],
  parentValues: Map<string, string | number> = new Map()
): void {
  if (!data || data.length === 0 || colGroupings.length === 0) return;

  // Find the grouping for this dimension to get its label (if any)
  const grouping = colGroupings.find((g) => g.dimension === dimension);
  const dataKey = grouping?.label ?? dimension;

  // First, check if this is a flat query (column dims at top level)
  // If the first row has the dimension directly, it's a flat query
  if (
    data.length > 0 &&
    (data[0][dataKey] !== undefined || data[0][dimension] !== undefined)
  ) {
    // Flat query - extract values directly from top level
    for (const row of data) {
      let value = row[dataKey];
      if (value === undefined) {
        value = row[dimension];
      }
      // Include null values as "(null)" to ensure limit counts match displayed rows
      if (value === null) {
        value = "(null)";
      }
      if (value !== undefined) {
        values.add(value);
      }
    }
    return;
  }

  // Navigate through row structure to find leaf rows, then extract column values
  for (const row of data) {
    navigateToColPivots(
      row,
      dimension,
      values,
      colGroupings,
      rowGroupings,
      0,
      parentValues
    );
  }
}

/**
 * Navigate through row nesting to reach column pivot data.
 *
 * Handles both cases:
 * 1. Row dims at top level: { state: 'CA', by_gender: [...] }
 * 2. Wrapped in nests: { by_state: [{ state: 'CA', by_gender: [...] }] }
 *
 * @param parentValues Context: parent dimension values to filter by
 */
function navigateToColPivots(
  row: any,
  dimension: string,
  values: Set<string | number>,
  colGroupings: GroupingInfo[],
  rowGroupings: GroupingInfo[],
  rowDepth: number,
  parentValues: Map<string, string | number> = new Map()
): void {
  // First, check if we need to navigate INTO the current row dimension's nest
  // This handles the case where data is wrapped: { by_state: [...] }
  if (rowDepth < rowGroupings.length) {
    const currentRowDim = rowGroupings[rowDepth]?.dimension;
    const currentNestedKey = `by_${currentRowDim}`;

    // Check if this row dimension value exists directly on the row
    const hasValueDirectly = row[currentRowDim] !== undefined;

    // Or if we need to navigate into its nest first
    if (
      !hasValueDirectly &&
      row[currentNestedKey] &&
      Array.isArray(row[currentNestedKey])
    ) {
      // Navigate into the current dimension's nest
      for (const nestedRow of row[currentNestedKey]) {
        navigateToColPivots(
          nestedRow,
          dimension,
          values,
          colGroupings,
          rowGroupings,
          rowDepth,
          parentValues
        );
      }
      return;
    }
  }

  // Check if there's more row nesting to navigate
  if (rowDepth < rowGroupings.length - 1) {
    const nextRowDim = rowGroupings[rowDepth + 1]?.dimension;
    const nestedRowKey = `by_${nextRowDim}`;
    const nestedRows = row[nestedRowKey];

    if (nestedRows && Array.isArray(nestedRows)) {
      for (const nestedRow of nestedRows) {
        navigateToColPivots(
          nestedRow,
          dimension,
          values,
          colGroupings,
          rowGroupings,
          rowDepth + 1,
          parentValues
        );
      }
      return;
    }
  }

  // At leaf of row structure - now extract column values
  extractColValuesFromRow(
    row,
    dimension,
    values,
    colGroupings,
    0,
    parentValues
  );
}

/**
 * Extract column dimension values from a row at leaf level.
 *
 * Handles the case where the first column dimension is at the top level
 * of the row (not nested), which occurs in inverted queries.
 *
 * @param parentValues Context: parent column dimension values to filter by
 */
function extractColValuesFromRow(
  row: any,
  dimension: string,
  values: Set<string | number>,
  colGroupings: GroupingInfo[],
  depth: number,
  parentValues: Map<string, string | number> = new Map()
): void {
  if (depth >= colGroupings.length) return;

  const currentDim = colGroupings[depth];
  const nestedKey = `by_${currentDim.dimension}`;
  const nested = row[nestedKey];

  // Check if the current dimension is at the TOP LEVEL of the row (not nested)
  // This happens when the first column dimension is at the outer level in inverted queries
  const topLevelDataKey = currentDim.label ?? currentDim.dimension;
  const topLevelValue = row[topLevelDataKey] ?? row[currentDim.dimension];

  if (topLevelValue !== undefined) {
    // First column dimension is at top level
    // Include null values as "(null)" to ensure limit counts match displayed rows
    let displayTopValue = topLevelValue;
    if (displayTopValue === null) {
      displayTopValue = "(null)";
    }
    // Check parent constraint
    const parentVal = parentValues.get(currentDim.dimension);
    if (parentVal !== undefined && displayTopValue !== parentVal) {
      return; // Parent constraint not matched
    }

    if (currentDim.dimension === dimension) {
      // This is the dimension we're extracting - add the top level value
      values.add(displayTopValue);
    }

    // Look for the NEXT dimension's nested key
    if (depth + 1 < colGroupings.length) {
      const nextDim = colGroupings[depth + 1];
      const nextNestedKey = `by_${nextDim.dimension}`;
      const nextNested = row[nextNestedKey];

      if (nextNested && Array.isArray(nextNested)) {
        // Recurse into next dimension's nesting, but start at depth+1
        for (const nestedRow of nextNested) {
          extractColValuesFromRow(
            nestedRow,
            dimension,
            values,
            colGroupings,
            depth + 1,
            parentValues
          );
        }
      }
    }
    return;
  }

  // Standard nested case: current dimension is in a by_X array
  if (!nested || !Array.isArray(nested)) return;

  for (const colRow of nested) {
    // Check if parent column dimensions match
    // For state * name, when extracting names for state=CA,
    // we check if this row's state matches CA
    let parentMatch = true;
    const dataKey = currentDim.label ?? currentDim.dimension;
    const colVal = colRow[dataKey] ?? colRow[currentDim.dimension];

    // Check if this row's current dimension matches the parent value constraint
    const parentVal = parentValues.get(currentDim.dimension);
    if (parentVal !== undefined && colVal !== parentVal) {
      parentMatch = false;
    }

    if (!parentMatch) continue;

    if (currentDim.dimension === dimension) {
      // This is the dimension we're extracting values for
      // Include null values as "(null)" to ensure limit counts match displayed rows
      let displayVal = colVal;
      if (displayVal === null) {
        displayVal = "(null)";
      }
      if (displayVal !== undefined) {
        values.add(displayVal);
      }
    }

    // Continue to deeper column levels
    extractColValuesFromRow(
      colRow,
      dimension,
      values,
      colGroupings,
      depth + 1,
      parentValues
    );
  }
}

// ---
// ORDER-PRESERVING VALUE EXTRACTION
// ---

/**
 * Extract dimension values from query result data, preserving order.
 * Same as extractValuesFromData but uses array + Set for order preservation.
 */
function extractValuesFromDataOrdered(
  data: any[],
  dimension: string,
  valuesArray: (string | number)[],
  seenValues: Set<string | number>,
  groupings: GroupingInfo[],
  depth: number = 0,
  parentValues: Map<string, string | number> = new Map()
): void {
  if (!data || data.length === 0) return;

  const grouping = groupings.find((g) => g.dimension === dimension);
  const dataKey = grouping?.label ?? dimension;

  for (const row of data) {
    let matchesParent = true;
    for (const [parentDim, parentVal] of parentValues) {
      const parentGrouping = groupings.find((g) => g.dimension === parentDim);
      const parentDataKey = parentGrouping?.label ?? parentDim;
      const rowVal = row[parentDataKey] ?? row[parentDim];
      // Handle "(null)" matching: if parentVal is "(null)", match against null in data
      const matches =
        rowVal === undefined ||
        rowVal === parentVal ||
        (parentVal === "(null)" && rowVal === null);
      if (!matches) {
        matchesParent = false;
        break;
      }
    }

    if (!matchesParent) continue;

    let value = row[dataKey];
    if (value === undefined) {
      value = row[dimension];
    }
    // Include null values as "(null)" to ensure limit counts match displayed rows
    if (value === null) {
      value = "(null)";
    }
    if (value !== undefined && !seenValues.has(value)) {
      seenValues.add(value);
      valuesArray.push(value);
    }

    for (const key of Object.keys(row)) {
      if (key.startsWith("by_") && Array.isArray(row[key])) {
        extractValuesFromDataOrdered(
          row[key],
          dimension,
          valuesArray,
          seenValues,
          groupings,
          depth + 1,
          parentValues
        );
      }
    }
  }
}

/**
 * Extract dimension values from column pivot structure, preserving order.
 * Same as extractColValuesFromData but uses array + Set for order preservation.
 *
 * @param nestNameSuffix Suffix for nest names (e.g., '_1' for merged query variants)
 */
function extractColValuesFromDataOrdered(
  data: any[],
  dimension: string,
  valuesArray: (string | number)[],
  seenValues: Set<string | number>,
  colGroupings: GroupingInfo[],
  rowGroupings: GroupingInfo[] = [],
  parentValues: Map<string, string | number> = new Map(),
  nestNameSuffix: string = ""
): void {
  if (!data || data.length === 0 || colGroupings.length === 0) return;

  const grouping = colGroupings.find((g) => g.dimension === dimension);
  const dataKey = grouping?.label ?? dimension;

  // First, check if this is a flat query (column dims at top level)
  if (
    data.length > 0 &&
    (data[0][dataKey] !== undefined || data[0][dimension] !== undefined)
  ) {
    for (const row of data) {
      let value = row[dataKey];
      if (value === undefined) {
        value = row[dimension];
      }
      // Include null values as "(null)" to ensure limit counts match displayed rows
      if (value === null) {
        value = "(null)";
      }
      if (value !== undefined && !seenValues.has(value)) {
        seenValues.add(value);
        valuesArray.push(value);
      }
    }
    return;
  }

  // Navigate through row structure to find leaf rows, then extract column values
  for (const row of data) {
    navigateToColPivotsOrdered(
      row,
      dimension,
      valuesArray,
      seenValues,
      colGroupings,
      rowGroupings,
      0,
      parentValues,
      nestNameSuffix
    );
  }
}

/**
 * Navigate through row nesting to reach column pivot data, preserving order.
 *
 * @param nestNameSuffix Suffix for nest names (e.g., '_1' for merged query variants)
 */
function navigateToColPivotsOrdered(
  row: any,
  dimension: string,
  valuesArray: (string | number)[],
  seenValues: Set<string | number>,
  colGroupings: GroupingInfo[],
  rowGroupings: GroupingInfo[],
  rowDepth: number,
  parentValues: Map<string, string | number> = new Map(),
  nestNameSuffix: string = ""
): void {
  if (rowDepth < rowGroupings.length) {
    const currentRowDim = rowGroupings[rowDepth]?.dimension;
    const currentNestedKey = `by_${currentRowDim}`;
    const hasValueDirectly = row[currentRowDim] !== undefined;

    if (
      !hasValueDirectly &&
      row[currentNestedKey] &&
      Array.isArray(row[currentNestedKey])
    ) {
      for (const nestedRow of row[currentNestedKey]) {
        navigateToColPivotsOrdered(
          nestedRow,
          dimension,
          valuesArray,
          seenValues,
          colGroupings,
          rowGroupings,
          rowDepth,
          parentValues,
          nestNameSuffix
        );
      }
      return;
    }
  }

  if (rowDepth < rowGroupings.length - 1) {
    const nextRowDim = rowGroupings[rowDepth + 1]?.dimension;
    const nestedRowKey = `by_${nextRowDim}`;
    const nestedRows = row[nestedRowKey];

    if (nestedRows && Array.isArray(nestedRows)) {
      for (const nestedRow of nestedRows) {
        navigateToColPivotsOrdered(
          nestedRow,
          dimension,
          valuesArray,
          seenValues,
          colGroupings,
          rowGroupings,
          rowDepth + 1,
          parentValues,
          nestNameSuffix
        );
      }
      return;
    }
  }

  extractColValuesFromRowOrdered(
    row,
    dimension,
    valuesArray,
    seenValues,
    colGroupings,
    0,
    parentValues,
    nestNameSuffix
  );
}

/**
 * Extract column dimension values from a row at leaf level, preserving order.
 *
 * Handles the case where the first column dimension is at the top level
 * of the row (not nested), which occurs in inverted queries.
 *
 * @param nestNameSuffix Suffix for nest names (e.g., '_1' for merged query variants).
 *   Only applied to the outermost nest (depth === 0) to match Malloy query structure.
 */
function extractColValuesFromRowOrdered(
  row: any,
  dimension: string,
  valuesArray: (string | number)[],
  seenValues: Set<string | number>,
  colGroupings: GroupingInfo[],
  depth: number,
  parentValues: Map<string, string | number> = new Map(),
  nestNameSuffix: string = ""
): void {
  if (depth >= colGroupings.length) return;

  const currentDim = colGroupings[depth];
  // Suffix only applies to outermost nest (depth === 0) to avoid duplicate top-level names
  const nestedKey =
    depth === 0
      ? `by_${currentDim.dimension}${nestNameSuffix}`
      : `by_${currentDim.dimension}`;
  const nested = row[nestedKey];

  // Check if the current dimension is at the TOP LEVEL of the row (not nested)
  // This happens when the first column dimension is at the outer level in inverted queries
  const topLevelDataKey = currentDim.label ?? currentDim.dimension;
  const topLevelValue = row[topLevelDataKey] ?? row[currentDim.dimension];

  if (topLevelValue !== undefined) {
    // First column dimension is at top level
    // Include null values as "(null)" to ensure limit counts match displayed rows
    let displayTopValue = topLevelValue;
    if (displayTopValue === null) {
      displayTopValue = "(null)";
    }
    // Check parent constraint
    const parentVal = parentValues.get(currentDim.dimension);
    if (parentVal !== undefined && displayTopValue !== parentVal) {
      return; // Parent constraint not matched
    }

    if (currentDim.dimension === dimension) {
      // This is the dimension we're extracting - add the top level value
      if (!seenValues.has(displayTopValue)) {
        seenValues.add(displayTopValue);
        valuesArray.push(displayTopValue);
      }
    }

    // Look for the NEXT dimension's nested key
    if (depth + 1 < colGroupings.length) {
      const nextDim = colGroupings[depth + 1];
      const nextNestedKey = `by_${nextDim.dimension}`;
      const nextNested = row[nextNestedKey];

      if (nextNested && Array.isArray(nextNested)) {
        // Recurse into next dimension's nesting, but start at depth+1
        for (const nestedRow of nextNested) {
          extractColValuesFromRowOrdered(
            nestedRow,
            dimension,
            valuesArray,
            seenValues,
            colGroupings,
            depth + 1,
            parentValues,
            nestNameSuffix
          );
        }
      }
    }
    return;
  }

  // Standard nested case: current dimension is in a by_X array
  if (!nested || !Array.isArray(nested)) return;

  for (const colRow of nested) {
    let parentMatch = true;
    const dataKey = currentDim.label ?? currentDim.dimension;
    const colVal = colRow[dataKey] ?? colRow[currentDim.dimension];

    const parentVal = parentValues.get(currentDim.dimension);
    if (parentVal !== undefined && colVal !== parentVal) {
      parentMatch = false;
    }

    if (!parentMatch) continue;

    if (currentDim.dimension === dimension) {
      // Include null values as "(null)" to ensure limit counts match displayed rows
      let displayColVal = colVal;
      if (displayColVal === null) {
        displayColVal = "(null)";
      }
      if (displayColVal !== undefined && !seenValues.has(displayColVal)) {
        seenValues.add(displayColVal);
        valuesArray.push(displayColVal);
      }
    }

    extractColValuesFromRowOrdered(
      colRow,
      dimension,
      valuesArray,
      seenValues,
      colGroupings,
      depth + 1,
      parentValues,
      nestNameSuffix
    );
  }
}

// ---
// CELL LOOKUP BUILDER
// ---

/**
 * A value-based key for cell lookup.
 * Combines all dimensions into a single sorted key (axis-independent).
 * This allows lookups to work regardless of whether a dimension is on rows or columns.
 */
function makeCellKey(
  rowValues: Map<string, string | number>,
  colValues: Map<string, string | number>
): string {
  // Combine all dimension values, ignoring which axis they're on
  const allEntries: [string, string | number][] = [
    ...Array.from(rowValues.entries()),
    ...Array.from(colValues.entries()),
  ];

  return allEntries
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}=${v}`)
    .join("|");
}

interface CellLookup {
  get(
    rowValues: DimensionValues,
    colValues: DimensionValues,
    aggregate?: string
  ): CellValue;
}

/**
 * Build a cell lookup function from query results.
 *
 * Key insight: The lookup uses dimension VALUES, not structural positions.
 * We now use axis-independent keys so lookups work regardless of which axis
 * a dimension is on.
 *
 * @param invertedQueries Set of query IDs that have inverted axes (column dim is outer in Malloy)
 * @param flatQueries Set of query IDs that use flat structure (all dims in single group_by)
 */
function buildCellLookup(
  spec: TableSpec,
  plan: QueryPlan,
  results: QueryResults,
  invertedQueries: Set<string>,
  flatQueries: Set<string> = new Set()
): CellLookup {
  // Build an index: cellKey → aggregateName → value
  const cellIndex = new Map<string, Map<string, number | null>>();

  // Index all query results by plan query ID
  // Since we now use a unified QueryPlan system, IDs should match directly
  const DEBUG = process.env.DEBUG_GRID === "true";
  for (const query of plan.queries) {
    const queryData = results.get(query.id);
    if (!queryData || queryData.length === 0) {
      if (DEBUG) {
        console.log(`  No data for query ${query.id}`);
      }
      continue;
    }

    const isInverted = invertedQueries.has(query.id);
    const isFlatQuery = flatQueries.has(query.id);
    if (DEBUG) {
      console.log(
        `  Indexing ${query.id}: ${queryData.length} rows, inverted=${isInverted}, flat=${isFlatQuery}`
      );
    }
    indexQueryResults(
      queryData,
      query,
      cellIndex,
      spec.aggregates,
      isInverted,
      isFlatQuery
    );
  }

  // Debug: show all indexed keys
  if (DEBUG) {
    console.log(`  Total cell keys indexed: ${cellIndex.size}`);
    const keys = Array.from(cellIndex.keys()).slice(0, 5);
    console.log(`  Sample keys: ${keys.join(", ")}`);
  }

  return {
    get(
      rowValues: DimensionValues,
      colValues: DimensionValues,
      aggregate?: string
    ): CellValue {
      const cellKey = makeCellKey(rowValues, colValues);
      const cellData = cellIndex.get(cellKey);

      // Determine which aggregate to return
      const aggName = aggregate ?? spec.aggregates[0]?.name ?? "";
      const agg = spec.aggregates.find((a) => a.name === aggName);

      if (!cellData) {
        if (DEBUG) {
          console.log(`  Cell miss: ${cellKey}`);
        }
        return {
          raw: null,
          formatted: "",
          aggregate: aggName,
          pathDescription: cellKey,
        };
      }

      const value = cellData.get(aggName) ?? null;

      return {
        raw: value,
        formatted: formatValue(value, agg),
        aggregate: aggName,
        pathDescription: cellKey,
      };
    },
  };
}

/**
 * Index query results into the cell lookup structure.
 *
 * @param isInverted When true, the Malloy query has swapped axes:
 *   - Column dimension is outer (for global limit)
 *   - Row dimension is nested
 *   We swap the groupings interpretation to match.
 * @param isFlatQuery When true, all dimensions are at the same level (no nesting)
 */
function indexQueryResults(
  data: any[],
  query: TaggedQuerySpec,
  cellIndex: Map<string, Map<string, number | null>>,
  aggregates: AggregateInfo[],
  isInverted: boolean = false,
  isFlatQuery: boolean = false
): void {
  // Handle flat queries: all dimensions are at top level, no nesting
  if (isFlatQuery) {
    indexFlatQueryResults(data, query, cellIndex, aggregates);
    return;
  }

  // When inverted, the Malloy query structure is:
  // - Outer: column dimension (appears in data as top-level property)
  // - Nested: row dimension (appears as by_X nested array)
  // But we still want to build keys based on LOGICAL row/col groupings.
  // So we tell flattenAndIndex that what it sees as "row" data is actually "col".
  const malloyRowGroupings = isInverted
    ? query.colGroupings
    : query.rowGroupings;
  const malloyColGroupings = isInverted
    ? query.rowGroupings
    : query.colGroupings;

  // Track first dimensions to calculate nest name suffixes (only add suffix when first dimension collides)
  const seenFirstDims = new Map<string, number>();

  // Calculate suffix for primary variant
  let primarySuffix = "";
  if (malloyColGroupings.length > 0) {
    const firstDim = malloyColGroupings[0].dimension;
    const count = seenFirstDims.get(firstDim) || 0;
    seenFirstDims.set(firstDim, count + 1);
    primarySuffix = count > 0 ? `_${count}` : "";
  }

  // Flatten nested data and build value-based keys for primary column variant
  flattenAndIndex(
    data,
    malloyRowGroupings,
    malloyColGroupings,
    aggregates,
    new Map(), // values for malloy outer (will be mapped to correct axis)
    new Map(), // values for malloy nested (will be mapped to correct axis)
    cellIndex,
    0,
    isInverted,
    query.rowGroupings, // logical row groupings
    query.colGroupings, // logical col groupings
    primarySuffix
  );

  // Handle merged queries with additional column variants
  // Each variant has its own nests (e.g., by_gender vs by_sector_label)
  // that need to be indexed separately
  // The nests have suffixes like _1, _2 only when first dimension collides
  if (query.additionalColVariants) {
    for (const variant of query.additionalColVariants) {
      const variantColGroupings = isInverted
        ? query.rowGroupings
        : variant.colGroupings;

      // Calculate suffix based on first dimension collision
      let nestNameSuffix = "";
      if (variantColGroupings.length > 0) {
        const firstDim = variantColGroupings[0].dimension;
        const count = seenFirstDims.get(firstDim) || 0;
        seenFirstDims.set(firstDim, count + 1);
        nestNameSuffix = count > 0 ? `_${count}` : "";
      }

      flattenAndIndex(
        data,
        malloyRowGroupings,
        variantColGroupings,
        aggregates,
        new Map(),
        new Map(),
        cellIndex,
        0,
        isInverted,
        query.rowGroupings,
        variant.colGroupings,
        nestNameSuffix
      );
    }
  }
}

/**
 * Index flat query results where all dimensions are at the top level.
 *
 * Flat queries have structure: { dim1: val1, dim2: val2, ..., agg: value }
 * No nested by_X arrays - all dimensions are directly on each row.
 */
function indexFlatQueryResults(
  data: any[],
  query: TaggedQuerySpec,
  cellIndex: Map<string, Map<string, number | null>>,
  aggregates: AggregateInfo[]
): void {
  for (const row of data) {
    // Extract all row dimension values
    const rowValues = new Map<string, string | number>();
    for (const g of query.rowGroupings) {
      const dataKey = g.label ?? g.dimension;
      let value = row[dataKey];
      if (value === undefined) {
        value = row[g.dimension];
      }
      // Map null to "(null)" to match header extraction
      if (value === null) {
        value = "(null)";
      }
      if (value !== undefined) {
        rowValues.set(g.dimension, value);
      }
    }

    // Extract all column dimension values
    const colValues = new Map<string, string | number>();
    for (const g of query.colGroupings) {
      const dataKey = g.label ?? g.dimension;
      let value = row[dataKey];
      if (value === undefined) {
        value = row[g.dimension];
      }
      // Map null to "(null)" to match header extraction
      if (value === null) {
        value = "(null)";
      }
      if (value !== undefined) {
        colValues.set(g.dimension, value);
      }
    }

    // Index aggregate values using the combined row/col values
    indexAggregateValues(row, aggregates, rowValues, colValues, cellIndex);
  }
}

/**
 * Recursively flatten nested data and index by dimension values.
 *
 * @param malloyOuterGroupings The groupings that are at the outer level in Malloy data
 * @param malloyNestedGroupings The groupings that are nested (by_X) in Malloy data
 * @param isInverted When true, malloy outer = logical cols, malloy nested = logical rows
 * @param logicalRowGroupings The actual row groupings for cell key building
 * @param logicalColGroupings The actual col groupings for cell key building
 * @param nestNameSuffix Suffix for nest names (e.g., '_1' for merged query variants)
 */
function flattenAndIndex(
  data: any[],
  malloyOuterGroupings: GroupingInfo[],
  malloyNestedGroupings: GroupingInfo[],
  aggregates: AggregateInfo[],
  baseOuterValues: Map<string, string | number>,
  baseNestedValues: Map<string, string | number>,
  cellIndex: Map<string, Map<string, number | null>>,
  outerDepth: number,
  isInverted: boolean = false,
  logicalRowGroupings?: GroupingInfo[],
  logicalColGroupings?: GroupingInfo[],
  nestNameSuffix: string = ""
): void {
  for (const row of data) {
    // Build outer values - collect ALL outer dimension values from the current row
    // This handles the case where multiple dimensions are in the same group_by
    const currentOuterValues = new Map(baseOuterValues);

    // Collect all outer dimension values that exist on this row
    for (let i = outerDepth; i < malloyOuterGroupings.length; i++) {
      const g = malloyOuterGroupings[i];
      const dim = g.dimension;
      // Use label as data key if present, otherwise use dimension name
      const dataKey = g.label ?? dim;
      let value = row[dataKey];
      if (value === undefined) {
        value = row[dim];
      }
      // Map null to "(null)" to match header extraction
      if (value === null) {
        value = "(null)";
      }
      if (value !== undefined) {
        currentOuterValues.set(dim, value);
      } else {
        // Check for nested structure - use suffix for merged query variants
        // For the first variant (primary), suffix is empty, so by_dim
        // For additional variants, suffix is _1, _2, etc., so by_dim_1, by_dim_2
        const nestedKey = `by_${dim}${nestNameSuffix}`;
        if (row[nestedKey] && Array.isArray(row[nestedKey])) {
          // This dimension is nested - recurse
          flattenAndIndex(
            row[nestedKey],
            malloyOuterGroupings,
            malloyNestedGroupings,
            aggregates,
            currentOuterValues,
            baseNestedValues,
            cellIndex,
            i,
            isInverted,
            logicalRowGroupings,
            logicalColGroupings,
            nestNameSuffix
          );
          break; // Don't continue with this row, we recursed
        }
      }
    }

    // Handle nested pivots or direct aggregates
    // Only if we collected all outer dimensions (didn't break out for nesting)
    const hasAllOuterDims = malloyOuterGroupings.every(
      (g) =>
        currentOuterValues.has(g.dimension) ||
        row[`by_${g.dimension}${nestNameSuffix}`]
    );

    if (!hasAllOuterDims) {
      continue; // Skipped this row because we recursed into nested data
    }

    if (malloyNestedGroupings.length > 0) {
      indexColumnPivots(
        row,
        malloyNestedGroupings,
        aggregates,
        currentOuterValues,
        new Map(),
        cellIndex,
        0,
        isInverted,
        nestNameSuffix
      );
    } else {
      // Direct aggregate values
      // When inverted: currentOuterValues = col values, baseNestedValues = row values
      // When normal: currentOuterValues = row values, baseNestedValues = col values
      if (isInverted) {
        indexAggregateValues(
          row,
          aggregates,
          baseNestedValues, // These are actually the row values (empty when no nesting)
          currentOuterValues, // These are actually the col values
          cellIndex
        );
      } else {
        indexAggregateValues(
          row,
          aggregates,
          currentOuterValues,
          baseNestedValues,
          cellIndex
        );
      }
    }
  }
}

/**
 * Index column pivot values.
 *
 * @param isInverted When true, swap the interpretation:
 *   - outerValues are actually column values (from outer malloy grouping)
 *   - nestedValues are actually row values (from nested malloy grouping)
 * @param nestNameSuffix Suffix for nest names (e.g., '_1' for merged query variants).
 *   Only applied to the outermost nest (nestedDepth === 0) to match Malloy query structure.
 */
function indexColumnPivots(
  row: any,
  nestedGroupings: GroupingInfo[],
  aggregates: AggregateInfo[],
  outerValues: Map<string, string | number>,
  baseNestedValues: Map<string, string | number>,
  cellIndex: Map<string, Map<string, number | null>>,
  nestedDepth: number,
  isInverted: boolean = false,
  nestNameSuffix: string = ""
): void {
  const currentDim = nestedGroupings[nestedDepth];
  const remainingDims = nestedGroupings.slice(nestedDepth);

  // First try the single dimension key
  // Suffix only applies to outermost nest (nestedDepth === 0) to avoid duplicate top-level names
  let nestedKey =
    nestedDepth === 0
      ? `by_${currentDim.dimension}${nestNameSuffix}`
      : `by_${currentDim.dimension}`;
  let nested = row[nestedKey];

  // If not found, look for a combined key containing all remaining dimensions
  // This happens in inverted queries where row dims are grouped together
  if (!nested || !Array.isArray(nested)) {
    // Build combined key: by_dim1_dim2_...
    const combinedKey = "by_" + remainingDims.map((g) => g.dimension).join("_");
    nested = row[combinedKey];

    if (nested && Array.isArray(nested)) {
      // Found combined nest - extract ALL dimension values from each row
      for (const nestedRow of nested) {
        const currentNestedValues = new Map(baseNestedValues);

        // Extract all dimension values from this row
        for (const g of remainingDims) {
          const dataKey = g.label ?? g.dimension;
          let value = nestedRow[dataKey];
          if (value === undefined) {
            value = nestedRow[g.dimension];
          }
          // Map null to "(null)" to match header extraction
          if (value === null) {
            value = "(null)";
          }
          if (value !== undefined) {
            currentNestedValues.set(g.dimension, value);
          }
        }

        // This is the leaf level - index aggregate values
        if (isInverted) {
          indexAggregateValues(
            nestedRow,
            aggregates,
            currentNestedValues, // These are actually row values
            outerValues, // These are actually col values
            cellIndex
          );
        } else {
          indexAggregateValues(
            nestedRow,
            aggregates,
            outerValues,
            currentNestedValues,
            cellIndex
          );
        }
      }
      return;
    }

    // No matching nested key found
    return;
  }

  // Standard case: single dimension per nest level
  for (const nestedRow of nested) {
    // Use label as data key if present, otherwise use dimension name
    const dataKey = currentDim.label ?? currentDim.dimension;
    let nestedValue = nestedRow[dataKey];
    if (nestedValue === undefined) {
      nestedValue = nestedRow[currentDim.dimension];
    }
    // Map null to "(null)" to match header extraction
    if (nestedValue === null) {
      nestedValue = "(null)";
    }
    const currentNestedValues = new Map(baseNestedValues);

    if (nestedValue !== undefined) {
      currentNestedValues.set(currentDim.dimension, nestedValue);
    }

    if (nestedDepth + 1 < nestedGroupings.length) {
      // More nesting
      indexColumnPivots(
        nestedRow,
        nestedGroupings,
        aggregates,
        outerValues,
        currentNestedValues,
        cellIndex,
        nestedDepth + 1,
        isInverted,
        nestNameSuffix
      );
    } else {
      // Leaf - index aggregate values
      // When inverted: outer = cols, nested = rows
      // When normal: outer = rows, nested = cols
      if (isInverted) {
        indexAggregateValues(
          nestedRow,
          aggregates,
          currentNestedValues, // These are actually row values
          outerValues, // These are actually col values
          cellIndex
        );
      } else {
        indexAggregateValues(
          nestedRow,
          aggregates,
          outerValues,
          currentNestedValues,
          cellIndex
        );
      }
    }
  }
}

/**
 * Index aggregate values at a specific row/col value combination.
 */
function indexAggregateValues(
  row: any,
  aggregates: AggregateInfo[],
  rowValues: Map<string, string | number>,
  colValues: Map<string, string | number>,
  cellIndex: Map<string, Map<string, number | null>>
): void {
  const cellKey = makeCellKey(rowValues, colValues);

  let cellData = cellIndex.get(cellKey);
  if (!cellData) {
    cellData = new Map();
    cellIndex.set(cellKey, cellData);
  }

  for (const agg of aggregates) {
    const value = row[agg.name];
    if (value !== undefined) {
      cellData.set(agg.name, typeof value === "number" ? value : null);
    }
  }
}

/**
 * Parse a custom format pattern into prefix, precision, and suffix.
 * Pattern syntax: 'prefix #.precision suffix'
 * Examples:
 *   '$ #.2'      → prefix='$ ', precision=2, suffix=''
 *   '#.0 units'  → prefix='', precision=0, suffix=' units'
 *   '€ #.2 M'    → prefix='€ ', precision=2, suffix=' M'
 *   '# %'        → prefix='', precision=undefined, suffix=' %'
 */
function parseCustomFormatPattern(pattern: string): {
  prefix: string;
  suffix: string;
  precision: number | undefined;
} {
  // Find the # placeholder
  const hashIndex = pattern.indexOf("#");
  if (hashIndex === -1) {
    // No placeholder - treat entire pattern as suffix
    return { prefix: "", suffix: pattern, precision: undefined };
  }

  const prefix = pattern.substring(0, hashIndex);
  let remainder = pattern.substring(hashIndex + 1);

  // Check for precision specifier (.N)
  let precision: number | undefined;
  const precisionMatch = remainder.match(/^\.(\d+)/);
  if (precisionMatch) {
    precision = parseInt(precisionMatch[1], 10);
    remainder = remainder.substring(precisionMatch[0].length);
  }

  return { prefix, suffix: remainder, precision };
}

/**
 * Format a cell value according to its aggregate specification.
 */
function formatValue(value: number | null, agg?: AggregateInfo): string {
  if (value === null || value === undefined) return "";

  if (agg?.format) {
    switch (agg.format.type) {
      case "percent":
        // Standard percent format: 0.5 → 50%
        return `${(value * 100).toFixed(1)}%`;
      case "rawPercent":
        // For percentage aggregates (ACROSS), Malloy already computes 100.0 * value / denominator
        // so the value is already in percentage form (59.44 = 59.44%), don't multiply again
        return `${value.toFixed(1)}%`;
      case "integer":
        return Math.round(value).toLocaleString();
      case "comma":
        return value.toLocaleString(undefined, {
          minimumFractionDigits: agg.format.precision,
          maximumFractionDigits: agg.format.precision,
        });
      case "decimal":
        return value.toLocaleString(undefined, {
          minimumFractionDigits: agg.format.precision,
          maximumFractionDigits: agg.format.precision,
        });
      case "currency":
        return `$${value.toLocaleString()}`;
      case "custom": {
        // Parse custom format pattern: 'prefix #.precision suffix'
        const pattern = agg.format.pattern ?? "";
        const { prefix, suffix, precision } = parseCustomFormatPattern(pattern);
        const options: Intl.NumberFormatOptions = {};
        if (precision !== undefined) {
          options.minimumFractionDigits = precision;
          options.maximumFractionDigits = precision;
        }
        const formatted = value.toLocaleString(undefined, options);
        return `${prefix}${formatted}${suffix}`;
      }
      default:
        return String(value);
    }
  }

  // Default: locale-aware number formatting
  if (Number.isInteger(value)) {
    return value.toLocaleString();
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// ---
// UTILITIES
// ---

/**
 * Verify that a plan query matches the structure of the data.
 */
function verifyQueryMatch(query: TaggedQuerySpec, data: any[]): boolean {
  if (!data || data.length === 0) return false;

  const sample = data[0];
  const dataKeys = new Set(Object.keys(sample));

  // Check row groupings - data must have all row dimension keys
  for (const g of query.rowGroupings) {
    if (!dataKeys.has(g.dimension)) {
      return false;
    }
  }

  // If query expects row dimensions but data has none (total query mismatch)
  if (query.rowGroupings.length > 0) {
    const hasRowDim = query.rowGroupings.some((g) => dataKeys.has(g.dimension));
    if (!hasRowDim) return false;
  }

  // If query expects no row dimensions (isRowTotal) but data has row dims
  if (query.isRowTotal && query.rowGroupings.length === 0) {
    // Data should NOT have row dimension keys (only nested column keys)
    const hasAnyRowDim = Array.from(dataKeys).some(
      (k) => !k.startsWith("by_") && k !== "births_sum" && k !== "births_mean"
    );
    // Allow if it's just nested keys
    const onlyNestedKeys = Array.from(dataKeys).every(
      (k) => k.startsWith("by_") || k === "births_sum" || k === "births_mean"
    );
    if (!onlyNestedKeys) return false;
  }

  // Check col groupings - verify full column path
  if (query.colGroupings.length > 0) {
    if (!hasFullColPath(sample, query.colGroupings, query.rowGroupings)) {
      return false;
    }
  }

  return true;
}

/**
 * Find a query in the plan that matches the structure of the given data.
 * Checks if the data has the expected row/column groupings.
 */
function findMatchingQuery(
  plan: QueryPlan,
  data: any[]
): TaggedQuerySpec | undefined {
  if (!data || data.length === 0) return undefined;

  const sample = data[0];
  const dataKeys = new Set(Object.keys(sample));

  // Find a query whose groupings match the data structure
  for (const query of plan.queries) {
    let matches = true;

    // Check row groupings
    for (const g of query.rowGroupings) {
      if (!dataKeys.has(g.dimension)) {
        matches = false;
        break;
      }
    }

    // Check col groupings (look for by_X nested keys - check FULL column path)
    if (matches && query.colGroupings.length > 0) {
      // Navigate to leaf of row structure and verify full column path
      if (!hasFullColPath(sample, query.colGroupings, query.rowGroupings)) {
        matches = false;
      }
    }

    if (matches) {
      return query;
    }
  }

  return undefined;
}

/**
 * Check if a sample row has the full column path (all column dimensions).
 */
function hasFullColPath(
  row: any,
  colGroupings: GroupingInfo[],
  rowGroupings: GroupingInfo[]
): boolean {
  // Navigate through row nesting to find leaf
  let leafRow = row;
  for (let i = 1; i < rowGroupings.length; i++) {
    const rowNestedKey = `by_${rowGroupings[i].dimension}`;
    if (
      leafRow[rowNestedKey] &&
      Array.isArray(leafRow[rowNestedKey]) &&
      leafRow[rowNestedKey].length > 0
    ) {
      leafRow = leafRow[rowNestedKey][0];
    }
  }

  // Now check full column path from leaf
  let current = leafRow;
  for (const colG of colGroupings) {
    const nestedKey = `by_${colG.dimension}`;
    if (
      !current[nestedKey] ||
      !Array.isArray(current[nestedKey]) ||
      current[nestedKey].length === 0
    ) {
      return false;
    }
    current = current[nestedKey][0];
  }

  return true;
}

/**
 * Check if a sample row has a nested key (possibly through row nesting).
 */
function hasNestedKey(
  row: any,
  nestedKey: string,
  rowGroupings: GroupingInfo[]
): boolean {
  // Check direct key
  if (row[nestedKey] && Array.isArray(row[nestedKey])) {
    return true;
  }

  // Navigate through row nesting
  for (let i = 1; i < rowGroupings.length; i++) {
    const rowNestedKey = `by_${rowGroupings[i].dimension}`;
    if (
      row[rowNestedKey] &&
      Array.isArray(row[rowNestedKey]) &&
      row[rowNestedKey].length > 0
    ) {
      if (
        hasNestedKey(row[rowNestedKey][0], nestedKey, rowGroupings.slice(i))
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Index query results when no matching plan query was found.
 * Auto-detects structure from the data itself.
 */
function indexQueryResultsAuto(
  data: any[],
  cellIndex: Map<string, Map<string, number | null>>,
  aggregates: AggregateInfo[]
): void {
  if (!data || data.length === 0) return;

  // Auto-detect groupings from data structure
  const sample = data[0];
  const keys = Object.keys(sample);

  // Find dimension keys (non-aggregate, non-nested)
  const aggregateNames = new Set(aggregates.map((a) => a.name));
  const dimKeys = keys.filter(
    (k) =>
      !k.startsWith("by_") &&
      !aggregateNames.has(k) &&
      typeof sample[k] !== "object"
  );

  // Find nested keys (by_X patterns)
  const nestedKeys = keys.filter((k) => k.startsWith("by_"));

  // Build auto-detected groupings
  const rowGroupings: GroupingInfo[] = dimKeys.map((k) => ({
    dimension: k,
    label: undefined,
    sort: undefined,
    limit: undefined,
  }));

  // If there are nested keys, assume they're column groupings
  const colGroupings: GroupingInfo[] = nestedKeys.map((k) => ({
    dimension: k.replace("by_", ""),
    label: undefined,
    sort: undefined,
    limit: undefined,
  }));

  // Now index using detected structure
  flattenAndIndexAuto(
    data,
    rowGroupings,
    colGroupings,
    aggregates,
    new Map(),
    new Map(),
    cellIndex
  );
}

/**
 * Recursively flatten and index with auto-detected structure.
 */
function flattenAndIndexAuto(
  data: any[],
  rowGroupings: GroupingInfo[],
  colGroupings: GroupingInfo[],
  aggregates: AggregateInfo[],
  baseRowValues: Map<string, string | number>,
  baseColValues: Map<string, string | number>,
  cellIndex: Map<string, Map<string, number | null>>
): void {
  for (const row of data) {
    const currentRowValues = new Map(baseRowValues);

    // Extract all dimension values from the row
    for (const g of rowGroupings) {
      const value = row[g.dimension];
      if (value !== undefined && value !== null) {
        currentRowValues.set(g.dimension, value);
      }
    }

    // Check for nested row data
    const nestedRowKeys = Object.keys(row).filter(
      (k) =>
        k.startsWith("by_") &&
        !colGroupings.some((c) => `by_${c.dimension}` === k)
    );

    if (nestedRowKeys.length > 0) {
      // Has nested row data
      for (const nestedKey of nestedRowKeys) {
        const nestedData = row[nestedKey];
        if (Array.isArray(nestedData)) {
          flattenAndIndexAuto(
            nestedData,
            rowGroupings,
            colGroupings,
            aggregates,
            currentRowValues,
            baseColValues,
            cellIndex
          );
        }
      }
    }

    // Handle column pivots
    if (colGroupings.length > 0) {
      indexColumnPivotsAuto(
        row,
        colGroupings,
        aggregates,
        currentRowValues,
        new Map(),
        cellIndex,
        0
      );
    } else {
      // Direct aggregate values
      indexAggregateValues(
        row,
        aggregates,
        currentRowValues,
        baseColValues,
        cellIndex
      );
    }
  }
}

/**
 * Index column pivots with auto-detected structure.
 */
function indexColumnPivotsAuto(
  row: any,
  colGroupings: GroupingInfo[],
  aggregates: AggregateInfo[],
  rowValues: Map<string, string | number>,
  baseColValues: Map<string, string | number>,
  cellIndex: Map<string, Map<string, number | null>>,
  colDepth: number
): void {
  if (colDepth >= colGroupings.length) {
    indexAggregateValues(row, aggregates, rowValues, baseColValues, cellIndex);
    return;
  }

  const currentDim = colGroupings[colDepth];
  const nestedKey = `by_${currentDim.dimension}`;
  const nested = row[nestedKey];

  if (!nested || !Array.isArray(nested)) {
    // No more nesting - index here
    indexAggregateValues(row, aggregates, rowValues, baseColValues, cellIndex);
    return;
  }

  for (const colRow of nested) {
    const colValue = colRow[currentDim.dimension];
    const currentColValues = new Map(baseColValues);

    if (colValue !== undefined && colValue !== null) {
      currentColValues.set(currentDim.dimension, colValue);
    }

    indexColumnPivotsAuto(
      colRow,
      colGroupings,
      aggregates,
      rowValues,
      currentColValues,
      cellIndex,
      colDepth + 1
    );
  }
}

/**
 * Check if an axis tree contains a total node.
 */
function axisHasTotal(node: AxisNode | null): boolean {
  if (!node) return false;

  switch (node.nodeType) {
    case "total":
      return true;
    case "dimension":
      return node.child ? axisHasTotal(node.child) : false;
    case "siblings":
      return node.children.some((c) => axisHasTotal(c));
    case "aggregate":
    case "percentageAggregate":
      return false;
  }
}

// ---
// DEBUGGING
// ---

/**
 * Print a GridSpec for debugging.
 */
export function printGridSpec(grid: GridSpec): string {
  const lines: string[] = [];
  lines.push("GridSpec:");

  lines.push("\n  Row Headers:");
  printHeaderNodes(grid.rowHeaders, "    ", lines);

  lines.push("\n  Column Headers:");
  printHeaderNodes(grid.colHeaders, "    ", lines);

  lines.push(
    `\n  Aggregates: ${grid.aggregates.map((a) => a.name).join(", ")}`
  );
  lines.push(`  Has Row Total: ${grid.hasRowTotal}`);
  lines.push(`  Has Col Total: ${grid.hasColTotal}`);

  return lines.join("\n");
}

function printHeaderNodes(
  nodes: HeaderNode[],
  indent: string,
  lines: string[]
): void {
  for (const node of nodes) {
    let line = `${indent}${node.type}: "${node.value}"`;
    if (node.dimension) line += ` (dim: ${node.dimension})`;
    line += ` span=${node.span} depth=${node.depth}`;
    lines.push(line);

    if (node.children) {
      printHeaderNodes(node.children, indent + "  ", lines);
    }
  }
}

// ---
// CORNER ROW HEADERS
// ---

/**
 * Determine if corner-style row headers should be used.
 *
 * Corner headers (labels above in thead) are used when:
 * 1. Row axis has NO siblings ANYWHERE in the tree
 *    (siblings require left-style because each branch may have different dimensions)
 * 2. User hasn't explicitly set rowHeaders:left
 *
 * The default behavior is:
 * - rowHeaders:above (corner style) when no siblings exist
 * - rowHeaders:left when siblings exist (forced fallback)
 * - Explicit option overrides the default if compatible
 *
 * When siblings exist anywhere (e.g., state * (gender | region)), we can't
 * use corner headers because the sibling branches would need different labels
 * in the same corner cell, which doesn't make sense.
 */
function shouldUseCornerRowHeaders(spec: TableSpec): boolean {
  // Check if row axis exists
  if (!spec.rowAxis) {
    return false;
  }

  // Check for siblings anywhere in the tree - if found, must use left-style
  if (hasSiblingsAnywhere(spec.rowAxis)) {
    return false;
  }

  // If user explicitly set rowHeaders:left, respect that
  if (spec.options.rowHeaders === "left") {
    return false;
  }

  // Default to corner-style (above) when no siblings exist
  // This includes when rowHeaders is undefined or 'above'
  return true;
}

/**
 * Check if an axis tree contains "true" siblings anywhere (not just at root).
 *
 * "True siblings" means 2+ dimension children in a sibling group.
 * A single dimension with totals (dim | ALL) is NOT considered true siblings
 * because the structure is still linear - we can use corner-style headers.
 *
 * Note: The buildSiblingHeaders function separately decides whether to create
 * sibling-label wrappers (only for 2+ dimension siblings).
 */
function hasSiblingsAnywhere(node: AxisNode | null): boolean {
  if (!node) return false;

  if (node.nodeType === "siblings") {
    // Count dimension children - only consider "true siblings" if 2+ dimensions
    const dimensionChildCount = node.children.filter(
      (c) => c.nodeType === "dimension"
    ).length;

    if (dimensionChildCount >= 2) {
      return true; // Multiple dimensions → true siblings
    }

    // Check for nested sibling groups that each contain different dimensions
    // e.g., ((occupation | ALL) | (education | ALL)) has 2 sibling children,
    // each containing a different root dimension
    const siblingChildrenWithDims = node.children.filter((c) => {
      if (c.nodeType === "siblings") {
        // This sibling child contains dimensions (possibly with totals)
        return c.children.some((gc) => gc.nodeType === "dimension");
      }
      return false;
    });

    if (siblingChildrenWithDims.length >= 2) {
      // Multiple sibling groups each with dimensions → true siblings
      return true;
    }

    // Single dim + totals: check if the dimension has nested true siblings
    for (const child of node.children) {
      if (hasSiblingsAnywhere(child)) {
        return true;
      }
    }
    return false;
  }

  if (node.nodeType === "dimension") {
    return hasSiblingsAnywhere(node.child ?? null);
  }

  if (node.nodeType === "total") {
    return hasSiblingsAnywhere(node.child ?? null);
  }

  return false;
}

/**
 * Extract row dimension labels in nesting order for corner display.
 *
 * Walks the row axis tree and extracts dimension names and their labels.
 * For single-dimension sibling groups (dim | ALL), walks into the dimension
 * since the structure is still linear for header purposes.
 * Also handles aggregate siblings at the end of the chain.
 */
function extractRowDimensionLabels(
  node: AxisNode | null
): Array<{ dimension: string; label: string }> {
  const labels: Array<{ dimension: string; label: string }> = [];

  let current = node;
  while (current) {
    if (current.nodeType === "dimension") {
      const dimNode = current as DimensionNode;
      labels.push({
        dimension: dimNode.name,
        label: dimNode.label ?? dimNode.name,
      });
      current = dimNode.child ?? null;
    } else if (current.nodeType === "siblings") {
      // Check what kind of sibling group this is
      const siblingNode = current as SiblingGroup;
      const dimensionChildren = siblingNode.children.filter(
        (c) => c.nodeType === "dimension"
      );
      const aggregateChildren = siblingNode.children.filter(
        (c) =>
          c.nodeType === "aggregate" || c.nodeType === "percentageAggregate"
      );

      if (dimensionChildren.length === 1) {
        // Single dimension + totals: walk into the dimension
        // This handles patterns like (gender | ALL) where we still want the label
        current = dimensionChildren[0];
      } else if (
        dimensionChildren.length === 0 &&
        aggregateChildren.length > 0
      ) {
        // Aggregate siblings (e.g., income.(sum | mean))
        // Add a synthetic label for the aggregate column
        // The actual aggregate names will be shown in row headers
        labels.push({
          dimension: "_aggregate",
          label: "", // Aggregates show their own labels in row headers
        });
        break; // Aggregates are always leaves
      } else {
        // Multiple dimensions - stop collecting (true siblings need left-mode)
        break;
      }
    } else if (current.nodeType === "total") {
      // Total node - check if it has a child to continue
      const totalNode = current as TotalNode;
      current = totalNode.child ?? null;
    } else if (
      current.nodeType === "aggregate" ||
      current.nodeType === "percentageAggregate"
    ) {
      // Single aggregate - no header column needed
      break;
    } else {
      break;
    }
  }

  return labels;
}

/**
 * Extract row dimension labels for left-mode display (when siblings exist).
 *
 * In left mode, we show labels in the corner only when:
 * - The dimension has a custom label (user explicitly provided one)
 * - The dimension hasn't already been labeled at a different depth
 * - There are NO sibling-labels in the row headers (sibling-labels show labels in body)
 *
 * When the same dimension appears at different depths in different branches
 * (e.g., gender at depth 1 under ALL, but depth 2 under occupation), we show
 * the label at the DEEPEST depth where the dimension appears. This ensures
 * the label appears in the column that has the most values for that dimension.
 *
 * This walks all branches and finds dimensions with their labels,
 * returning one entry per header column depth.
 */
function extractLeftModeRowLabels(
  rowHeaders: HeaderNode[]
): Array<{ dimension?: string; label: string; hasCustomLabel: boolean }> {
  // Get max depth of row headers
  function getMaxDepth(nodes: HeaderNode[]): number {
    let max = 0;
    for (const node of nodes) {
      max = Math.max(max, node.depth);
      if (node.children) {
        max = Math.max(max, getMaxDepth(node.children));
      }
    }
    return max;
  }

  // Check if row headers contain sibling-labels
  // If so, those labels are already displayed in body row headers, don't duplicate in corner
  function hasSiblingLabels(nodes: HeaderNode[]): boolean {
    for (const node of nodes) {
      if (node.type === "sibling-label") return true;
      if (node.children && hasSiblingLabels(node.children)) return true;
    }
    return false;
  }

  const maxDepth = getMaxDepth(rowHeaders);

  // If sibling-labels exist, they handle showing labels in body - corner should be empty
  if (hasSiblingLabels(rowHeaders)) {
    const result: Array<{
      dimension?: string;
      label: string;
      hasCustomLabel: boolean;
    }> = [];
    for (let depth = 0; depth <= maxDepth; depth++) {
      result.push({ label: "", hasCustomLabel: false });
    }
    return result;
  }

  // First pass: find the deepest depth where each dimension with a custom label appears
  const dimensionToDeepestDepth = new Map<
    string,
    { depth: number; label: string }
  >();

  for (let depth = 0; depth <= maxDepth; depth++) {
    const labelsAtDepth = collectLabelsAtDepth(rowHeaders, depth);
    for (const info of labelsAtDepth) {
      if (info.hasCustomLabel && info.dimension) {
        // Always update to track the deepest occurrence
        const existing = dimensionToDeepestDepth.get(info.dimension);
        if (!existing || depth > existing.depth) {
          dimensionToDeepestDepth.set(info.dimension, {
            depth,
            label: info.label,
          });
        }
      }
    }
  }

  // Build result array
  const result: Array<{
    dimension?: string;
    label: string;
    hasCustomLabel: boolean;
  }> = [];

  for (let depth = 0; depth <= maxDepth; depth++) {
    // Check if any dimension should have its label at this depth
    let hasCustom = false;
    let customLabel = "";
    let dimension: string | undefined;

    for (const [dim, info] of dimensionToDeepestDepth) {
      if (info.depth === depth) {
        hasCustom = true;
        customLabel = info.label;
        dimension = dim;
        break;
      }
    }

    result.push({
      dimension,
      label: customLabel,
      hasCustomLabel: hasCustom,
    });
  }

  return result;
}

/**
 * Collect label information from all header nodes at a specific depth.
 *
 * Note: sibling-label nodes are NOT marked as having custom labels for corner display
 * because they already display their labels in body row headers. This prevents
 * duplicate labels appearing in both corner and body.
 */
function collectLabelsAtDepth(
  nodes: HeaderNode[],
  targetDepth: number
): Array<{ dimension?: string; label: string; hasCustomLabel: boolean }> {
  const labels: Array<{
    dimension?: string;
    label: string;
    hasCustomLabel: boolean;
  }> = [];

  function collect(node: HeaderNode): void {
    if (node.depth === targetDepth) {
      // Check if this node has a custom label
      // For dimension types: label is custom if node.label exists and differs from value
      // For sibling-label types: DON'T mark as custom - they show labels in body, not corner
      let hasCustomLabel = false;

      if (node.type === "dimension") {
        // A dimension node has a custom label if node.label is set and non-empty
        // The node.label comes from the AST when user writes: gender "mf"
        hasCustomLabel =
          node.label !== undefined &&
          node.label !== "" &&
          node.label !== node.dimension;
      } else if (node.type === "sibling-label") {
        // Sibling-labels display their labels in body row headers, not in corner cells.
        // Don't mark as custom to prevent duplicate label display.
        hasCustomLabel = false;
      }

      labels.push({
        dimension: node.dimension,
        label: node.label ?? node.value,
        hasCustomLabel,
      });
    }

    if (node.children) {
      for (const child of node.children) {
        collect(child);
      }
    }
  }

  for (const node of nodes) {
    collect(node);
  }

  return labels;
}

/**
 * Collect all dimension names from an axis tree.
 * Returns an empty array if the axis contains only aggregates (no dimensions).
 */
function collectDimensionsFromAxis(node: AxisNode | null): string[] {
  const dimensions: string[] = [];
  const seen = new Set<string>();

  function walk(n: AxisNode | null): void {
    if (!n) return;

    switch (n.nodeType) {
      case "dimension":
        if (!seen.has(n.name)) {
          seen.add(n.name);
          dimensions.push(n.name);
        }
        if (n.child) walk(n.child);
        break;
      case "total":
        if (n.child) walk(n.child);
        break;
      case "siblings":
        for (const child of n.children) {
          walk(child);
        }
        break;
      case "aggregate":
      case "percentageAggregate":
        // Leaf nodes, no dimensions to collect
        break;
    }
  }

  walk(node);
  return dimensions;
}
