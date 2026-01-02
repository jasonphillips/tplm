/**
 * TPLm Executor for documentation site (browser-only)
 * Based on playground-web implementation
 */

// Import TPL packages using Vite aliases
import { parse } from '@tpl/parser'
import { buildTableSpec, generateQueryPlan, generateMalloyQueries, buildGridSpec } from '@tpl/compiler'
import { renderGridToHTML } from '@tpl/renderer'

interface ExecuteResult {
  success: boolean
  html?: string
  malloy?: string
  data?: any
  structure?: any
  parseTime?: number
  compileTime?: number
  executeTime?: number
  renderTime?: number
  error?: string
}

class TPLExecutor {
  private connection: any = null
  private runtime: any = null
  private malloySource: string = ''
  private isInitialized: boolean = false
  private initPromise: Promise<void> | null = null
  private executeQueue: Promise<any> = Promise.resolve()

  async initialize() {
    // If already initialized, return immediately
    if (this.isInitialized) {
      return
    }

    // If initialization is in progress, wait for it
    if (this.initPromise) {
      return this.initPromise
    }

    // Start initialization and store the promise to prevent race conditions
    this.initPromise = this.doInitialize()
    return this.initPromise
  }

  private async doInitialize() {
    try {
      // Import DuckDB WASM connection
      const { DuckDBWASMConnection } = await import('./duckdb-wasm-connection')

      // Create connection instance
      this.connection = new DuckDBWASMConnection()

      // Load sample dataset
      await this.loadSampleDataset()

      // Initialize Malloy runtime
      await this.initializeMalloy()

      this.isInitialized = true
    } catch (err) {
      this.initPromise = null // Reset so we can retry
      console.error('Failed to initialize TPL executor:', err)
      throw new Error(`Initialization failed: ${err}`)
    }
  }

  private async initializeMalloy() {
    const { Runtime } = await import('@malloydata/malloy')

    // Create the Runtime with our connection (same pattern as playground-web)
    this.runtime = new Runtime({
      urlReader: {
        readURL: async (url: URL) => {
          throw new Error(`URL reading not supported: ${url}`)
        },
      },
      connection: this.connection,
    })
  }

  private async loadSampleDataset() {
    if (!this.connection) {
      throw new Error('Connection not initialized')
    }

    // Load CSV data
    const csvUrl = '/tplm/data/samples.csv'
    await this.connection.registerCSV('samples', csvUrl)

    // Load Malloy source template
    const response = await fetch('/tplm/data/samples.malloy')
    if (!response.ok) {
      throw new Error('Failed to load samples.malloy')
    }
    const template = await response.text()

    // Set up Malloy source (replacing placeholder with table name)
    this.malloySource = template.replace('{TABLE_PATH}', 'samples')
  }

  async execute(tplQuery: string, sourceName: string = 'samples'): Promise<ExecuteResult> {
    // Queue execution to prevent concurrent access to DuckDB/Malloy
    const result = this.executeQueue.then(() => this.doExecute(tplQuery, sourceName))
    this.executeQueue = result.catch(() => {}) // Keep queue going even on errors
    return result
  }

  private async doExecute(tplQuery: string, sourceName: string): Promise<ExecuteResult> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    let parseTime = 0
    let compileTime = 0
    let executeTime = 0
    let renderTime = 0

    try {
      // Parse
      const parseStart = performance.now()
      const ast = parse(tplQuery)
      parseTime = Math.round(performance.now() - parseStart)

      // Compile
      const compileStart = performance.now()
      const tableSpec = buildTableSpec(ast)
      const queryPlan = generateQueryPlan(tableSpec)
      const malloyQueries = generateMalloyQueries(queryPlan, sourceName, {
        where: tableSpec.where,
        firstAxis: tableSpec.firstAxis,
      })
      compileTime = Math.round(performance.now() - compileStart)

      // Execute queries
      const executeStart = performance.now()
      const queryResults = new Map<string, any[]>()

      for (const queryInfo of malloyQueries) {
        const fullMalloy = `${this.malloySource}\n${queryInfo.malloy}`
        const queryResult = await this.runtime.loadQuery(fullMalloy).run({ rowLimit: 100000 })
        const data = queryResult.data.toObject()
        queryResults.set(queryInfo.id, data)
      }
      executeTime = Math.round(performance.now() - executeStart)

      // Render
      const renderStart = performance.now()
      const gridSpec = buildGridSpec(tableSpec, queryPlan, queryResults, malloyQueries)
      const html = renderGridToHTML(gridSpec)
      renderTime = Math.round(performance.now() - renderStart)

      return {
        success: true,
        html,
        malloy: malloyQueries.map((q: any) => q.malloy).join('\n\n// ---\n\n'),
        data: Array.from(queryResults.entries()).map(([id, data]) => ({ id, data })),
        structure: {
          rowAxis: tableSpec.rowAxis,
          colAxis: tableSpec.colAxis,
          aggregates: tableSpec.aggregates
        },
        parseTime,
        compileTime,
        executeTime,
        renderTime
      }
    } catch (err: any) {
      return {
        success: false,
        error: err.message || String(err)
      }
    }
  }

  isReady(): boolean {
    return this.isInitialized
  }
}

// Singleton instance
let executorInstance: TPLExecutor | null = null

export function getExecutor(): TPLExecutor {
  if (!executorInstance) {
    executorInstance = new TPLExecutor()
  }
  return executorInstance
}
