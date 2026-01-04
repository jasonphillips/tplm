/**
 * table spec builder - converts AST to TableSpec tree
 * transforms flat groups into parent-child (nesting) and sibling (alternation) relationships
 */

import {
  TPLStatement,
  AxisExpression,
  GroupExpression,
  ItemExpression,
  DimensionRef,
  MeasureRef,
  MeasureBinding,
  AggregationRef,
  PercentageAggregateRef,
  AllRef,
  AnnotatedGroupRef,
  isDimensionRef,
  isMeasureRef,
  isMeasureBinding,
  isAggregationRef,
  isPercentageAggregateRef,
  isAllRef,
  isAxisExpression,
  isAnnotatedGroupRef,
  FormatSpec,
  LimitSpec,
  OrderSpec,
  isOrderByExpression,
} from '../parser/ast.js';

import {
  TableSpec,
  AxisNode,
  DimensionNode,
  AggregateNode,
  PercentageAggregateNode,
  TotalNode,
  SiblingGroup,
  AggregateInfo,
  collectAggregates,
} from './table-spec.js';

import { escapeFieldName } from './multi-query-utils.js';

// --- main ---

export function buildTableSpec(stmt: TPLStatement): TableSpec {
  const rowAxis = buildAxisTree(stmt.rowAxis);
  const colAxis = stmt.colAxis ? buildAxisTree(stmt.colAxis) : null;

  const rowAggregates = collectAggregates(rowAxis);
  const colAggregates = collectAggregates(colAxis);

  // merge and dedup aggregates
  const aggregateMap = new Map<string, AggregateInfo>();
  for (const agg of [...rowAggregates, ...colAggregates]) {
    if (!aggregateMap.has(agg.name)) {
      aggregateMap.set(agg.name, agg);
    }
  }

  // default to count
  if (aggregateMap.size === 0) {
    aggregateMap.set('count', {
      name: 'count',
      measure: '',
      aggregation: 'count',
    });
  }

  // Auto-generate NULL filters unless includeNulls is explicitly true
  // NOTE: We only include ROW dimensions in the global WHERE clause.
  // Column dimensions get NULL filters added at the nest level in query-plan-generator.ts
  // This fixes a bug where concatenated column sections (e.g., COLS (gender | occupation))
  // would incorrectly filter ALL rows by ALL column dimensions, rather than each
  // section filtering only by its own dimensions.
  const includeNulls = stmt.options.includeNulls ?? false;
  let whereClause = stmt.where ?? undefined;

  if (!includeNulls) {
    // Extract only ROW dimension names (column dimensions are handled per-nest)
    const rowDimensions = new Set<string>();
    extractDimensionNames(rowAxis, rowDimensions);

    // Generate NULL filters for row dimensions only
    // Use 'is not null' syntax for Malloy compatibility
    if (rowDimensions.size > 0) {
      const nullFilters = Array.from(rowDimensions)
        .map(dim => `${escapeFieldName(dim)} is not null`)
        .join(' and ');

      // Merge with existing WHERE clause
      if (whereClause) {
        whereClause = `(${whereClause}) AND (${nullFilters})`;
      } else {
        whereClause = nullFilters;
      }
    }
  }

  return {
    source: stmt.source ?? undefined,
    where: whereClause,
    options: stmt.options,
    rowAxis,
    colAxis,
    aggregates: Array.from(aggregateMap.values()),
    firstAxis: stmt.firstAxis,
  };
}

// --- axis tree building ---

function buildAxisTree(axis: AxisExpression): AxisNode | null {
  if (axis.groups.length === 0) {
    return null;
  }

  if (axis.groups.length === 1) {
    return buildFromGroup(axis.groups[0]);
  }

  // multiple groups -> sibling group
  const children: AxisNode[] = [];
  for (const group of axis.groups) {
    const child = buildFromGroup(group);
    if (child) {
      children.push(child);
    }
  }

  if (children.length === 0) {
    return null;
  }

  if (children.length === 1) {
    return children[0];
  }

  return {
    nodeType: 'siblings',
    children,
  };
}

function buildFromGroup(group: GroupExpression): AxisNode | null {
  if (group.items.length === 0) {
    return null;
  }

  // Build nodes from items in reverse order (so we can link child → parent)
  return buildChainFromItems(group.items, 0);
}

/**
 * Recursively build a node chain from items starting at index.
 *
 * items[index] becomes the current node, with items[index+1...] as descendants.
 */
function buildChainFromItems(items: ItemExpression[], index: number): AxisNode | null {
  if (index >= items.length) {
    return null;
  }

  const item = items[index];
  const remainingItems = items.slice(index + 1);

  // Get the child node for remaining items
  const childNode = remainingItems.length > 0
    ? buildChainFromItems(items, index + 1)
    : null;

  return itemToNode(item, childNode);
}

/**
 * Convert a single item to an AxisNode with optional child.
 */
function itemToNode(item: ItemExpression, child: AxisNode | null): AxisNode | null {
  if (isDimensionRef(item)) {
    return dimensionToNode(item, child);
  }

  if (isMeasureBinding(item)) {
    // Measure binding creates aggregate nodes
    // If there are multiple aggregations, we may need a sibling group
    return bindingToNodes(item, child);
  }

  if (isMeasureRef(item)) {
    // Standalone measure - treat as dimension for now (compiler will handle)
    return {
      nodeType: 'dimension',
      name: item.name,
      label: item.label,
      child: child ?? undefined,
    };
  }

  if (isAggregationRef(item)) {
    // Standalone aggregation - create placeholder aggregate
    return {
      nodeType: 'aggregate',
      measure: '__pending__',
      aggregation: item.method,
      format: item.format,
      label: item.label,
    };
  }

  if (isPercentageAggregateRef(item)) {
    // Percentage aggregate - (count ACROSS) or (income.sum ACROSS COLS)
    return {
      nodeType: 'percentageAggregate',
      measure: item.measure,
      aggregation: item.method,
      denominatorScope: item.denominatorScope,
      format: item.format,
      label: item.label,
    } as PercentageAggregateNode;
  }

  if (isAllRef(item)) {
    return {
      nodeType: 'total',
      label: item.label,
      child: child ?? undefined,
    };
  }

  if (isAxisExpression(item)) {
    // Parenthesized sub-expression
    return processNestedAxis(item, child);
  }

  if (isAnnotatedGroupRef(item)) {
    // Annotated group (e.g., (revenue cost).sum)
    return processAnnotatedGroup(item, child);
  }

  return null;
}

/**
 * Convert a DimensionRef to a DimensionNode.
 */
function dimensionToNode(dim: DimensionRef, child: AxisNode | null): DimensionNode {
  // Check for ACROSS modifier in both limit's orderBy and order's orderBy
  let acrossDimensions: string[] | undefined;

  // Helper function to extract ungrouped dimensions from an order-by expression
  const extractAcrossDimensions = (orderByExpr: any): string[] | undefined => {
    if (!isOrderByExpression(orderByExpr)) {
      return undefined;
    }

    if (orderByExpr.type === 'aggregateExpr' && orderByExpr.ungroupedDimensions) {
      return orderByExpr.ungroupedDimensions;
    } else if (orderByExpr.type === 'ratioExpr') {
      // Collect ungrouped dimensions from both numerator and denominator
      const ungrouped: string[] = [];
      if (orderByExpr.numerator.ungroupedDimensions) {
        ungrouped.push(...orderByExpr.numerator.ungroupedDimensions);
      }
      if (orderByExpr.denominator.ungroupedDimensions) {
        ungrouped.push(...orderByExpr.denominator.ungroupedDimensions);
      }
      return ungrouped.length > 0 ? [...new Set(ungrouped)] : undefined;
    }
    return undefined;
  };

  // Check limit's orderBy first (has precedence)
  if (dim.limit?.orderBy) {
    acrossDimensions = extractAcrossDimensions(dim.limit.orderBy);
  }

  // If no limit, check order's orderBy
  if (!acrossDimensions && dim.order?.orderBy) {
    acrossDimensions = extractAcrossDimensions(dim.order.orderBy);
  }

  return {
    nodeType: 'dimension',
    name: dim.name,
    label: dim.label,
    suppressLabel: dim.label === '',
    limit: dim.limit,
    order: dim.order,
    acrossDimensions,
    child: child ?? undefined,
  };
}

/**
 * Convert a MeasureBinding to aggregate node(s).
 *
 * If there are multiple aggregations, we create a SiblingGroup.
 */
function bindingToNodes(binding: MeasureBinding, child: AxisNode | null): AxisNode | null {
  const aggregates: AggregateNode[] = binding.aggregations.map(agg => ({
    nodeType: 'aggregate' as const,
    measure: binding.measure,
    aggregation: agg.method,
    // Per-aggregation format takes precedence over binding-level format
    format: agg.format ?? binding.format,
    // Per-aggregation label takes precedence over binding-level label
    label: agg.label ?? binding.label,
  }));

  if (aggregates.length === 0) {
    return null;
  }

  if (aggregates.length === 1) {
    // Single aggregate - just return it
    // Note: aggregates are leaves, so child would need special handling
    // For now, if there's a child, it means something came after the aggregate
    // which is unusual but we'll handle it by making the aggregate the leaf
    return aggregates[0];
  }

  // Multiple aggregations - create sibling group
  return {
    nodeType: 'siblings',
    children: aggregates,
  };
}

/**
 * Process a nested AxisExpression (parenthesized).
 *
 * The groups inside become siblings, and the child (from crossing)
 * gets attached to each leaf.
 */
function processNestedAxis(axis: AxisExpression, child: AxisNode | null): AxisNode | null {
  // Build each group's tree
  const groupTrees: AxisNode[] = [];

  for (const group of axis.groups) {
    const groupTree = buildFromGroup(group);
    if (groupTree) {
      // Attach the child to the leaves of this group's tree
      const withChild = child ? attachChildToLeaves(groupTree, child) : groupTree;
      groupTrees.push(withChild);
    }
  }

  if (groupTrees.length === 0) {
    return child;
  }

  if (groupTrees.length === 1) {
    return groupTrees[0];
  }

  // Multiple groups - create sibling group
  return {
    nodeType: 'siblings',
    children: groupTrees,
  };
}

/**
 * Process an AnnotatedGroupRef (e.g., (revenue cost).sum or (x y):format).
 */
function processAnnotatedGroup(annotated: AnnotatedGroupRef, child: AxisNode | null): AxisNode | null {
  // If there are aggregations, this is a group binding like (revenue cost).sum
  if (annotated.aggregations && annotated.aggregations.length > 0) {
    // Get all measures from the inner axis
    const measures = collectMeasuresFromAxis(annotated.inner);

    // Create aggregate nodes for each measure × aggregation combination
    const aggregates: AggregateNode[] = [];
    for (const measure of measures) {
      for (const agg of annotated.aggregations) {
        aggregates.push({
          nodeType: 'aggregate',
          measure,
          aggregation: agg.method,
          // Per-aggregation format takes precedence over annotated group format
          format: agg.format ?? annotated.format,
          label: annotated.label,
        });
      }
    }

    if (aggregates.length === 0) {
      return child;
    }

    if (aggregates.length === 1) {
      return aggregates[0];
    }

    return {
      nodeType: 'siblings',
      children: aggregates,
    };
  }

  // Otherwise, it's just a formatted/labeled group - process as nested axis
  const innerTree = buildAxisTree(annotated.inner);
  if (!innerTree) {
    return child;
  }

  // Apply format to all aggregate leaves
  const formatted = applyFormatToTree(innerTree, annotated.format, annotated.label);

  // Attach child to leaves
  return child ? attachChildToLeaves(formatted, child) : formatted;
}

// ---
// TREE MANIPULATION HELPERS
// ---

/**
 * Attach a child node to all leaves of a tree.
 *
 * This handles the case where (A | B) * C should become:
 *   SiblingGroup([A → C, B → C])
 */
function attachChildToLeaves(node: AxisNode, child: AxisNode): AxisNode {
  switch (node.nodeType) {
    case 'dimension':
      if (node.child) {
        // Already has a child - attach to its leaves
        return {
          ...node,
          child: attachChildToLeaves(node.child, child),
        };
      } else {
        // This is a leaf dimension - attach child here
        return {
          ...node,
          child: deepClone(child),
        };
      }

    case 'total':
      if (node.child) {
        return {
          ...node,
          child: attachChildToLeaves(node.child, child),
        };
      } else {
        return {
          ...node,
          child: deepClone(child),
        };
      }

    case 'siblings':
      // Attach to each sibling's leaves
      return {
        nodeType: 'siblings',
        children: node.children.map(c => attachChildToLeaves(c, child)),
      };

    case 'aggregate':
    case 'percentageAggregate':
      // Aggregates are leaves - can't attach children
      // This shouldn't happen in normal usage, but we handle it
      return node;
  }
}

/**
 * Apply format and/or label to all aggregate nodes in a tree.
 */
function applyFormatToTree(
  node: AxisNode,
  format?: FormatSpec,
  label?: string
): AxisNode {
  switch (node.nodeType) {
    case 'dimension':
      return {
        ...node,
        child: node.child ? applyFormatToTree(node.child, format, label) : undefined,
      };

    case 'total':
      return {
        ...node,
        child: node.child ? applyFormatToTree(node.child, format, label) : undefined,
      };

    case 'siblings':
      return {
        nodeType: 'siblings',
        children: node.children.map(c => applyFormatToTree(c, format, label)),
      };

    case 'aggregate':
    case 'percentageAggregate':
      return {
        ...node,
        format: format ?? node.format,
        label: label ?? node.label,
      };
  }
}

/**
 * Collect all measure names from an axis expression.
 */
function collectMeasuresFromAxis(axis: AxisExpression): string[] {
  const measures: string[] = [];

  function walk(item: ItemExpression): void {
    if (isMeasureRef(item)) {
      measures.push(item.name);
    } else if (isMeasureBinding(item)) {
      measures.push(item.measure);
    } else if (isDimensionRef(item)) {
      // In the context of an annotated group like (income | hourly).sum,
      // bare field names are being used as measures, not dimensions
      measures.push(item.name);
    } else if (isAxisExpression(item)) {
      for (const group of item.groups) {
        for (const subItem of group.items) {
          walk(subItem);
        }
      }
    } else if (isAnnotatedGroupRef(item)) {
      for (const group of item.inner.groups) {
        for (const subItem of group.items) {
          walk(subItem);
        }
      }
    }
  }

  for (const group of axis.groups) {
    for (const item of group.items) {
      walk(item);
    }
  }

  return measures;
}

/**
 * Deep clone an AxisNode tree.
 */
/**
 * Extract all dimension names from an axis tree.
 * Recursively walks the tree and collects dimension names into the provided set.
 */
function extractDimensionNames(node: AxisNode | null, dimensions: Set<string>): void {
  if (!node) return;

  switch (node.nodeType) {
    case 'dimension':
      dimensions.add(node.name);
      if (node.child) {
        extractDimensionNames(node.child, dimensions);
      }
      break;

    case 'total':
      if (node.child) {
        extractDimensionNames(node.child, dimensions);
      }
      break;

    case 'siblings':
      for (const child of node.children) {
        extractDimensionNames(child, dimensions);
      }
      break;

    case 'aggregate':
    case 'percentageAggregate':
      // Aggregates don't contain dimensions
      break;
  }
}

function deepClone(node: AxisNode): AxisNode {
  switch (node.nodeType) {
    case 'dimension':
      return {
        ...node,
        child: node.child ? deepClone(node.child) : undefined,
      };

    case 'total':
      return {
        ...node,
        child: node.child ? deepClone(node.child) : undefined,
      };

    case 'siblings':
      return {
        nodeType: 'siblings',
        children: node.children.map(c => deepClone(c)),
      };

    case 'aggregate':
    case 'percentageAggregate':
      return { ...node };
  }
}

// ---
// DEBUGGING
// ---

/**
 * Print a TableSpec for debugging.
 */
export function printTableSpec(spec: TableSpec): string {
  const lines: string[] = [];

  lines.push('TableSpec:');
  if (spec.source) lines.push(`  source: ${spec.source}`);
  if (spec.where) lines.push(`  where: ${spec.where}`);

  lines.push('');
  lines.push('  Row Axis:');
  if (spec.rowAxis) {
    lines.push(printAxisTreeIndented(spec.rowAxis, '    '));
  } else {
    lines.push('    (none)');
  }

  lines.push('');
  lines.push('  Column Axis:');
  if (spec.colAxis) {
    lines.push(printAxisTreeIndented(spec.colAxis, '    '));
  } else {
    lines.push('    (none)');
  }

  lines.push('');
  lines.push('  Aggregates:');
  for (const agg of spec.aggregates) {
    let aggStr = `    ${agg.measure}.${agg.aggregation}`;
    if (agg.label) aggStr += ` "${agg.label}"`;
    if (agg.format) aggStr += ` :${agg.format.type}`;
    lines.push(aggStr);
  }

  return lines.join('\n');
}

function printAxisTreeIndented(node: AxisNode, indent: string): string {
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
        lines.push(printAxisTreeIndented(node.child, indent + '  '));
      }
      break;

    case 'total':
      lines.push(`${indent}TOTAL${node.label ? ` "${node.label}"` : ''}`);
      if (node.child) {
        lines.push(printAxisTreeIndented(node.child, indent + '  '));
      }
      break;

    case 'siblings':
      lines.push(`${indent}SIBLINGS:`);
      for (let i = 0; i < node.children.length; i++) {
        lines.push(`${indent}  [${i}]:`);
        lines.push(printAxisTreeIndented(node.children[i], indent + '    '));
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
