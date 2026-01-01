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
  createConnection,
  createLocalConnection,
} from './executor/index.js';
import { renderGridToHTML } from './renderer/index.js';

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
  compile(tplSource: string, options?: { sourceName?: string; source?: string }): CompileResult {
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

    const { malloy, queries, spec, plan } = this.compile(tplSource, { sourceName: effectiveSourceName });

    // execute all queries
    const rawResults: QueryResults = new Map();
    for (const queryInfo of queries) {
      const fullMalloy = `${effectiveModel}\n${queryInfo.malloy}`;
      const data = await executeMalloy(fullMalloy);
      rawResults.set(queryInfo.id, data);
    }

    // build grid and render
    const grid = buildGridSpec(spec, plan, rawResults, queries);
    const html = renderGridToHTML(grid);

    return { html, grid, malloy, rawResults };
  }
}

/**
 * Create a TPL instance with DuckDB connection (simplest way to start).
 */
export function createTPL(options: TPLOptions = {}): TPL {
  createLocalConnection();
  return new TPL(options);
}

/**
 * Create a TPL instance with BigQuery connection.
 */
export function createBigQueryTPL(
  options: TPLOptions & { credentialsPath?: string; projectId?: string } = {}
): TPL {
  createConnection({
    type: 'bigquery',
    credentialsPath: options.credentialsPath,
    projectId: options.projectId,
  });
  return new TPL(options);
}

// ============================================================================
// EASY CONNECTORS - Skip Malloy, just query your data
// ============================================================================

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
  createLocalConnection();
  const sourceName = 'data';
  const model = `source: ${sourceName} is duckdb.table('${tablePath}')`;
  return new EasyTPL(model, sourceName, options);
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
  createConnection({
    type: 'bigquery',
    credentialsPath: options.credentialsPath,
    projectId: options.projectId,
  });
  const sourceName = 'data';
  const model = `source: ${sourceName} is bigquery.table('${options.table}')`;
  return new EasyTPL(model, sourceName, options);
}

/**
 * Simplified TPL API for direct table queries.
 * Created by fromDuckDBTable, fromCSV, or fromBigQueryTable.
 */
export class EasyTPL {
  private tpl: TPL;
  private model: string;
  private sourceName: string;

  constructor(model: string, sourceName: string, options: TPLOptions = {}) {
    this.tpl = new TPL(options);
    this.model = model;
    this.sourceName = sourceName;
  }

  /**
   * Execute a TPL query and get HTML result.
   * @example
   * ```typescript
   * const { html } = await tpl.query('TABLE ROWS occupation * income.sum COLS education;');
   * ```
   */
  async query(tplSource: string): Promise<ExecuteResult> {
    return this.tpl.execute(tplSource, {
      model: this.model,
      sourceName: this.sourceName,
    });
  }

  /**
   * Add computed dimensions or complex measures to the model.
   * Returns a new EasyTPL with the extended model.
   *
   * @example
   * ```typescript
   * const tpl = fromCSV('employees.csv').extend(`
   *   dimension:
   *     department is pick 'Engineering' when dept_code = 1 else 'Other'
   * `);
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

    return new EasyTPL(finalModel, this.sourceName, {});
  }

  /** Get the underlying Malloy model */
  getModel(): string {
    return this.model;
  }
}
