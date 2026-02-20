/**
 * TPL Executor
 *
 * Executes Malloy queries against BigQuery or DuckDB (local mode) and returns results.
 *
 * Database backends are loaded lazily via dynamic imports, so consumers only need
 * to install the backend(s) they actually use:
 *   npm install @malloydata/db-duckdb    # for DuckDB support
 *   npm install @malloydata/db-bigquery  # for BigQuery support
 */

import type { DuckDBConnection } from '@malloydata/db-duckdb';
import type { BigQueryConnection } from '@malloydata/db-bigquery';
import { Runtime, URLReader, Connection } from '@malloydata/malloy';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// ---
// LAZY MODULE LOADERS
// ---

let _DuckDBModule: typeof import('@malloydata/db-duckdb') | null = null;
let _BigQueryModule: typeof import('@malloydata/db-bigquery') | null = null;

async function loadDuckDB(): Promise<typeof import('@malloydata/db-duckdb')> {
  if (!_DuckDBModule) {
    try {
      _DuckDBModule = await import('@malloydata/db-duckdb');
    } catch {
      throw new Error(
        '@malloydata/db-duckdb is required for DuckDB support. Install it with: npm install @malloydata/db-duckdb'
      );
    }
  }
  return _DuckDBModule;
}

async function loadBigQuery(): Promise<typeof import('@malloydata/db-bigquery')> {
  if (!_BigQueryModule) {
    try {
      _BigQueryModule = await import('@malloydata/db-bigquery');
    } catch {
      throw new Error(
        '@malloydata/db-bigquery is required for BigQuery support. Install it with: npm install @malloydata/db-bigquery'
      );
    }
  }
  return _BigQueryModule;
}

// ---
// CONNECTION TYPES
// ---

export type ConnectionType = 'bigquery' | 'duckdb';

export interface BigQueryConnectionOptions {
  type: 'bigquery';
  projectId?: string;
  credentialsPath?: string;
  location?: string;
}

export interface DuckDBConnectionOptions {
  type: 'duckdb';
  /** Path to DuckDB database file (default: in-memory) */
  databasePath?: string;
  /** Paths to CSV files to register as tables */
  csvPaths?: { tableName: string; filePath: string }[];
}

export type ConnectionOptions = BigQueryConnectionOptions | DuckDBConnectionOptions;

// ---
// CONNECTION SETUP
// ---

let connectionInstance: Connection | null = null;
let currentConnectionType: ConnectionType | null = null;
let pendingOptions: ConnectionOptions | null = null;

/**
 * Store connection options for deferred creation.
 * The connection will be created lazily on first getConnection() call.
 */
export function setPendingConnection(options: ConnectionOptions): void {
  pendingOptions = options;
  // Clear any existing connection so the new options take effect
  connectionInstance = null;
  currentConnectionType = null;
}

export async function createConnection(options: ConnectionOptions): Promise<Connection> {
  if (options.type === 'bigquery') {
    return createBigQueryConnection(options);
  } else {
    return createDuckDBConnection(options);
  }
}

async function createBigQueryConnection(options: BigQueryConnectionOptions): Promise<Connection> {
  const { BigQueryConnection } = await loadBigQuery();
  const credentialsPath = options.credentialsPath ?? './config/dev-credentials.json';

  // Read credentials to get project ID if not provided
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
  const projectId = options.projectId ?? credentials.project_id;

  // Set the environment variable for Google Cloud authentication
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(credentialsPath);

  const connection = new BigQueryConnection(
    'bigquery',
    {},
    { projectId, location: options.location ?? 'US' }
  );

  connectionInstance = connection;
  currentConnectionType = 'bigquery';
  return connection;
}

async function createDuckDBConnection(options: DuckDBConnectionOptions): Promise<Connection> {
  const { DuckDBConnection } = await loadDuckDB();
  const connection = new DuckDBConnection(
    'duckdb',
    options.databasePath ?? ':memory:',
    undefined,  // workingDirectory
  );

  connectionInstance = connection;
  currentConnectionType = 'duckdb';
  return connection;
}

/**
 * Create a default local DuckDB connection with test data
 */
export async function createLocalConnection(): Promise<Connection> {
  return createDuckDBConnection({
    type: 'duckdb',
  });
}

/**
 * Get the current connection or create default connection.
 *
 * Connection priority:
 * 1. If connection already exists, return it
 * 2. If pending options were set (via setPendingConnection), use those
 * 3. If TPL_BIGQUERY=true env var is set and credentials exist, use BigQuery
 * 4. Otherwise, use DuckDB (default)
 */
export async function getConnection(): Promise<Connection> {
  if (!connectionInstance) {
    // Use pending options if set
    if (pendingOptions) {
      const opts = pendingOptions;
      pendingOptions = null;
      return await createConnection(opts);
    }

    // BigQuery only if explicitly requested via env var AND credentials exist
    const useBigQuery = process.env.TPL_BIGQUERY === 'true';
    const credentialsPath = './config/dev-credentials.json';

    if (useBigQuery && fs.existsSync(credentialsPath)) {
      try {
        return await createConnection({ type: 'bigquery', credentialsPath });
      } catch (e) {
        console.log('BigQuery connection failed, falling back to DuckDB');
        return await createLocalConnection();
      }
    }

    // Default: DuckDB
    return await createLocalConnection();
  }
  return connectionInstance;
}

export function getConnectionType(): ConnectionType | null {
  // Return pending type if connection hasn't been created yet
  if (!currentConnectionType && pendingOptions) {
    return pendingOptions.type;
  }
  return currentConnectionType;
}

/**
 * Inject a pre-built Malloy connection directly.
 * Use this when you already have a configured Connection instance
 * (e.g., a BigQueryConnection with in-memory credentials).
 */
export function setConnection(conn: Connection, type: ConnectionType): void {
  connectionInstance = conn;
  currentConnectionType = type;
  pendingOptions = null;
}

// ---
// SCHEMA EXPLORATION (BigQuery only)
// ---

export async function listDatasets(): Promise<string[]> {
  const conn = await getConnection();
  if (currentConnectionType !== 'bigquery') {
    throw new Error('listDatasets only supported for BigQuery');
  }
  const result = await (conn as any).runSQL(`
    SELECT schema_name
    FROM \`region-us\`.INFORMATION_SCHEMA.SCHEMATA
    ORDER BY schema_name
  `);
  return result.rows.map((row: any) => row.schema_name);
}

export async function listTables(dataset: string): Promise<{ name: string; type: string; rows: number }[]> {
  const conn = await getConnection();
  if (currentConnectionType !== 'bigquery') {
    throw new Error('listTables only supported for BigQuery');
  }
  const result = await (conn as any).runSQL(`
    SELECT
      table_name,
      table_type,
      COALESCE(row_count, 0) as row_count
    FROM \`${dataset}.INFORMATION_SCHEMA.TABLES\`
    LEFT JOIN \`${dataset}.INFORMATION_SCHEMA.TABLE_STORAGE\`
      USING (table_catalog, table_schema, table_name)
    ORDER BY table_name
  `);
  return result.rows.map((row: any) => ({
    name: row.table_name,
    type: row.table_type,
    rows: Number(row.row_count),
  }));
}

export async function describeTable(dataset: string, table: string): Promise<{ name: string; type: string }[]> {
  const conn = await getConnection();
  if (currentConnectionType !== 'bigquery') {
    throw new Error('describeTable only supported for BigQuery');
  }
  const result = await (conn as any).runSQL(`
    SELECT column_name, data_type
    FROM \`${dataset}.INFORMATION_SCHEMA.COLUMNS\`
    WHERE table_name = '${table}'
    ORDER BY ordinal_position
  `);
  return result.rows.map((row: any) => ({
    name: row.column_name,
    type: row.data_type,
  }));
}

export async function sampleTable(dataset: string, table: string, limit: number = 10): Promise<any[]> {
  const conn = await getConnection();
  if (currentConnectionType !== 'bigquery') {
    throw new Error('sampleTable only supported for BigQuery');
  }
  const result = await (conn as any).runSQL(`
    SELECT * FROM \`${dataset}.${table}\` LIMIT ${limit}
  `);
  return result.rows;
}

// ---
// MALLOY SOURCE DEFINITIONS
// ---

/**
 * Get the default Malloy source definition for the current connection type
 */
export function getDefaultSource(): string {
  const connType = getConnectionType();

  if (connType === 'duckdb' || connType === null) {
    const csvPath = path.join(PROJECT_ROOT, 'data/test_usa_names.csv');
    return `
source: names is duckdb.table('${csvPath}') extend {
  dimension:
    population is floor(births * 37.5)
  measure:
    total_births is births.sum()
    avg_births is births.avg()
    name_count is count()
    total_population is population.sum()
}
`;
  }

  // BigQuery source
  return `
source: names is bigquery.table('slite-development.tpl_test.test_usa_names') extend {
  dimension:
    population is floor(births * 37.5)
  measure:
    total_births is births.sum()
    avg_births is births.avg()
    name_count is count()
    total_population is population.sum()
}
`;
}

// ---
// MALLOY EXECUTION
// ---

export interface ExecuteOptions {
  /** Write raw results to file */
  outputPath?: string;
  /** Return raw Malloy result object */
  raw?: boolean;
}

/**
 * Execute a Malloy query string
 */
export async function executeMalloy(
  malloySource: string,
  options: ExecuteOptions = {}
): Promise<any> {
  const conn = await getConnection();

  // Create a minimal URL reader (we're passing source directly)
  const urlReader: URLReader = {
    readURL: async (url: URL) => {
      throw new Error(`URL reading not supported: ${url}`);
    },
  };

  // Runtime takes an object with urlReader and connection
  const runtime = new Runtime({
    urlReader,
    connection: conn,
  });

  try {
    // Parse and run the Malloy query
    // Note: Malloy has a default rowLimit of 10 - we use a high limit to get all data
    const result = await runtime.loadQuery(malloySource).run({ rowLimit: 100000 });

    // Get the data
    const data = result.data.toObject();

    // Write to file if requested
    if (options.outputPath) {
      fs.writeFileSync(
        options.outputPath,
        JSON.stringify(data, null, 2),
        'utf-8'
      );
      console.log(`Results written to: ${options.outputPath}`);
    }

    return options.raw ? result : data;
  } catch (error) {
    console.error('Malloy execution error:', error);
    throw error;
  }
}

/**
 * Execute raw SQL against the current connection
 */
export async function executeSQL(sql: string): Promise<any[]> {
  const conn = await getConnection();
  const result = await (conn as any).runSQL(sql);
  return result.rows;
}

// ---
// EXPORTS
// ---

export { Runtime };
export type { Connection, DuckDBConnection, BigQueryConnection };
