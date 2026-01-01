/**
 * TPL Prettifier - Formats TPL AST back to readable TPL source code
 *
 * Formatting Rules:
 * 1. Very short statements (< 60 chars) stay on one line
 * 2. Medium statements have clauses on separate lines, content inline
 * 3. Statements with 3+ top-level | alternatives get multiline axis format
 * 4. Complex statements break intelligently for readability
 */

import type {
  TPLStatement,
  AxisExpression,
  GroupExpression,
  ItemExpression,
  DimensionRef,
  MeasureRef,
  AggregationRef,
  MeasureBinding,
  PercentageAggregateRef,
  AllRef,
  AnnotatedGroupRef,
  OrderSpec,
  LimitSpec,
  FormatSpec,
  OrderByExpression,
  AggregateExpr,
  RatioExpr,
  AggregationSpec,
} from './ast.js';

// Configuration
const VERY_SHORT_THRESHOLD = 60;  // Keep on one line if total < this
const MULTILINE_THRESHOLD = 100;   // Consider breaking if line > this
const MIN_ALTERNATIVES_FOR_BREAK = 3;  // Break at | if >= this many groups

/**
 * Format a TPL statement AST into pretty-printed TPL source code
 */
export function formatTPL(ast: TPLStatement): string {
  // First, try to format as one line
  const oneLine = formatAsOneLine(ast);

  // If it's very short, use one line
  if (oneLine.length < VERY_SHORT_THRESHOLD) {
    return oneLine;
  }

  // Otherwise, use multiline format
  return formatAsMultiLine(ast);
}

/**
 * Format the entire statement on one line (for short statements)
 */
function formatAsOneLine(ast: TPLStatement): string {
  const parts: string[] = ['TABLE'];

  if (ast.source) {
    parts.push('FROM', ast.source);
  }

  if (ast.where) {
    parts.push('WHERE', ast.where);
  }

  parts.push('ROWS', formatAxis(ast.rowAxis, false));

  if (ast.colAxis) {
    parts.push('COLS', formatAxis(ast.colAxis, false));
  }

  return parts.join(' ') + ';';
}

/**
 * Format the statement with proper line breaks and indentation
 */
function formatAsMultiLine(ast: TPLStatement): string {
  const lines: string[] = ['TABLE'];

  if (ast.source) {
    lines.push('  FROM ' + ast.source);
  }

  if (ast.where) {
    lines.push('  WHERE ' + ast.where);
  }

  // Determine if ROWS axis should be multiline
  const rowAxisMultiline = shouldAxisBeMultiline(ast.rowAxis);
  if (rowAxisMultiline) {
    lines.push('  ROWS');
    const formattedRows = formatAxisMultiline(ast.rowAxis);
    lines.push(...formattedRows.map(line => '    ' + line));
  } else {
    lines.push('  ROWS ' + formatAxis(ast.rowAxis, false));
  }

  if (ast.colAxis) {
    const colAxisMultiline = shouldAxisBeMultiline(ast.colAxis);
    if (colAxisMultiline) {
      lines.push('  COLS');
      const formattedCols = formatAxisMultiline(ast.colAxis);
      lines.push(...formattedCols.map(line => '    ' + line));
    } else {
      lines.push('  COLS ' + formatAxis(ast.colAxis, false));
    }
  }

  lines.push(';');

  return lines.join('\n');
}

/**
 * Determine if an axis should be formatted multiline
 */
function shouldAxisBeMultiline(axis: AxisExpression): boolean {
  // If there are 3+ top-level groups (alternatives), use multiline
  if (axis.groups.length >= MIN_ALTERNATIVES_FOR_BREAK) {
    return true;
  }

  // If the axis is very long when formatted inline, consider multiline
  const inline = formatAxis(axis, false);
  if (inline.length > MULTILINE_THRESHOLD) {
    return axis.groups.length > 1;  // Only break if there are alternatives
  }

  return false;
}

/**
 * Format an axis expression (inline format)
 */
function formatAxis(axis: AxisExpression, inParens: boolean): string {
  const groups = axis.groups.map(g => formatGroup(g));
  return groups.join(' | ');
}

/**
 * Format an axis expression with line breaks (multiline format)
 */
function formatAxisMultiline(axis: AxisExpression): string[] {
  const lines: string[] = [];

  for (let i = 0; i < axis.groups.length; i++) {
    const group = formatGroup(axis.groups[i]);
    if (i === 0) {
      lines.push(group);
    } else {
      lines.push('| ' + group);
    }
  }

  return lines;
}

/**
 * Format a group expression (items crossed with *)
 */
function formatGroup(group: GroupExpression): string {
  const items = group.items.map(item => formatItem(item));
  return items.join(' * ');
}

/**
 * Format an item expression
 */
function formatItem(item: ItemExpression): string {
  switch (item.type) {
    case 'dimension':
      return formatDimensionRef(item);
    case 'measure':
      return formatMeasureRef(item);
    case 'aggregation':
      return formatAggregationRef(item);
    case 'binding':
      return formatMeasureBinding(item);
    case 'percentageAggregate':
      return formatPercentageAggregate(item);
    case 'all':
      return formatAllRef(item);
    case 'axis':
      return '(' + formatAxis(item, true) + ')';
    case 'annotatedGroup':
      return formatAnnotatedGroup(item);
    default:
      const _exhaustive: never = item;
      return '';
  }
}

/**
 * Format a dimension reference
 */
function formatDimensionRef(dim: DimensionRef): string {
  let result = dim.name;

  // Add limit
  if (dim.limit) {
    result += formatLimit(dim.limit);
  }

  // Add order (only if no limit, since limit includes direction)
  if (dim.order && !dim.limit) {
    result += formatOrder(dim.order);
  }

  // Add label
  if (dim.label) {
    result += ' ' + formatLabel(dim.label);
  }

  return result;
}

/**
 * Format a measure reference
 */
function formatMeasureRef(measure: MeasureRef): string {
  let result = measure.name;

  if (measure.format) {
    result += formatFormat(measure.format);
  }

  if (measure.label) {
    result += ' ' + formatLabel(measure.label);
  }

  return result;
}

/**
 * Format an aggregation reference
 */
function formatAggregationRef(agg: AggregationRef): string {
  let result = agg.method;

  if (agg.format) {
    result += formatFormat(agg.format);
  }

  if (agg.label) {
    result += ' ' + formatLabel(agg.label);
  }

  return result;
}

/**
 * Format a measure binding (e.g., revenue.sum or revenue.(sum | mean))
 */
function formatAggregationSpec(spec: AggregationSpec): string {
  let result = spec.method;
  if (spec.format) {
    result += formatFormat(spec.format);
  }
  return result;
}

function formatMeasureBinding(binding: MeasureBinding): string {
  let result = binding.measure + '.';

  if (binding.aggregations.length === 1) {
    result += formatAggregationSpec(binding.aggregations[0]);
  } else {
    result += '(' + binding.aggregations.map(formatAggregationSpec).join(' | ') + ')';
  }

  if (binding.format) {
    result += formatFormat(binding.format);
  }

  if (binding.label) {
    result += ' ' + formatLabel(binding.label);
  }

  return result;
}

/**
 * Format a percentage aggregate (e.g., (count ACROSS COLS))
 */
function formatPercentageAggregate(pct: PercentageAggregateRef): string {
  let inner = '';

  if (pct.measure) {
    inner = pct.measure + '.' + pct.method;
  } else {
    inner = pct.method;
  }

  inner += ' ACROSS';

  if (pct.denominatorScope === 'all') {
    // (count ACROSS) - no additional scope
  } else if (pct.denominatorScope === 'rows') {
    inner += ' ROWS';
  } else if (pct.denominatorScope === 'cols') {
    inner += ' COLS';
  } else {
    // Array of dimension names
    inner += ' ' + pct.denominatorScope.join(', ');
  }

  let result = '(' + inner + ')';

  if (pct.format) {
    result += formatFormat(pct.format);
  }

  if (pct.label) {
    result += ' ' + formatLabel(pct.label);
  }

  return result;
}

/**
 * Format an ALL reference
 */
function formatAllRef(all: AllRef): string {
  let result = 'ALL';

  if (all.label) {
    result += ' ' + formatLabel(all.label);
  }

  return result;
}

/**
 * Format an annotated group (e.g., (revenue | cost):currency)
 */
function formatAnnotatedGroup(group: AnnotatedGroupRef): string {
  let result = '(' + formatAxis(group.inner, true) + ')';

  if (group.aggregations) {
    if (group.aggregations.length === 1) {
      result += '.' + formatAggregationSpec(group.aggregations[0]);
    } else {
      result += '.(' + group.aggregations.map(formatAggregationSpec).join(' | ') + ')';
    }
  }

  if (group.format) {
    result += formatFormat(group.format);
  }

  if (group.label) {
    result += ' ' + formatLabel(group.label);
  }

  return result;
}

/**
 * Format a limit specification
 */
function formatLimit(limit: LimitSpec): string {
  let result = '[';

  if (limit.direction === 'desc') {
    result += '-';
  }

  result += limit.count;

  if (limit.orderBy) {
    result += '@' + formatOrderBy(limit.orderBy);
  }

  result += ']';

  return result;
}

/**
 * Format an order specification
 */
function formatOrder(order: OrderSpec): string {
  let result = '';

  // Add direction if present
  if (order.direction === 'asc') {
    result += ' ASC';
  } else if (order.direction === 'desc') {
    result += ' DESC';
  }

  // Add orderBy if present
  if (order.orderBy) {
    result += '@' + formatOrderBy(order.orderBy);
  }

  return result;
}

/**
 * Format an order-by expression (string or complex expression)
 */
function formatOrderBy(orderBy: string | OrderByExpression): string {
  if (typeof orderBy === 'string') {
    return orderBy;
  }

  if (orderBy.type === 'aggregateExpr') {
    return formatAggregateExpr(orderBy);
  } else {
    return formatRatioExpr(orderBy);
  }
}

/**
 * Format an aggregate expression (e.g., births.sum or births.sum<name>)
 */
function formatAggregateExpr(expr: AggregateExpr): string {
  let result = expr.field + '.' + expr.function;

  if (expr.ungroupedDimensions && expr.ungroupedDimensions.length > 0) {
    result += '<' + expr.ungroupedDimensions.join(', ') + '>';
  }

  return result;
}

/**
 * Format a ratio expression
 */
function formatRatioExpr(expr: RatioExpr): string {
  return '(' + formatAggregateExpr(expr.numerator) + ' / ' + formatAggregateExpr(expr.denominator) + ')';
}

/**
 * Format a format specification
 */
function formatFormat(format: FormatSpec): string {
  switch (format.type) {
    case 'currency':
      return ':currency';
    case 'percent':
      return ':percent';
    case 'rawPercent':
      return ':rawPercent';
    case 'integer':
      return ':integer';
    case 'decimal':
      return ':decimal.' + format.precision;
    case 'comma':
      return ':comma.' + format.precision;
    case 'custom':
      return ':' + formatLabel(format.pattern);
    default:
      const _exhaustive: never = format;
      return '';
  }
}

/**
 * Format a label (quoted string)
 */
function formatLabel(label: string): string {
  // Use double quotes, escape any internal double quotes
  const escaped = label.replace(/"/g, '\\"');
  return '"' + escaped + '"';
}
