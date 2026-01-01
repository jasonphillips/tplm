/**
 * DuckDB-WASM Connection for Malloy
 *
 * Implements Malloy's Connection interface using DuckDB-WASM for browser execution.
 */

import * as duckdb from '@duckdb/duckdb-wasm';

// Types from Malloy
interface MalloyQueryData {
  rows: Record<string, unknown>[];
  totalRows: number;
}

interface TableSourceDef {
  type: 'table';
  name: string;
  dialect: string;
  tablePath: string;
  connection: string;
  fields: FieldDef[];
}

interface SQLSourceDef {
  type: 'sql_select';
  name: string;
  dialect: string;
  connection: string;
  fields: FieldDef[];
  selectStr: string;
}

interface FieldDef {
  type: string;
  name: string;
  [key: string]: unknown;
}

interface SQLSourceRequest {
  name: string;
  selectStr: string;
}

interface FetchSchemaOptions {
  refreshTimestamp?: number;
}

interface RunSQLOptions {
  rowLimit?: number;
  abortSignal?: AbortSignal;
}

interface QueryRunStats {
  queryCostBytes?: number;
}

interface ConnectionMetadata {
  url?: string;
}

interface TableMetadata {
  url?: string;
}

// DuckDB to Malloy type mapping
const DUCKDB_TYPE_MAP: Record<string, string> = {
  'INTEGER': 'number',
  'BIGINT': 'number',
  'DOUBLE': 'number',
  'FLOAT': 'number',
  'DECIMAL': 'number',
  'REAL': 'number',
  'SMALLINT': 'number',
  'TINYINT': 'number',
  'HUGEINT': 'number',
  'VARCHAR': 'string',
  'CHAR': 'string',
  'TEXT': 'string',
  'STRING': 'string',
  'BOOLEAN': 'boolean',
  'DATE': 'date',
  'TIME': 'timestamp',
  'TIMESTAMP': 'timestamp',
  'TIMESTAMP WITH TIME ZONE': 'timestamp',
  'INTERVAL': 'string',
  'BLOB': 'string',
  'UUID': 'string',
};

function duckDBTypeToMalloy(duckType: string): string {
  const normalized = duckType.toUpperCase().replace(/\(.*\)/, '').trim();
  return DUCKDB_TYPE_MAP[normalized] || 'string';
}

export class DuckDBWASMConnection {
  readonly name: string = 'duckdb';
  readonly dialectName: string = 'duckdb';

  private db: duckdb.AsyncDuckDB | null = null;
  private conn: duckdb.AsyncDuckDBConnection | null = null;
  private initPromise: Promise<void> | null = null;
  private registeredTables: Map<string, string> = new Map();

  constructor() {
    this.initPromise = this.init();
  }

  private async init(): Promise<void> {
    // Use jsdelivr CDN for the bundles (reliable for browser usage)
    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();

    // Select the best bundle based on browser capabilities
    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

    const worker_url = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
    );

    const worker = new Worker(worker_url);
    const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
    this.db = new duckdb.AsyncDuckDB(logger, worker);
    await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(worker_url);
    this.conn = await this.db.connect();
  }

  private async ensureReady(): Promise<duckdb.AsyncDuckDBConnection> {
    if (this.initPromise) {
      await this.initPromise;
      this.initPromise = null;
    }
    if (!this.conn) {
      throw new Error('DuckDB connection not initialized');
    }
    return this.conn;
  }

  /**
   * Register a CSV file from a URL
   */
  async registerCSV(tableName: string, url: string): Promise<void> {
    const conn = await this.ensureReady();

    // Fetch the CSV content
    const response = await fetch(url);
    const csvText = await response.text();

    // Create a file in DuckDB's virtual filesystem
    const fileName = `${tableName}.csv`;
    await this.db!.registerFileText(fileName, csvText);

    // Create a table from the CSV file
    await conn.query(`
      CREATE OR REPLACE TABLE ${tableName} AS
      SELECT * FROM read_csv_auto('${fileName}')
    `);

    this.registeredTables.set(tableName, url);
  }

  /**
   * Convert Arrow value to plain JavaScript value
   */
  private convertArrowValue(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    // Handle BigInt (DuckDB returns BIGINT as BigInt)
    if (typeof value === 'bigint') {
      return Number(value);
    }

    // Handle Arrow arrays (nested query results)
    if (Array.isArray(value)) {
      return value.map(item => this.convertArrowValue(item));
    }

    // Handle Arrow structs/objects (nested records)
    if (typeof value === 'object' && value !== null) {
      // Check if it's a proxy object from Arrow (has toJSON or similar)
      if (typeof (value as any).toJSON === 'function') {
        return this.convertArrowValue((value as any).toJSON());
      }

      // Convert object properties recursively
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(value)) {
        result[key] = this.convertArrowValue((value as any)[key]);
      }
      return result;
    }

    // Handle strings that might be JSON-encoded values
    if (typeof value === 'string') {
      // Check if it's a quoted number string like "\"12345\""
      if (value.startsWith('"') && value.endsWith('"')) {
        try {
          const parsed = JSON.parse(value);
          // If parsing gives us a number string, convert it
          if (typeof parsed === 'string' && /^-?\d+(\.\d+)?$/.test(parsed)) {
            return parseFloat(parsed);
          }
          return parsed;
        } catch {
          // Not valid JSON, return as-is
        }
      }
      return value;
    }

    return value;
  }

  /**
   * Execute SQL and return results
   */
  async runSQL(sql: string, options?: RunSQLOptions): Promise<MalloyQueryData> {
    const conn = await this.ensureReady();

    try {
      const result = await conn.query(sql);
      const rows: Record<string, unknown>[] = result.toArray().map((row: any) => {
        const obj: Record<string, unknown> = {};
        for (const key of Object.keys(row)) {
          obj[key] = this.convertArrowValue(row[key]);
        }
        return obj;
      });

      // Apply row limit if specified
      const limitedRows = options?.rowLimit
        ? rows.slice(0, options.rowLimit)
        : rows;

      return {
        rows: limitedRows,
        totalRows: rows.length,
      };
    } catch (error) {
      console.error('SQL execution error:', error);
      throw error;
    }
  }

  /**
   * Fetch schema for a table
   */
  async fetchTableSchema(tableName: string, tablePath: string): Promise<TableSourceDef | string> {
    const conn = await this.ensureReady();

    try {
      // Get column info using DESCRIBE
      const result = await conn.query(`DESCRIBE ${tablePath}`);
      const rows = result.toArray();

      const fields: FieldDef[] = rows.map((row: any) => ({
        type: duckDBTypeToMalloy(row.column_type),
        name: row.column_name,
      }));

      return {
        type: 'table',
        name: tableName,
        dialect: 'duckdb',
        tablePath,
        connection: this.name,
        fields,
      };
    } catch (error) {
      return `Failed to fetch schema for ${tablePath}: ${error}`;
    }
  }

  /**
   * Fetch schema for a SQL select statement
   */
  async fetchSelectSchema(sqlSource: SQLSourceRequest): Promise<SQLSourceDef | string> {
    const conn = await this.ensureReady();

    try {
      // Create a temporary view to get the schema
      const tempViewName = `_temp_schema_${Date.now()}`;
      await conn.query(`CREATE TEMPORARY VIEW ${tempViewName} AS ${sqlSource.selectStr} LIMIT 0`);

      const result = await conn.query(`DESCRIBE ${tempViewName}`);
      const rows = result.toArray();

      const fields: FieldDef[] = rows.map((row: any) => ({
        type: duckDBTypeToMalloy(row.column_type),
        name: row.column_name,
      }));

      // Clean up
      await conn.query(`DROP VIEW IF EXISTS ${tempViewName}`);

      return {
        type: 'sql_select',
        name: sqlSource.name,
        dialect: 'duckdb',
        connection: this.name,
        fields,
        selectStr: sqlSource.selectStr,
      };
    } catch (error) {
      return `Failed to fetch schema for SQL: ${error}`;
    }
  }

  async fetchSchemaForTables(
    tables: Record<string, string>,
    options: FetchSchemaOptions
  ): Promise<{ schemas: Record<string, TableSourceDef>; errors: Record<string, string> }> {
    const schemas: Record<string, TableSourceDef> = {};
    const errors: Record<string, string> = {};

    for (const [key, tablePath] of Object.entries(tables)) {
      const result = await this.fetchTableSchema(key, tablePath);
      if (typeof result === 'string') {
        errors[key] = result;
      } else {
        schemas[key] = result;
      }
    }

    return { schemas, errors };
  }

  async fetchSchemaForSQLStruct(
    sqlRef: SQLSourceRequest,
    options: FetchSchemaOptions
  ): Promise<{ structDef: SQLSourceDef; error?: undefined } | { error: string; structDef?: undefined }> {
    const result = await this.fetchSelectSchema(sqlRef);
    if (typeof result === 'string') {
      return { error: result };
    }
    return { structDef: result };
  }

  isPool(): boolean {
    return false;
  }

  canPersist(): boolean {
    return false;
  }

  canStream(): boolean {
    return false;
  }

  async close(): Promise<void> {
    if (this.conn) {
      await this.conn.close();
      this.conn = null;
    }
    if (this.db) {
      await this.db.terminate();
      this.db = null;
    }
  }

  async estimateQueryCost(sqlCommand: string): Promise<QueryRunStats> {
    return {};
  }

  async fetchMetadata(): Promise<ConnectionMetadata> {
    return {};
  }

  async fetchTableMetadata(tablePath: string): Promise<TableMetadata> {
    return {};
  }
}
