/**
 * compiler package
 *
 * pipeline: TPL → AST → TableSpec → QueryPlan → Malloy → (execute) → GridSpec → HTML
 */

// types
export type {
  TableSpec,
  AxisNode,
  DimensionNode,
  AggregateNode,
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
} from './table-spec.js';

// utility functions
export {
  serializeTreePath,
  collectBranches,
  collectAggregates,
  collectDimensions,
  walkAxisTree,
  hasSiblings,
  hasTotals,
  getTreeDepth,
  printAxisTree,
} from './table-spec.js';

// tablespec builder
export {
  buildTableSpec,
  printTableSpec,
} from './table-spec-builder.js';

// query plan generator
export {
  generateQueryPlan,
  generateMalloyQueries,
  printQueryPlan,
  countRawQueries,
} from './query-plan-generator.js';
export type { MalloyQuerySpec, GenerateMalloyOptions } from './query-plan-generator.js';

// gridspec builder
export {
  buildGridSpec,
  printGridSpec,
  type QueryResults,
  type BuildGridSpecOptions,
} from './grid-spec-builder.js';

// percentile support
export {
  analyzeAndGeneratePercentileConfig,
  findPercentileAggregations,
  findDimensions,
  findPartitionLevels,
  findCollapsedDimensions,
  generatePercentileSourceSQL,
  generateMultiLevelPercentileSQL,
  generatePercentileMalloySource,
  transformTPLForPercentiles,
  postProcessMalloyForPercentiles,
  isPercentileMethod,
  PERCENTILE_METHODS,
  PERCENTILE_VALUES,
  PERCENTILE_LABELS,
  tableSource,
  sqlSource,
  type PercentileInfo,
  type PercentileConfig,
  type PartitionLevel,
  type SqlDialect,
  type SourceRef,
} from './percentile-utils.js';

// dimension utilities (for percentile partitioning and ordering)
export {
  malloyPickToSqlCase,
  parseDimensionMappings,
  detectDimensionOrdering,
  type DimensionInfo,
  type DimensionOrderingProvider,
} from './dimension-utils.js';

