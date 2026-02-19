/**
 * TPLm - Table Producing Language (Malloy-backed)
 *
 * A semantic language for describing cross-tabulated data tables.
 * Compiles to Malloy and executes against DuckDB or BigQuery.
 *
 * @example
 * ```typescript
 * import { TPL, createTPL } from 'tplm-lang';
 *
 * // Define your Malloy model (source definitions, computed dimensions)
 * const MODEL = `
 *   source: sales is duckdb.table('sales.csv') extend {
 *     dimension: region is pick 'North' when region_code=1 else 'South'
 *   }
 * `;
 *
 * const tpl = createTPL({ maxLimit: 100 });
 *
 * // compile only (get malloy output)
 * const { malloy } = tpl.compile('TABLE ROWS state * births.sum COLS year;');
 *
 * // full pipeline: parse → compile → execute → render
 * const { html } = await tpl.execute(
 *   'TABLE ROWS region[-10] * revenue.sum COLS quarter;',
 *   { model: MODEL, sourceName: 'sales' }
 * );
 * ```
 */

// parser
export { parse, parseWithErrors, formatTPL } from './parser/index.js';
export type { ParseOptions } from './parser/index.js';
export type { TPLStatement, AxisExpression, ItemExpression } from './parser/ast.js';

// compiler
export {
  buildTableSpec,
  generateQueryPlan,
  generateMalloyQueries,
  buildGridSpec,
  printTableSpec,
  printQueryPlan,
  printGridSpec,
} from './compiler/index.js';
export type {
  TableSpec,
  QueryPlan,
  GridSpec,
  HeaderNode,
  QueryResults,
  MalloyQuerySpec,
} from './compiler/index.js';

// renderer
export { renderGridToHTML } from './renderer/index.js';
export type { GridRenderOptions } from './renderer/index.js';

// executor
export {
  createConnection,
  createLocalConnection,
  getConnection,
  getConnectionType,
  getDefaultSource,
  executeMalloy,
  executeSQL,
  setPendingConnection,
} from './executor/index.js';
export type {
  ConnectionType,
  ConnectionOptions,
  BigQueryConnectionOptions,
  DuckDBConnectionOptions,
  ExecuteOptions,
} from './executor/index.js';

// --- internal imports ---

import { parse } from './parser/index.js';
import { buildTableSpec, generateQueryPlan, generateMalloyQueries, buildGridSpec } from './compiler/index.js';
import type { TableSpec, QueryPlan, GridSpec, QueryResults, MalloyQuerySpec } from './compiler/index.js';
import {
  executeMalloy,
  setPendingConnection,
} from './executor/index.js';
import { renderGridToHTML } from './renderer/index.js';
import type { DimensionOrderingProvider } from './compiler/dimension-utils.js';

/**
 * Options for creating a TPL instance
 */
export interface TPLOptions {
  /** max limit for any grouping dimension (caps explicit limits, defaults unlimited dimensions) */
  maxLimit?: number;

  /**
   * Default source name to query when TPL doesn't include FROM clause.
   * This is the name of a source defined in your Malloy model.
   * @example 'sales' (to query `source: sales is ...` from your model)
   */
  sourceName?: string;

  /** @deprecated Use `sourceName` instead */
  source?: string;
}

/**
 * Result of compiling TPL to Malloy
 */
export interface CompileResult {
  /** combined malloy query string */
  malloy: string;
  /** individual query specifications */
  queries: MalloyQuerySpec[];
  /** query plan with deduplication info */
  plan: QueryPlan;
  /** table specification (intermediate representation) */
  spec: TableSpec;
}

/**
 * Options for executing TPL
 */
export interface ExecuteTPLOptions {
  /**
   * Malloy model definition text (the .malloy file contents).
   * Contains source definitions, computed dimensions, measures, and joins.
   *
   * Note: You don't need to pre-define simple aggregates like `revenue.sum()` -
   * TPL computes those at query time. Use the model for things TPL can't do:
   * computed dimensions, joins, complex calculated measures.
   *
   * @example
   * ```malloy
   * source: sales is duckdb.table('data/sales.csv') extend {
   *   // Computed dimension - TPL references by name
   *   dimension: region is pick 'North' when region_code=1 else 'South'
   *   // Complex measure TPL can't express
   *   measure: profit_margin is (revenue.sum() - cost.sum()) / revenue.sum()
   * }
   * ```
   */
  model?: string;

  /**
   * Name of the source to query within the model.
   * This should match a source name defined in your model.
   * @example 'sales' (to generate `run: sales -> { ... }`)
   */
  sourceName?: string;

  /** @deprecated Use `model` instead */
  malloySource?: string;

  /** @deprecated Use `sourceName` instead */
  source?: string;

  /** Ordering provider for definition-order sorting */
  orderingProvider?: DimensionOrderingProvider;
}

/**
 * Result of executing TPL
 */
export interface ExecuteResult {
  /** rendered HTML table */
  html: string;
  /** grid specification for custom rendering */
  grid: GridSpec;
  /** generated malloy queries */
  malloy: string;
  /** raw query results by query ID */
  rawResults: Map<string, any[]>;
}

/**
 * High-level TPL API for parsing, compiling, executing, and rendering.
 */
export class TPL {
  private options: TPLOptions;

  constructor(options: TPLOptions = {}) {
    this.options = options;
  }

  /** parse TPL source into an AST */
  parse(tplSource: string) {
    return parse(tplSource);
  }

  /** compile TPL source to Malloy queries (no execution) */
  compile(tplSource: string, options?: { sourceName?: string; source?: string; orderingProvider?: DimensionOrderingProvider }): CompileResult {
    const ast = parse(tplSource);
    const spec = buildTableSpec(ast);

    // Source priority: FROM clause in TPL > options.sourceName > options.source (deprecated) > instance defaults > 'data'
    const sourceName =
      spec.source ??
      options?.sourceName ??
      options?.source ??
      this.options.sourceName ??
      this.options.source ??
      'data';

    const plan = generateQueryPlan(spec);
    const queries = generateMalloyQueries(plan, sourceName, {
      where: spec.where,
      firstAxis: spec.firstAxis,
      orderingProvider: options?.orderingProvider,
    });

    const malloy = queries.map(q => q.malloy).join('\n\n');

    return { malloy, queries, plan, spec };
  }

  /** execute TPL and return rendered HTML */
  async execute(tplSource: string, options: ExecuteTPLOptions): Promise<ExecuteResult> {
    // Support both new and deprecated parameter names
    const effectiveSourceName = options.sourceName ?? options.source;
    const effectiveModel = options.model ?? options.malloySource;

    if (!effectiveModel) {
      throw new Error('Either `model` or `malloySource` must be provided to execute()');
    }

    const { malloy, queries, spec, plan } = this.compile(tplSource, {
      sourceName: effectiveSourceName,
      orderingProvider: options.orderingProvider,
    });

    // execute all queries
    const rawResults: QueryResults = new Map();
    for (const queryInfo of queries) {
      const fullMalloy = `${effectiveModel}\n${queryInfo.malloy}`;
      const data = await executeMalloy(fullMalloy);
      rawResults.set(queryInfo.id, data);
    }

    // build grid and render
    const grid = buildGridSpec(spec, plan, rawResults, {
      malloyQueries: queries,
      orderingProvider: options.orderingProvider,
    });
    const html = renderGridToHTML(grid);

    return { html, grid, malloy, rawResults };
  }
}

/**
 * Create a TPL instance with DuckDB connection (simplest way to start).
 * Connection is created lazily on first execute() call.
 */
export function createTPL(options: TPLOptions = {}): TPL {
  setPendingConnection({ type: 'duckdb' });
  return new TPL(options);
}

/**
 * Create a TPL instance with BigQuery connection.
 * Connection is created lazily on first execute() call.
 */
export function createBigQueryTPL(
  options: TPLOptions & { credentialsPath?: string; projectId?: string } = {}
): TPL {
  setPendingConnection({
    type: 'bigquery',
    credentialsPath: options.credentialsPath,
    projectId: options.projectId,
  });
  return new TPL(options);
}

// ============================================================================
// EASY CONNECTORS - Skip Malloy, just query your data
// ============================================================================

// Import percentile utilities for EasyTPL
import {
  analyzeAndGeneratePercentileConfig,
  postProcessMalloyForPercentiles,
  generateMultiLevelPercentileSQL,
  type SqlDialect,
  type PercentileConfig,
  type PartitionLevel,
} from './compiler/percentile-utils.js';

/**
 * Query a DuckDB-compatible file (CSV, Parquet) directly.
 * No Malloy knowledge required - just point to your file and query.
 *
 * @example
 * ```typescript
 * const tpl = fromDuckDBTable('data/sales.parquet');
 * const { html } = await tpl.query('TABLE ROWS region * revenue.sum COLS quarter;');
 * ```
 */
export function fromDuckDBTable(
  tablePath: string,
  options: TPLOptions = {}
): EasyTPL {
  setPendingConnection({ type: 'duckdb' });
  const sourceName = 'data';
  const model = `source: ${sourceName} is duckdb.table('${tablePath}')`;
  return new EasyTPL(model, sourceName, {
    ...options,
    tablePath,
    dialect: 'duckdb',
  });
}

/**
 * Load a CSV file into DuckDB and query it directly.
 * No Malloy knowledge required - just point to your CSV.
 *
 * @example
 * ```typescript
 * const tpl = fromCSV('data/employees.csv');
 * const { html } = await tpl.query('TABLE ROWS department * salary.sum COLS gender;');
 * ```
 */
export function fromCSV(
  csvPath: string,
  options: TPLOptions = {}
): EasyTPL {
  return fromDuckDBTable(csvPath, options);
}

/**
 * Query a BigQuery table directly.
 * No Malloy knowledge required - just specify the table.
 *
 * @example
 * ```typescript
 * const tpl = fromBigQueryTable({
 *   table: 'my-project.my_dataset.sales',
 *   credentialsPath: './service-account.json'
 * });
 * const { html } = await tpl.query('TABLE ROWS region * revenue.sum COLS quarter;');
 * ```
 */
export function fromBigQueryTable(
  options: {
    table: string;
    credentialsPath?: string;
    projectId?: string;
  } & TPLOptions
): EasyTPL {
  setPendingConnection({
    type: 'bigquery',
    credentialsPath: options.credentialsPath,
    projectId: options.projectId,
  });
  const sourceName = 'data';
  const model = `source: ${sourceName} is bigquery.table('${options.table}')`;
  return new EasyTPL(model, sourceName, {
    ...options,
    tablePath: options.table,
    dialect: 'bigquery',
  });
}

/**
 * Extended options for EasyTPL that include percentile support metadata.
 */
interface EasyTPLOptions extends TPLOptions {
  /** Path to the source table (for percentile support) */
  tablePath?: string;
  /** SQL dialect (for percentile support) */
  dialect?: SqlDialect;
  /** Mapping from computed dimension names to dimension info (for percentile partitioning) */
  dimensionMap?: Map<string, DimensionInfo>;
  /** Ordering provider for definition-order sorting */
  orderingProvider?: DimensionOrderingProvider;
}

// Import dimension utilities from compiler
import {
  parseDimensionMappings,
  detectDimensionOrdering,
  type DimensionInfo,
} from './compiler/dimension-utils.js';

/**
 * Simplified TPL API for direct table queries.
 * Created by fromDuckDBTable, fromCSV, or fromBigQueryTable.
 *
 * Supports percentile aggregations (p25, p50/median, p75, p90, p95, p99)
 * by automatically generating derived SQL sources with window functions.
 */
export class EasyTPL {
  private tpl: TPL;
  private model: string;
  private sourceName: string;
  private tablePath?: string;
  private dialect?: SqlDialect;
  private dimensionMap: Map<string, DimensionInfo>;
  private orderingProvider?: DimensionOrderingProvider;

  constructor(model: string, sourceName: string, options: EasyTPLOptions = {}) {
    this.tpl = new TPL(options);
    this.model = model;
    this.sourceName = sourceName;
    this.tablePath = options.tablePath;
    this.dialect = options.dialect;
    this.dimensionMap = options.dimensionMap || new Map();
    this.orderingProvider = options.orderingProvider;
  }

  /**
   * Execute a TPL query and get HTML result.
   *
   * Automatically handles percentile aggregations (p25, p50, p75, p90, p95, p99, median)
   * by generating derived SQL sources with window functions.
   *
   * @example
   * ```typescript
   * // Regular aggregates
   * const { html } = await tpl.query('TABLE ROWS occupation * income.sum COLS education;');
   *
   * // Percentile aggregates (automatically handled)
   * const { html } = await tpl.query('TABLE ROWS occupation * income.p50 COLS education;');
   * ```
   */
  async query(tplSource: string): Promise<ExecuteResult> {
    // Check if we can handle percentiles (need tablePath and dialect)
    if (this.tablePath && this.dialect) {
      // Parse the TPL to detect percentiles
      const stmt = parse(tplSource);
      const percentileConfig = analyzeAndGeneratePercentileConfig(
        stmt,
        this.tablePath,
        this.sourceName,
        this.dialect,
        tplSource
      );

      if (percentileConfig.hasPercentiles && percentileConfig.transformedTPL) {
        // Map partition levels to use SQL expressions (CASE statements for computed dimensions)
        // This ensures percentiles are computed per computed dimension value, not per raw column value
        const mappedPartitionLevels: PartitionLevel[] = percentileConfig.partitionLevels.map(level => ({
          dimensions: level.dimensions.map(dim => {
            const info = this.dimensionMap.get(dim);
            return info ? info.sqlExpression : dim;
          }),
          suffix: level.suffix,
        }));

        // Generate multi-level percentile SQL with all partition levels
        let whereClause = '';
        if (stmt.where) {
          // Map computed dimension names to raw columns in WHERE clause
          let rawWhere = stmt.where;
          for (const [computed, info] of this.dimensionMap) {
            rawWhere = rawWhere.replace(new RegExp(`\\b${computed}\\b`, 'gi'), info.rawColumn);
          }
          whereClause = rawWhere;
        }

        const derivedSQL = generateMultiLevelPercentileSQL(
          this.tablePath,
          percentileConfig.percentiles,
          mappedPartitionLevels,
          this.dialect,
          whereClause || undefined
        );

        // Generate Malloy source with derived SQL
        const connectionPrefix = this.dialect === 'bigquery' ? 'bigquery' : 'duckdb';
        let derivedMalloySource = `source: ${this.sourceName} is ${connectionPrefix}.sql("""${derivedSQL}""")`;

        // If we have an extended model, extract the extend block and append it
        const extendMatch = this.model.match(/extend\s*\{([\s\S]*)\}$/);
        if (extendMatch) {
          derivedMalloySource += ` extend {${extendMatch[1]}}`;
        }

        // For queries with ALL patterns, we need to manually handle the pipeline
        // to post-process the Malloy with correct partition columns
        if (percentileConfig.hasAllPatterns) {
          // Compile the transformed TPL
          const effectiveAst = parse(percentileConfig.transformedTPL);
          const spec = buildTableSpec(effectiveAst);
          const plan = generateQueryPlan(spec);
          const malloyQueries = generateMalloyQueries(plan, this.sourceName, {
            where: spec.where,
            firstAxis: spec.firstAxis,
            orderingProvider: this.orderingProvider,
          });

          // Post-process each Malloy query and execute
          const rawResults: QueryResults = new Map();
          for (const queryInfo of malloyQueries) {
            // Determine outer dimensions from the query's row groupings
            // (these are the dimensions at the outer level of the Malloy query)
            const outerDimensions = (queryInfo.rowGroupings || []).map(g => g.dimension);

            // Post-process Malloy to use correct partition column for outer aggregates
            let processedMalloy = queryInfo.malloy;
            if (percentileConfig.partitionLevels.length > 1) {
              processedMalloy = postProcessMalloyForPercentiles(
                queryInfo.malloy,
                percentileConfig.percentiles,
                percentileConfig.partitionLevels,
                outerDimensions
              );
            }

            // Execute the processed query
            const fullMalloy = `${derivedMalloySource}\n${processedMalloy}`;
            const data = await executeMalloy(fullMalloy);
            rawResults.set(queryInfo.id, data);
          }

          // Build grid and render
          const grid = buildGridSpec(spec, plan, rawResults, {
            malloyQueries,
            orderingProvider: this.orderingProvider,
          });
          const html = renderGridToHTML(grid);

          return {
            html,
            grid,
            malloy: malloyQueries.map(q => q.malloy).join('\n\n'),
            rawResults,
          };
        }

        // No ALL patterns - use standard execute path
        return this.tpl.execute(percentileConfig.transformedTPL, {
          model: derivedMalloySource,
          sourceName: this.sourceName,
          orderingProvider: this.orderingProvider,
        });
      }
    }

    // No percentiles or can't handle them - use standard path
    return this.tpl.execute(tplSource, {
      model: this.model,
      sourceName: this.sourceName,
      orderingProvider: this.orderingProvider,
    });
  }

  /**
   * Add computed dimensions or complex measures to the model.
   * Returns a new EasyTPL with the extended model.
   *
   * Percentile support: When extending with computed dimensions, the system
   * automatically extracts dimension→column mappings for common patterns:
   * - Simple alias: `dimension: foo is bar` (foo maps to bar)
   * - Pick expression: `dimension: foo is pick 'X' when bar = 1...` (foo maps to bar)
   *
   * These mappings are used for PARTITION BY in percentile window functions.
   *
   * @example
   * ```typescript
   * const tpl = fromCSV('employees.csv').extend(`
   *   dimension:
   *     department is pick 'Engineering' when dept_code = 1 else 'Other'
   * `);
   * // Now 'department' is mapped to 'dept_code' for percentile partitioning
   * await tpl.query('TABLE ROWS department * salary.p50;');
   * ```
   */
  extend(malloyExtend: string): EasyTPL {
    // Remove the closing source and add extend block
    const extendedModel = this.model.replace(
      /^(source: \w+ is [^)]+\))$/,
      `$1 extend {\n${malloyExtend}\n}`
    );

    // If no match (already has extend), append to existing extend block
    const finalModel = extendedModel === this.model
      ? this.model.replace(/}$/, `\n${malloyExtend}\n}`)
      : extendedModel;

    // Parse the extend text to extract dimension→column mappings
    const newMappings = parseDimensionMappings(malloyExtend);

    // Merge with existing mappings (new mappings take precedence)
    const mergedMap = new Map(this.dimensionMap);
    for (const [dim, col] of newMappings) {
      mergedMap.set(dim, col);
    }

    // Detect ordering dimensions from the full model
    // Extract the extend block from finalModel for detection
    const extendMatch = finalModel.match(/extend\s*\{([\s\S]*)\}\s*$/);
    const fullExtendBlock = extendMatch ? extendMatch[1] : malloyExtend;
    const orderingProvider = detectDimensionOrdering(fullExtendBlock);

    // Inject auto-generated order dimensions for true definition order
    // Must be in a dimension: block, inserted before any measure: blocks
    const autoDims = orderingProvider.getAutoOrderDimensions();
    let modelWithAutoDims = finalModel;
    if (autoDims.length > 0) {
      const autoDimsText = '\n  // Auto-generated for definition-order sorting\n  dimension:\n    ' + autoDims.join('\n    ');
      // Insert before the first measure: block, or at the end if no measures
      const measureMatch = finalModel.match(/(\n\s*measure:)/);
      if (measureMatch && measureMatch.index !== undefined) {
        modelWithAutoDims = finalModel.slice(0, measureMatch.index) + autoDimsText + finalModel.slice(measureMatch.index);
      } else {
        modelWithAutoDims = finalModel.replace(/}\s*$/, `${autoDimsText}\n}`);
      }
    }

    return new EasyTPL(modelWithAutoDims, this.sourceName, {
      tablePath: this.tablePath,
      dialect: this.dialect,
      dimensionMap: mergedMap,
      orderingProvider,
    });
  }

  /** Get the underlying Malloy model */
  getModel(): string {
    return this.model;
  }

  /** Get the table path (if available) */
  getTablePath(): string | undefined {
    return this.tablePath;
  }

  /** Get the SQL dialect (if available) */
  getDialect(): SqlDialect | undefined {
    return this.dialect;
  }

  /** Get the dimension info map (for percentile partitioning) */
  getDimensionMap(): Map<string, DimensionInfo> {
    return new Map(this.dimensionMap);
  }

  /** Get dimension→raw column mapping (for backward compatibility) */
  getDimensionToColumnMap(): Map<string, string> {
    const result = new Map<string, string>();
    for (const [dim, info] of this.dimensionMap) {
      result.set(dim, info.rawColumn);
    }
    return result;
  }
}
