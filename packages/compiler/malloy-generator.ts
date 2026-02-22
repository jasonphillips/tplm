/**
 * Malloy Query Generator
 *
 * Converts TaggedQuerySpec objects to Malloy query strings.
 */

import {
  TableSpec,
  TaggedQuerySpec,
  QueryPlan,
  GroupingInfo,
  AggregateInfo,
} from './table-spec.js';

export interface MalloyQuery {
  /** Query ID (for matching results back) */
  id: string;
  /** Generated Malloy query string */
  malloy: string;
  /** Copy of the query spec for reference */
  spec: TaggedQuerySpec;
}

export interface MalloyQueryPlan {
  /** All Malloy queries to execute */
  queries: MalloyQuery[];
  /** Source name */
  source: string;
  /** Mapping from paths to query IDs */
  pathToQuery: Map<string, string>;
}

export interface MalloyGeneratorOptions {
  /** Malloy source name */
  source: string;
  /** Maximum limit for any grouping (caps higher limits) */
  maxLimit?: number;
}

/**
 * Generate Malloy queries from a QueryPlan.
 */
export function generateMalloyQueries(
  spec: TableSpec,
  plan: QueryPlan,
  options: MalloyGeneratorOptions
): MalloyQueryPlan {
  const { source, maxLimit } = options;

  const queries: MalloyQuery[] = plan.queries.map(querySpec => {
    const malloy = buildMalloyQuery(querySpec, spec, source, maxLimit);
    return {
      id: querySpec.id,
      malloy,
      spec: querySpec,
    };
  });

  return {
    queries,
    source,
    pathToQuery: plan.pathToQuery,
  };
}

/**
 * Build a single Malloy query from a TaggedQuerySpec.
 */
function buildMalloyQuery(
  query: TaggedQuerySpec,
  spec: TableSpec,
  source: string,
  maxLimit?: number
): string {
  const parts: string[] = [];

  // Run statement
  parts.push(`run: ${source} -> {`);

  // Row groupings
  if (query.rowGroupings.length > 0) {
    parts.push(buildGroupBy(query.rowGroupings, maxLimit));
  }

  // Column pivots (nest)
  if (query.colGroupings.length > 0) {
    parts.push(buildNest(query.colGroupings, query.aggregates, maxLimit));
  } else {
    // Direct aggregates
    parts.push(buildAggregates(query.aggregates));
  }

  // Add total if needed
  if (query.hasColTotal && query.colGroupings.length > 0) {
    parts.push(buildTotalAggregate(query.aggregates, query.colTotalLabel));
  }

  parts.push('}');

  return parts.join('\n');
}

/**
 * Build group_by clause for row dimensions.
 */
function buildGroupBy(groupings: GroupingInfo[], maxLimit?: number): string {
  const dims = groupings.map(g => {
    let dimStr = g.dimension;

    // Handle ordering and limits
    if (g.limit) {
      const effectiveCount = maxLimit
        ? Math.min(g.limit.count, maxLimit)
        : g.limit.count;

      // For limits, we need to use nest with ordering
      // This will be handled in a more complex way for proper limits
    }

    return dimStr;
  });

  return `  group_by: ${dims.join(', ')}`;
}

/**
 * Build nest clause for column pivots.
 */
function buildNest(
  colGroupings: GroupingInfo[],
  aggregates: AggregateInfo[],
  maxLimit?: number
): string {
  const lines: string[] = [];

  // Build nested structure for each column dimension
  const nestName = `by_${colGroupings[0].dimension}`;
  lines.push(`  nest: ${nestName} is {`);
  lines.push(`    group_by: ${colGroupings[0].dimension}`);

  if (colGroupings.length > 1) {
    // More nesting
    lines.push(buildNestedPivot(colGroupings.slice(1), aggregates, 4));
  } else {
    // Aggregates at leaf
    lines.push(buildAggregates(aggregates, 4));
  }

  lines.push('  }');

  return lines.join('\n');
}

/**
 * Build nested pivot structure.
 */
function buildNestedPivot(
  colGroupings: GroupingInfo[],
  aggregates: AggregateInfo[],
  indent: number
): string {
  const pad = ' '.repeat(indent);
  const lines: string[] = [];

  const nestName = `by_${colGroupings[0].dimension}`;
  lines.push(`${pad}nest: ${nestName} is {`);
  lines.push(`${pad}  group_by: ${colGroupings[0].dimension}`);

  if (colGroupings.length > 1) {
    lines.push(buildNestedPivot(colGroupings.slice(1), aggregates, indent + 2));
  } else {
    lines.push(buildAggregates(aggregates, indent + 2));
  }

  lines.push(`${pad}}`);

  return lines.join('\n');
}

/**
 * Build aggregate clause.
 */
function buildAggregates(aggregates: AggregateInfo[], indent: number = 2): string {
  const pad = ' '.repeat(indent);
  const aggs = aggregates.map(a => {
    return `${a.name} is ${buildAggExpr(a.measure, a.aggregation)}`;
  });

  return `${pad}aggregate: ${aggs.join(', ')}`;
}

/** Build a Malloy aggregate expression (mirrors multi-query-utils buildAggExpression) */
function buildAggExpr(measure: string, aggregation: string): string {
  if (aggregation === 'count') {
    if (measure && measure !== '__pending__' && measure !== '') {
      return `count(${escapeForMalloy(measure)})`;
    }
    return 'count()';
  }
  if (!measure || measure === '__pending__') return 'count()';
  const methodMap: Record<string, string> = { mean: 'avg', stdev: 'stddev', pct: 'sum', pctn: 'count', pctsum: 'sum' };
  return `${measure}.${methodMap[aggregation] ?? aggregation}()`;
}

const MALLOY_RESERVED = new Set(['all','and','as','asc','avg','by','case','cast','count','day','desc','dimension','else','end','exclude','extend','false','from','group','having','hour','import','is','join','limit','max','measure','min','minute','month','nest','not','now','null','number','on','or','order','pick','quarter','run','second','source','sum','then','true','week','when','where','year']);
function escapeForMalloy(name: string): string {
  return MALLOY_RESERVED.has(name.toLowerCase()) ? `\`${name}\`` : name;
}

/**
 * Build total aggregate for column totals.
 */
function buildTotalAggregate(
  aggregates: AggregateInfo[],
  label?: string
): string {
  const aggs = aggregates.map(a => {
    return `${a.name} is ${buildAggExpr(a.measure, a.aggregation)}`;
  });

  const nestName = label ? `"${label}"` : '"total"';
  return `  nest: total is { aggregate: ${aggs.join(', ')} }`;
}

/**
 * Print a MalloyQueryPlan for debugging.
 */
export function printMalloyQueryPlan(plan: MalloyQueryPlan): string {
  const lines: string[] = [];
  lines.push(`MalloyQueryPlan (source: ${plan.source})`);
  lines.push(`  ${plan.queries.length} queries`);
  lines.push('');

  for (const q of plan.queries) {
    lines.push(`Query ${q.id}:`);
    lines.push(q.malloy);
    lines.push('');
  }

  return lines.join('\n');
}
