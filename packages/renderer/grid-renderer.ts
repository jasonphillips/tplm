/**
 * Grid Renderer
 *
 * Renders a GridSpec directly to HTML.
 *
 * Key simplification: GridSpec already has the complete header hierarchy
 * with pre-computed spans, so we don't need to reconstruct structure.
 */

import {
  GridSpec,
  HeaderNode,
  DimensionValues,
  AggregateInfo,
} from '../compiler/table-spec.js';

// ---
// MAIN RENDER FUNCTION
// ---

export interface GridRenderOptions {
  /** CSS class for the table */
  tableClass?: string;
  /** Whether to show dimension labels in headers */
  showDimensionLabels?: boolean;
}

/**
 * Render a GridSpec to HTML.
 */
export function renderGridToHTML(
  grid: GridSpec,
  options: GridRenderOptions = {}
): string {
  const {
    tableClass = 'tpl-table',
    showDimensionLabels = true,
  } = options;

  const lines: string[] = [];
  lines.push(`<table class="${tableClass}">`);

  // Render column headers
  renderColumnHeaders(grid, lines, showDimensionLabels);

  // Render body (row headers + data cells)
  renderBody(grid, lines, showDimensionLabels);

  lines.push('</table>');
  return lines.join('\n');
}

// ---
// COLUMN HEADERS
// ---

/**
 * Get the maximum depth of header nodes.
 */
function getMaxDepth(nodes: HeaderNode[]): number {
  let maxDepth = 0;
  for (const node of nodes) {
    maxDepth = Math.max(maxDepth, node.depth);
    if (node.children) {
      maxDepth = Math.max(maxDepth, getMaxDepth(node.children));
    }
  }
  return maxDepth;
}

/**
 * Collect all nodes at a specific depth level.
 */
function getNodesAtDepth(nodes: HeaderNode[], targetDepth: number): HeaderNode[] {
  const result: HeaderNode[] = [];

  function collect(node: HeaderNode): void {
    if (node.depth === targetDepth) {
      result.push(node);
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

  return result;
}

/**
 * Check if aggregates are on the row axis (i.e., row headers contain _aggregate dimension).
 */
function areAggregatesOnRowAxis(rowHeaders: HeaderNode[]): boolean {
  function checkNode(node: HeaderNode): boolean {
    if (node.dimension === '_aggregate') {
      return true;
    }
    if (node.children) {
      for (const child of node.children) {
        if (checkNode(child)) return true;
      }
    }
    return false;
  }

  for (const header of rowHeaders) {
    if (checkNode(header)) return true;
  }
  return false;
}

/**
 * Render column header rows.
 */
function renderColumnHeaders(
  grid: GridSpec,
  lines: string[],
  showDimensionLabels: boolean
): void {
  // Get row header column count - if corner headers, we still have columns but labels go in corner
  const rowHeaderCols = grid.useCornerRowHeaders
    ? (grid.cornerRowLabels?.length ?? 0)
    : countRowHeaderColumns(grid.rowHeaders);

  // Check if aggregates are rendered as row headers
  const aggregatesOnRowAxis = areAggregatesOnRowAxis(grid.rowHeaders);

  if (grid.colHeaders.length === 0 && grid.aggregates.length === 1) {
    // No column headers - single aggregate with row-only layout
    // Still need a header row for the aggregate
    lines.push('<thead>');
    lines.push('<tr>');

    // Corner cells for row header columns - with labels if corner style or left mode with custom labels
    if (grid.useCornerRowHeaders && grid.cornerRowLabels) {
      for (const labelInfo of grid.cornerRowLabels) {
        const hasLabel = labelInfo.label.trim() !== '';
        const classes = hasLabel ? 'tpl-corner tpl-corner-label' : 'tpl-corner';
        lines.push(`<th class="${classes}">${escapeHTML(labelInfo.label)}</th>`);
      }
    } else if (grid.leftModeRowLabels) {
      for (let i = 0; i < rowHeaderCols; i++) {
        const labelInfo = grid.leftModeRowLabels[i];
        if (labelInfo?.hasCustomLabel) {
          lines.push(`<th class="tpl-corner tpl-corner-label">${escapeHTML(labelInfo.label)}</th>`);
        } else {
          lines.push('<th class="tpl-corner"></th>');
        }
      }
    } else {
      for (let i = 0; i < rowHeaderCols; i++) {
        lines.push('<th class="tpl-corner"></th>');
      }
    }

    // Single aggregate header
    lines.push(`<th>${escapeHTML(grid.aggregates[0]?.label ?? grid.aggregates[0]?.name ?? 'Value')}</th>`);
    lines.push('</tr>');
    lines.push('</thead>');
    return;
  }

  if (grid.colHeaders.length === 0) {
    // Multiple aggregates but no column dimensions
    lines.push('<thead>');
    lines.push('<tr>');

    // Corner cells with labels if corner style or left mode with custom labels
    if (grid.useCornerRowHeaders && grid.cornerRowLabels) {
      for (const labelInfo of grid.cornerRowLabels) {
        const hasLabel = labelInfo.label.trim() !== '';
        const classes = hasLabel ? 'tpl-corner tpl-corner-label' : 'tpl-corner';
        lines.push(`<th class="${classes}">${escapeHTML(labelInfo.label)}</th>`);
      }
    } else if (grid.leftModeRowLabels) {
      for (let i = 0; i < rowHeaderCols; i++) {
        const labelInfo = grid.leftModeRowLabels[i];
        if (labelInfo?.hasCustomLabel) {
          lines.push(`<th class="tpl-corner tpl-corner-label">${escapeHTML(labelInfo.label)}</th>`);
        } else {
          lines.push('<th class="tpl-corner"></th>');
        }
      }
    } else {
      for (let i = 0; i < rowHeaderCols; i++) {
        lines.push('<th class="tpl-corner"></th>');
      }
    }

    // If aggregates are on the row axis, render a single "Value" column header
    // (each row will have one cell for its specific aggregate)
    if (aggregatesOnRowAxis) {
      lines.push('<th>Value</th>');
    } else {
      // Aggregates are not on row axis, render each aggregate as a column header
      for (const agg of grid.aggregates) {
        lines.push(`<th>${escapeHTML(agg.label ?? agg.name)}</th>`);
      }
    }

    lines.push('</tr>');
    lines.push('</thead>');
    return;
  }

  // Multi-level column headers
  const maxDepth = getMaxDepth(grid.colHeaders);

  lines.push('<thead>');

  for (let depth = 0; depth <= maxDepth; depth++) {
    lines.push('<tr>');

    // Corner cells for row header columns - render per row instead of using rowspan
    // Labels only appear in the last row (depth === maxDepth)
    const isLastRow = depth === maxDepth;

    if (grid.useCornerRowHeaders && grid.cornerRowLabels) {
      // Corner-style: render row dimension labels in corner on the LAST row of thead
      for (let i = 0; i < rowHeaderCols; i++) {
        if (isLastRow) {
          const labelText = grid.cornerRowLabels[i]?.label ?? '';
          const hasLabel = labelText.trim() !== '';
          const classes = hasLabel ? 'tpl-corner tpl-corner-label' : 'tpl-corner';
          lines.push(`<th class="${classes}">${escapeHTML(labelText)}</th>`);
        } else {
          lines.push('<th class="tpl-corner"></th>');
        }
      }
    } else if (grid.leftModeRowLabels) {
      // Left mode with sibling structure: show only custom labels in last row
      for (let i = 0; i < rowHeaderCols; i++) {
        if (isLastRow) {
          const labelInfo = grid.leftModeRowLabels[i];
          if (labelInfo?.hasCustomLabel) {
            lines.push(`<th class="tpl-corner tpl-corner-label">${escapeHTML(labelInfo.label)}</th>`);
          } else {
            lines.push('<th class="tpl-corner"></th>');
          }
        } else {
          lines.push('<th class="tpl-corner"></th>');
        }
      }
    } else {
      // Default: empty corner cells
      for (let i = 0; i < rowHeaderCols; i++) {
        lines.push('<th class="tpl-corner"></th>');
      }
    }

    // Column headers at this depth
    const nodesAtDepth = getNodesAtDepth(grid.colHeaders, depth);
    for (const node of nodesAtDepth) {
      const rowspan = node.children ? 1 : (maxDepth - node.depth + 1);
      const colspan = node.span > 1 ? ` colspan="${node.span}"` : '';
      const rowspanAttr = rowspan > 1 ? ` rowspan="${rowspan}"` : '';
      const cssClasses: string[] = [];
      if (node.type === 'total') cssClasses.push('total-col');
      if (node.type === 'sibling-label') cssClasses.push('sibling-label');
      const cssClass = cssClasses.length > 0 ? ` class="${cssClasses.join(' ')}"` : '';

      lines.push(`<th${colspan}${rowspanAttr}${cssClass}>${escapeHTML(node.value)}</th>`);
    }

    lines.push('</tr>');
  }

  lines.push('</thead>');
}

/**
 * Count the number of columns needed for row headers.
 */
function countRowHeaderColumns(rowHeaders: HeaderNode[]): number {
  if (rowHeaders.length === 0) return 0;

  // Count depth levels (each level gets a column)
  const maxDepth = getMaxDepth(rowHeaders);
  return maxDepth + 1;
}

// ---
// BODY (ROW HEADERS + DATA)
// ---

/**
 * Collect all leaf header nodes (nodes without children).
 */
function collectLeafNodes(nodes: HeaderNode[]): HeaderNode[] {
  const leaves: HeaderNode[] = [];

  function collect(node: HeaderNode): void {
    if (!node.children || node.children.length === 0) {
      leaves.push(node);
    } else {
      for (const child of node.children) {
        collect(child);
      }
    }
  }

  for (const node of nodes) {
    collect(node);
  }

  return leaves;
}

/**
 * Collect dimension values from root to a leaf node.
 */
function collectDimensionValues(
  leaf: HeaderNode,
  allNodes: HeaderNode[]
): DimensionValues {
  const values: DimensionValues = new Map();

  // Build path from root to this leaf
  // We need to find ancestors by matching spans and positions
  // For simplicity, we'll just collect from the leaf and its siblings structure

  // Add the leaf's dimension value
  if (leaf.dimension && leaf.dimension !== '_aggregate') {
    const numValue = Number(leaf.value);
    values.set(leaf.dimension, isNaN(numValue) ? leaf.value : numValue);
  }

  // TODO: For nested headers, we need to track the path through the tree
  // This is simplified - for now we only handle flat row dimensions

  return values;
}

/**
 * Render table body with row headers and data cells.
 */
function renderBody(
  grid: GridSpec,
  lines: string[],
  showDimensionLabels: boolean
): void {
  lines.push('<tbody>');

  // Get all leaf row nodes (each becomes a data row)
  const rowLeaves = collectLeafNodes(grid.rowHeaders);
  const colLeaves = grid.colHeaders.length > 0 ? collectLeafNodes(grid.colHeaders) : [];

  // Track which row headers have been rendered (for rowspan)
  const maxRowDepth = getMaxDepth(grid.rowHeaders);
  const renderedAt = new Map<string, boolean>(); // "depth:value" -> rendered

  for (let rowIdx = 0; rowIdx < rowLeaves.length; rowIdx++) {
    lines.push('<tr>');

    // Render row headers for this row
    renderRowHeaders(grid, rowLeaves, rowIdx, maxRowDepth, renderedAt, lines);

    // Render data cells
    const rowValues = collectRowDimensionValues(grid.rowHeaders, rowLeaves[rowIdx]);

    const rowLeaf = rowLeaves[rowIdx];

    if (colLeaves.length > 0) {
      // With column pivots
      for (const colLeaf of colLeaves) {
        const colValues = collectColDimensionValues(grid.colHeaders, colLeaf);
        renderDataCell(grid, rowValues, colValues, rowLeaf, colLeaf, grid.rowHeaders, grid.colHeaders, lines);
      }
    } else {
      // No column pivots - render aggregate values directly
      renderDataCells(grid, rowValues, rowLeaf, lines);
    }

    lines.push('</tr>');
  }

  lines.push('</tbody>');
}

/**
 * Render row header cells for a data row.
 */
function renderRowHeaders(
  grid: GridSpec,
  rowLeaves: HeaderNode[],
  rowIdx: number,
  maxDepth: number,
  renderedAt: Map<string, boolean>,
  lines: string[]
): void {
  // Find the path from root to this leaf
  const leaf = rowLeaves[rowIdx];
  const path = findPathToLeaf(grid.rowHeaders, leaf);

  // When using corner row headers, skip sibling-label nodes (their labels are in corner)
  // and adjust depths accordingly
  const useCornerHeaders = grid.useCornerRowHeaders;

  // Filter path to only include renderable nodes for corner style
  const renderablePath = useCornerHeaders
    ? path.filter(n => n.type !== 'sibling-label')
    : path;

  // Calculate effective max depth for corner style
  const effectiveMaxDepth = useCornerHeaders
    ? (grid.cornerRowLabels?.length ?? 1) - 1
    : maxDepth;

  for (let depth = 0; depth <= effectiveMaxDepth; depth++) {
    // For corner headers, find the node that matches this column position
    // (nodes are already filtered to exclude sibling-labels)
    const nodeAtDepth = useCornerHeaders
      ? renderablePath[depth]
      : path.find(n => n.depth === depth);

    if (nodeAtDepth) {
      const key = `${depth}:${nodeAtDepth.value}:${getPathKey(path, depth)}`;

      if (!renderedAt.has(key)) {
        // First time seeing this header - render with rowspan
        renderedAt.set(key, true);

        const rowspan = nodeAtDepth.span > 1 ? ` rowspan="${nodeAtDepth.span}"` : '';
        const cssClasses: string[] = [];
        if (nodeAtDepth.type === 'total') cssClasses.push('total-row');
        if (nodeAtDepth.type === 'sibling-label' && !useCornerHeaders) cssClasses.push('sibling-label');
        const cssClass = cssClasses.length > 0 ? ` class="${cssClasses.join(' ')}"` : '';

        // If this is a leaf node that doesn't reach maxDepth, add colspan to fill remaining columns
        const isLeaf = useCornerHeaders
          ? (depth === renderablePath.length - 1)
          : (nodeAtDepth === leaf);
        const remainingDepth = effectiveMaxDepth - depth;
        const colspan = isLeaf && remainingDepth > 0 ? ` colspan="${remainingDepth + 1}"` : '';

        lines.push(`<th${rowspan}${colspan}${cssClass}>${escapeHTML(nodeAtDepth.value)}</th>`);

        // If we added colspan, skip the remaining depths in this iteration
        if (isLeaf && remainingDepth > 0) {
          break;
        }
      }
      // else: already rendered, skip (covered by rowspan)
    } else {
      // No node at this depth for this row - might happen with siblings
      // Leave as empty (rowspan should cover from a parent)
    }
  }
}

/**
 * Find the path from root to a leaf node.
 */
function findPathToLeaf(roots: HeaderNode[], target: HeaderNode): HeaderNode[] {
  function search(node: HeaderNode, path: HeaderNode[]): HeaderNode[] | null {
    const currentPath = [...path, node];

    if (node === target) {
      return currentPath;
    }

    if (node.children) {
      for (const child of node.children) {
        const result = search(child, currentPath);
        if (result) return result;
      }
    }

    return null;
  }

  for (const root of roots) {
    const result = search(root, []);
    if (result) return result;
  }

  return [target]; // Fallback: just the target
}

/**
 * Get a unique key for a path up to a certain depth.
 * Includes sibling indices from the node's path to distinguish headers
 * in different sibling groups that have the same dimension/value.
 */
function getPathKey(path: HeaderNode[], upToDepth: number): string {
  const nodesUpToDepth = path.filter(n => n.depth <= upToDepth);

  return nodesUpToDepth
    .map(n => {
      // Include sibling indices from the node's path for uniqueness
      const siblingPrefix = n.path
        ?.filter(seg => seg.type === 'sibling')
        .map(seg => (seg as { type: 'sibling'; index: number }).index)
        .join(',') ?? '';
      return `${siblingPrefix}:${n.dimension}:${n.value}`;
    })
    .join('|');
}

/**
 * Collect row dimension values from the path to a leaf.
 */
function collectRowDimensionValues(
  roots: HeaderNode[],
  leaf: HeaderNode
): DimensionValues {
  const values: DimensionValues = new Map();
  const path = findPathToLeaf(roots, leaf);

  for (const node of path) {
    if (node.dimension && node.dimension !== '_aggregate') {
      const numValue = Number(node.value);
      values.set(node.dimension, isNaN(numValue) ? node.value : numValue);
    }
  }

  return values;
}

/**
 * Collect column dimension values from the path to a leaf.
 */
function collectColDimensionValues(
  roots: HeaderNode[],
  leaf: HeaderNode
): DimensionValues {
  const values: DimensionValues = new Map();
  const path = findPathToLeaf(roots, leaf);

  for (const node of path) {
    if (node.dimension && node.dimension !== '_aggregate') {
      const numValue = Number(node.value);
      values.set(node.dimension, isNaN(numValue) ? node.value : numValue);
    }
  }

  return values;
}

/**
 * Find the aggregate name from a header node with _aggregate dimension.
 *
 * First checks the path for an aggregate segment (most reliable for sibling aggregates),
 * then falls back to matching by label/name.
 */
function findAggregateFromHeader(
  header: HeaderNode,
  aggregates: AggregateInfo[]
): string | undefined {
  if (header.dimension !== '_aggregate') return undefined;

  // First, check the path for an aggregate segment - this is the most reliable method
  // because it captures the exact aggregate from the tree structure
  for (const segment of header.path) {
    if (segment.type === 'aggregate') {
      // Verify this aggregate exists in our list
      const agg = aggregates.find(a => a.name === segment.name);
      if (agg) {
        return agg.name;
      }
    }
  }

  // Fallback: Match by label or formatted name
  const agg = aggregates.find(a =>
    a.label === header.value ||
    a.name === header.value ||
    formatAggName(a.name) === header.value
  );
  return agg?.name;
}

/**
 * Format aggregate name for display matching (e.g., "births_sum" -> "births sum")
 */
function formatAggName(name: string): string {
  return name.replace(/_/g, ' ');
}

/**
 * Check if a header node is or is part of a total path.
 */
function isInTotalPath(
  leaf: HeaderNode,
  roots: HeaderNode[]
): boolean {
  const path = findPathToLeaf(roots, leaf);
  return path.some(node => node.type === 'total');
}

/**
 * Render a single data cell.
 */
function renderDataCell(
  grid: GridSpec,
  rowValues: DimensionValues,
  colValues: DimensionValues,
  rowLeaf: HeaderNode,
  colLeaf: HeaderNode,
  rowRoots: HeaderNode[],
  colRoots: HeaderNode[],
  lines: string[]
): void {
  // Determine which aggregate to use - check both row and column
  let aggregateName: string | undefined;

  // Check if row has aggregate (e.g., ROWS ... * (sum | mean))
  aggregateName = findAggregateFromHeader(rowLeaf, grid.aggregates);

  // Check if column has aggregate (e.g., COLS ... * (sum | mean))
  if (!aggregateName) {
    aggregateName = findAggregateFromHeader(colLeaf, grid.aggregates);
  }

  const cell = grid.getCell(rowValues, colValues, aggregateName);

  // Build CSS classes for totals
  const classes: string[] = [];
  if (isInTotalPath(rowLeaf, rowRoots)) {
    classes.push('total-row');
  }
  if (isInTotalPath(colLeaf, colRoots)) {
    classes.push('total-col');
  }

  const classAttr = classes.length > 0 ? ` class="${classes.join(' ')}"` : '';
  lines.push(`<td${classAttr}>${escapeHTML(cell.formatted)}</td>`);
}

/**
 * Render data cells when there are no column pivots.
 */
function renderDataCells(
  grid: GridSpec,
  rowValues: DimensionValues,
  rowLeaf: HeaderNode,
  lines: string[]
): void {
  const colValues: DimensionValues = new Map();

  // Check if row specifies the aggregate
  const rowAgg = findAggregateFromHeader(rowLeaf, grid.aggregates);

  // Check if this row is a total row
  const isTotalRow = isInTotalPath(rowLeaf, grid.rowHeaders);
  const classAttr = isTotalRow ? ' class="total-row"' : '';

  if (rowAgg) {
    // Single aggregate cell based on row header
    const cell = grid.getCell(rowValues, colValues, rowAgg);
    lines.push(`<td${classAttr}>${escapeHTML(cell.formatted)}</td>`);
  } else {
    // Multiple aggregate cells
    for (const agg of grid.aggregates) {
      const cell = grid.getCell(rowValues, colValues, agg.name);
      lines.push(`<td${classAttr}>${escapeHTML(cell.formatted)}</td>`);
    }
  }
}

// ---
// UTILITIES
// ---

/**
 * Escape HTML special characters.
 */
function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
