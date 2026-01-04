/**
 * TPLm Executor for documentation site (browser-only)
 * Based on playground-web implementation
 *
 * Uses samples.malloy directly with parseDimensionMappings for percentile support.
 */

// Import TPL packages using Vite aliases
import { parse } from '@tpl/parser'
import {
  buildTableSpec,
  generateQueryPlan,
  generateMalloyQueries,
  buildGridSpec,
  analyzeAndGeneratePercentileConfig,
  postProcessMalloyForPercentiles,
  parseDimensionMappings,
  detectDimensionOrdering,
  type PartitionLevel,
  type DimensionInfo,
  type DimensionOrderingProvider,
} from '@tpl/compiler'
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
  private malloySource: string = ''  // The full Malloy source from samples.malloy
  private dimensionMap: Map<string, DimensionInfo> = new Map()  // For percentile partitioning
  private orderingProvider: DimensionOrderingProvider | null = null  // For definition-order sorting
  private isInitialized: boolean = false
  private initPromise: Promise<void> | null = null
  private executeQueue: Promise<any> = Promise.resolve()
  private executorId: string = Math.random().toString(36).substring(7)  // Debug: unique ID

  constructor() {
    console.log('[TPL] Created executor instance:', this.executorId)
  }

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

    // Load Malloy source directly from samples.malloy
    const response = await fetch('/tplm/data/samples.malloy')
    if (!response.ok) {
      throw new Error('Failed to load samples.malloy')
    }
    const malloyContent = await response.text()

    // Replace the placeholder table path with the actual registered table
    this.malloySource = malloyContent.replace('{TABLE_PATH}', 'samples')

    // Parse dimension mappings for percentile partitioning
    this.dimensionMap = parseDimensionMappings(malloyContent)

    // Detect ordering dimensions for definition-order sorting
    this.orderingProvider = detectDimensionOrdering(malloyContent)

    console.log('[TPL] Loaded Malloy source with', this.dimensionMap.size, 'dimension mappings')
  }

  /**
   * Get the effective extend block with auto-generated order dimensions injected.
   * This ensures true definition order (pick statement order) works correctly.
   */
  private getEffectiveExtendBlock(): string {
    const extendMatch = this.malloySource.match(/extend\s*\{([\s\S]*)\}\s*$/)
    let extendBlock = extendMatch ? extendMatch[1] : ''

    // Inject auto-generated order dimensions for true definition order
    // Must be in a dimension: block, inserted before any measure: blocks
    if (this.orderingProvider) {
      const autoDims = this.orderingProvider.getAutoOrderDimensions()
      if (autoDims.length > 0) {
        const autoDimsText = '\n  // Auto-generated for definition-order sorting\n  dimension:\n    ' + autoDims.join('\n    ')
        // Insert before the first measure: block, or at the end if no measures
        const measureMatch = extendBlock.match(/(\n\s*measure:)/)
        if (measureMatch && measureMatch.index !== undefined) {
          extendBlock = extendBlock.slice(0, measureMatch.index) + autoDimsText + extendBlock.slice(measureMatch.index)
        } else {
          extendBlock = extendBlock.trim() + autoDimsText
        }
      }
    }

    return extendBlock
  }

  /**
   * Generate Malloy source from a derived SQL (for percentile support)
   */
  private generateMalloySourceFromSQL(derivedSQL: string): string {
    const extendBlock = this.getEffectiveExtendBlock()
    return `source: samples is duckdb.sql("""${derivedSQL}""") extend {${extendBlock}}`
  }

  /**
   * Get the effective Malloy source with auto-generated order dimensions injected.
   */
  private getEffectiveMalloySource(): string {
    const extendBlock = this.getEffectiveExtendBlock()
    // Extract the source declaration part (before extend block)
    const sourceMatch = this.malloySource.match(/^(source:\s*\w+\s+is\s+[^\{]+)extend/)
    const sourceDecl = sourceMatch ? sourceMatch[1] : "source: samples is duckdb.table('samples') "
    return `${sourceDecl}extend {${extendBlock}}`
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

    const autoDims = this.orderingProvider?.getAutoOrderDimensions() ?? []
    console.log('[TPL] Executor', this.executorId, '- Executing query with', autoDims.length, 'auto-generated order dimensions')

    let parseTime = 0
    let compileTime = 0
    let executeTime = 0
    let renderTime = 0

    try {
      // Parse
      const parseStart = performance.now()
      const ast = parse(tplQuery)
      parseTime = Math.round(performance.now() - parseStart)

      // Check for percentile aggregations
      const percentileConfig = analyzeAndGeneratePercentileConfig(
        ast,
        'samples',  // Table name registered in DuckDB
        sourceName,
        'duckdb',
        tplQuery
      )

      // Determine which TPL query and Malloy source to use
      let effectiveTPL = tplQuery
      let effectiveMalloySource = this.getEffectiveMalloySource()

      if (percentileConfig.hasPercentiles) {
        // Use transformed TPL that references the pre-computed columns
        effectiveTPL = percentileConfig.transformedTPL!

        // Map partition levels to use SQL expressions from dimension map
        // This is critical: we need to partition by computed dimension values, not raw columns
        // e.g., partition by CASE expressions for 'education' so that all 'College' rows get the same p95
        const mappedPartitionLevels: PartitionLevel[] = percentileConfig.partitionLevels.map(level => ({
          dimensions: level.dimensions.map(dim => {
            const info = this.dimensionMap.get(dim)
            return info ? info.sqlExpression : dim  // Fallback to raw name if not in map
          }),
          suffix: level.suffix,
        }))

        // Generate multi-level percentile SQL with all partition levels
        const windowFunctions: string[] = []
        for (const level of mappedPartitionLevels) {
          for (const p of percentileConfig.percentiles) {
            const columnName = `${p.computedColumnName}${level.suffix}`
            const partitionClause = level.dimensions.length > 0
              ? `PARTITION BY ${level.dimensions.join(', ')}`
              : ''
            windowFunctions.push(`quantile_cont(${p.measure}, ${p.quantile}) OVER (${partitionClause}) as ${columnName}`)
          }
        }

        // Extract WHERE clause from the AST and include in derived SQL
        // This ensures percentiles are computed over the filtered data
        let whereClause = ''
        if (ast.where) {
          // Map computed dimension names to raw columns in WHERE clause
          let rawWhere = ast.where
          for (const [dimName, info] of this.dimensionMap) {
            rawWhere = rawWhere.replace(new RegExp(`\\b${dimName}\\b`, 'gi'), info.rawColumn)
          }
          // Convert Malloy-style IS NOT NULL to SQL-style
          rawWhere = rawWhere.replace(/\bIS NOT NULL\b/gi, 'IS NOT NULL')
          rawWhere = rawWhere.replace(/\bIS NULL\b/gi, 'IS NULL')
          whereClause = ` WHERE ${rawWhere}`
        }

        const derivedSQL = `SELECT *, ${windowFunctions.join(', ')} FROM samples${whereClause}`
        console.log('[TPL] Generated derived SQL:', derivedSQL.substring(0, 200) + '...')

        effectiveMalloySource = this.generateMalloySourceFromSQL(derivedSQL)
      }

      // Re-parse the (possibly transformed) TPL
      const effectiveAst = percentileConfig.hasPercentiles ? parse(effectiveTPL) : ast

      // Compile
      const compileStart = performance.now()
      const tableSpec = buildTableSpec(effectiveAst)
      const queryPlan = generateQueryPlan(tableSpec)
      const malloyQueries = generateMalloyQueries(queryPlan, sourceName, {
        where: tableSpec.where,
        firstAxis: tableSpec.firstAxis,
        orderingProvider: this.orderingProvider ?? undefined,
      })
      compileTime = Math.round(performance.now() - compileStart)

      // Execute queries
      const executeStart = performance.now()
      const queryResults = new Map<string, any[]>()

      for (const queryInfo of malloyQueries) {
        // Post-process Malloy for ALL patterns if needed
        let processedMalloy = queryInfo.malloy
        if (percentileConfig.hasPercentiles && percentileConfig.hasAllPatterns) {
          const outerDimensions = (queryInfo.rowGroupings || []).map((g: any) => g.dimension)
          processedMalloy = postProcessMalloyForPercentiles(
            queryInfo.malloy,
            percentileConfig.percentiles,
            percentileConfig.partitionLevels,
            outerDimensions
          )
        }

        const fullMalloy = `${effectiveMalloySource}\n${processedMalloy}`
        const queryResult = await this.runtime.loadQuery(fullMalloy).run({ rowLimit: 100000 })
        const data = queryResult.data.toObject()
        queryResults.set(queryInfo.id, data)
      }
      executeTime = Math.round(performance.now() - executeStart)

      // Render
      const renderStart = performance.now()
      const gridSpec = buildGridSpec(tableSpec, queryPlan, queryResults, {
        malloyQueries,
        orderingProvider: this.orderingProvider ?? undefined,
      })
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

  /**
   * Get the dimension map for inspection
   */
  getDimensionMap(): Map<string, DimensionInfo> {
    return this.dimensionMap
  }

  /**
   * Get the current Malloy extend block content
   */
  getExtendBlock(): string {
    const extendMatch = this.malloySource.match(/extend\s*\{([\s\S]*)\}\s*$/)
    return extendMatch ? extendMatch[1].trim() : ''
  }

  /**
   * Update the dimensions with a new extend block.
   * This allows the playground to support custom dimension definitions.
   *
   * @param extendBlock The new Malloy extend block content (without the outer `extend { }`)
   */
  updateDimensions(extendBlock: string): void {
    // Rebuild the Malloy source with the new extend block
    this.malloySource = `source: samples is duckdb.table('samples') extend {\n${extendBlock}\n}`

    // Re-parse dimension mappings for percentile partitioning
    this.dimensionMap = parseDimensionMappings(extendBlock)

    // Re-detect ordering dimensions for definition-order sorting
    this.orderingProvider = detectDimensionOrdering(extendBlock)

    console.log('[TPL] Executor', this.executorId, '- Updated dimensions, now have', this.dimensionMap.size, 'dimension mappings')
    console.log('[TPL] Executor', this.executorId, '- New malloySource starts with:', this.malloySource.substring(0, 200))
    console.log('[TPL] Executor', this.executorId, '- orderingProvider has occupation:', this.orderingProvider?.hasDefinitionOrder('occupation'))
  }

  /**
   * Reset dimensions to the original samples.malloy content
   */
  async resetDimensions(): Promise<void> {
    // Reload the original Malloy source
    const response = await fetch('/tplm/data/samples.malloy')
    if (!response.ok) {
      throw new Error('Failed to reload samples.malloy')
    }
    const malloyContent = await response.text()

    // Replace the placeholder table path with the actual registered table
    this.malloySource = malloyContent.replace('{TABLE_PATH}', 'samples')

    // Re-parse dimension mappings
    this.dimensionMap = parseDimensionMappings(malloyContent)

    // Re-detect ordering dimensions
    this.orderingProvider = detectDimensionOrdering(malloyContent)

    console.log('[TPL] Reset to original dimensions')
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
