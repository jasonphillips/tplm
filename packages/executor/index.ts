/**
 * TPL Executor
 *
 * Executes Malloy queries against BigQuery or DuckDB (local mode) and returns results.
 */

import { BigQueryConnection } from '@malloydata/db-bigquery';
import { DuckDBConnection } from '@malloydata/db-duckdb';
import { Runtime, URLReader, Connection } from '@malloydata/malloy';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

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

export function createConnection(options: ConnectionOptions): Connection {
  if (options.type === 'bigquery') {
    return createBigQueryConnection(options);
  } else {
    return createDuckDBConnection(options);
  }
}

function createBigQueryConnection(options: BigQueryConnectionOptions): BigQueryConnection {
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

function createDuckDBConnection(options: DuckDBConnectionOptions): DuckDBConnection {
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
export function createLocalConnection(): DuckDBConnection {
  return createDuckDBConnection({
    type: 'duckdb',
  }) as DuckDBConnection;
}

/**
 * Get the current connection or create default connection.
 *
 * Connection priority:
 * 1. If connection already exists, return it
 * 2. If TPL_BIGQUERY=true env var is set and credentials exist, use BigQuery
 * 3. Otherwise, use DuckDB (default)
 */
export function getConnection(): Connection {
  if (!connectionInstance) {
    // BigQuery only if explicitly requested via env var AND credentials exist
    const useBigQuery = process.env.TPL_BIGQUERY === 'true';
    const credentialsPath = './config/dev-credentials.json';

    if (useBigQuery && fs.existsSync(credentialsPath)) {
      try {
        return createConnection({ type: 'bigquery', credentialsPath });
      } catch (e) {
        console.log('BigQuery connection failed, falling back to DuckDB');
        return createLocalConnection();
      }
    }

    // Default: DuckDB
    return createLocalConnection();
  }
  return connectionInstance;
}

export function getConnectionType(): ConnectionType | null {
  return currentConnectionType;
}

// ---
// SCHEMA EXPLORATION (BigQuery only)
// ---

export async function listDatasets(): Promise<string[]> {
  const conn = getConnection();
  if (!(conn instanceof BigQueryConnection)) {
    throw new Error('listDatasets only supported for BigQuery');
  }
  const result = await conn.runSQL(`
    SELECT schema_name
    FROM \`region-us\`.INFORMATION_SCHEMA.SCHEMATA
    ORDER BY schema_name
  `);
  return result.rows.map((row: any) => row.schema_name);
}

export async function listTables(dataset: string): Promise<{ name: string; type: string; rows: number }[]> {
  const conn = getConnection();
  if (!(conn instanceof BigQueryConnection)) {
    throw new Error('listTables only supported for BigQuery');
  }
  const result = await conn.runSQL(`
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
  const conn = getConnection();
  if (!(conn instanceof BigQueryConnection)) {
    throw new Error('describeTable only supported for BigQuery');
  }
  const result = await conn.runSQL(`
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
  const conn = getConnection();
  if (!(conn instanceof BigQueryConnection)) {
    throw new Error('sampleTable only supported for BigQuery');
  }
  const result = await conn.runSQL(`
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

  if (connType === 'duckdb') {
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
  const conn = getConnection();

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
  const conn = getConnection();
  if (conn instanceof BigQueryConnection) {
    const result = await conn.runSQL(sql);
    return result.rows;
  } else if (conn instanceof DuckDBConnection) {
    const result = await conn.runSQL(sql);
    return result.rows;
  }
  throw new Error('Unknown connection type');
}

// ---
// EXPORTS
// ---

export { BigQueryConnection, DuckDBConnection, Runtime };
