/**
 * E2E Test Utilities for TPL
 *
 * Provides a fluent API for running TPL queries and making assertions
 * about rendered cell values in tests.
 *
 * @example
 * ```typescript
 * const table = await runTPL('TABLE ROWS state * n COLS year;');
 *
 * // Check specific cells
 * table.cell({ state: 'CA', year: 2020 }).shouldEqual(1234);
 * table.cell({ state: 'TX', year: 2020 }).shouldBeGreaterThan(1000);
 *
 * // Check row/column totals
 * table.cell({ state: 'ALL', year: 2020 }).shouldEqual(5000);
 *
 * // Check multiple cells at once
 * table.cells({ year: 2020 }).shouldAllBeGreaterThan(0);
 * ```
 */

import { findCell, findAllCells, getCellValue, type CellLookupOptions, type CellLookupResult } from './test-utils.js';

/**
 * Wrapper around rendered HTML that provides assertion methods.
 */
export class TableAssertion {
  constructor(
    public readonly html: string,
    public readonly tpl: string
  ) {}

  /**
   * Find a specific cell and return an assertion wrapper.
   */
  cell(dimensions: Record<string, string | number>): CellAssertion {
    return new CellAssertion(this.html, this.tpl, { dimensions });
  }

  /**
   * Find all cells matching criteria and return a multi-cell assertion wrapper.
   */
  cells(dimensions?: Record<string, string | number>): MultiCellAssertion {
    return new MultiCellAssertion(this.html, this.tpl, { dimensions });
  }

  /**
   * Get the raw cell lookup result.
   */
  findCell(options: CellLookupOptions): CellLookupResult | null {
    return findCell(this.html, options);
  }

  /**
   * Get all matching cells.
   */
  findAllCells(options?: CellLookupOptions): CellLookupResult[] {
    return findAllCells(this.html, options);
  }

  /**
   * Get the numeric value of a cell.
   */
  getValue(dimensions: Record<string, string | number>): number | null {
    return getCellValue(this.html, { dimensions });
  }

  /**
   * Assert the table has a specific number of data cells.
   */
  shouldHaveCellCount(expected: number): this {
    const cells = findAllCells(this.html);
    if (cells.length !== expected) {
      throw new Error(
        `Expected ${expected} cells, but found ${cells.length}\n` +
        `Query: ${this.tpl}`
      );
    }
    return this;
  }

  /**
   * Assert the table contains at least one cell.
   */
  shouldHaveCells(): this {
    const cells = findAllCells(this.html);
    if (cells.length === 0) {
      throw new Error(
        `Expected table to have cells, but found none\n` +
        `Query: ${this.tpl}`
      );
    }
    return this;
  }

  /**
   * Get count of unique dimension values in the rendered table.
   */
  getUniqueDimensionValues(dimensionName: string): string[] {
    const cells = findAllCells(this.html);
    const values = new Set<string>();
    for (const cell of cells) {
      const value = cell.dimensions.get(dimensionName);
      if (value !== undefined) {
        values.add(value);
      }
    }
    return Array.from(values);
  }
}

/**
 * Assertion wrapper for a single cell.
 */
export class CellAssertion {
  private result: CellLookupResult | null;

  constructor(
    private html: string,
    private tpl: string,
    private options: CellLookupOptions
  ) {
    this.result = findCell(html, options);
  }

  /**
   * Get the raw cell result.
   */
  get(): CellLookupResult | null {
    return this.result;
  }

  /**
   * Get the formatted string value.
   */
  getFormattedValue(): string | null {
    return this.result?.value ?? null;
  }

  /**
   * Get the numeric value (parsed from formatted string).
   */
  getNumericValue(): number | null {
    return getCellValue(this.html, this.options);
  }

  /**
   * Assert the cell exists.
   */
  shouldExist(): this {
    if (!this.result) {
      throw new Error(
        `Cell not found for dimensions: ${JSON.stringify(this.options.dimensions)}\n` +
        `Query: ${this.tpl}`
      );
    }
    return this;
  }

  /**
   * Assert the cell does not exist.
   */
  shouldNotExist(): this {
    if (this.result) {
      throw new Error(
        `Expected cell not to exist for dimensions: ${JSON.stringify(this.options.dimensions)}\n` +
        `But found value: ${this.result.value}\n` +
        `Query: ${this.tpl}`
      );
    }
    return this;
  }

  /**
   * Assert the cell's numeric value equals expected (with optional tolerance).
   */
  shouldEqual(expected: number, tolerance = 0.001): this {
    this.shouldExist();
    const actual = this.getNumericValue();
    if (actual === null) {
      throw new Error(
        `Cell value is not a number: "${this.result!.value}"\n` +
        `Dimensions: ${JSON.stringify(this.options.dimensions)}\n` +
        `Query: ${this.tpl}`
      );
    }
    if (Math.abs(actual - expected) > tolerance) {
      throw new Error(
        `Expected ${expected}, but got ${actual}\n` +
        `Dimensions: ${JSON.stringify(this.options.dimensions)}\n` +
        `Query: ${this.tpl}`
      );
    }
    return this;
  }

  /**
   * Assert the cell's numeric value is approximately equal (percentage tolerance).
   */
  shouldBeApproximately(expected: number, tolerancePercent = 1): this {
    this.shouldExist();
    const actual = this.getNumericValue();
    if (actual === null) {
      throw new Error(
        `Cell value is not a number: "${this.result!.value}"\n` +
        `Dimensions: ${JSON.stringify(this.options.dimensions)}\n` +
        `Query: ${this.tpl}`
      );
    }
    const tolerance = Math.abs(expected * tolerancePercent / 100);
    if (Math.abs(actual - expected) > tolerance) {
      throw new Error(
        `Expected ${expected} ±${tolerancePercent}%, but got ${actual}\n` +
        `Dimensions: ${JSON.stringify(this.options.dimensions)}\n` +
        `Query: ${this.tpl}`
      );
    }
    return this;
  }

  /**
   * Assert the cell's numeric value is greater than expected.
   */
  shouldBeGreaterThan(expected: number): this {
    this.shouldExist();
    const actual = this.getNumericValue();
    if (actual === null) {
      throw new Error(
        `Cell value is not a number: "${this.result!.value}"\n` +
        `Dimensions: ${JSON.stringify(this.options.dimensions)}\n` +
        `Query: ${this.tpl}`
      );
    }
    if (actual <= expected) {
      throw new Error(
        `Expected value > ${expected}, but got ${actual}\n` +
        `Dimensions: ${JSON.stringify(this.options.dimensions)}\n` +
        `Query: ${this.tpl}`
      );
    }
    return this;
  }

  /**
   * Assert the cell's numeric value is less than expected.
   */
  shouldBeLessThan(expected: number): this {
    this.shouldExist();
    const actual = this.getNumericValue();
    if (actual === null) {
      throw new Error(
        `Cell value is not a number: "${this.result!.value}"\n` +
        `Dimensions: ${JSON.stringify(this.options.dimensions)}\n` +
        `Query: ${this.tpl}`
      );
    }
    if (actual >= expected) {
      throw new Error(
        `Expected value < ${expected}, but got ${actual}\n` +
        `Dimensions: ${JSON.stringify(this.options.dimensions)}\n` +
        `Query: ${this.tpl}`
      );
    }
    return this;
  }

  /**
   * Assert the cell's numeric value is within a range.
   */
  shouldBeBetween(min: number, max: number): this {
    this.shouldExist();
    const actual = this.getNumericValue();
    if (actual === null) {
      throw new Error(
        `Cell value is not a number: "${this.result!.value}"\n` +
        `Dimensions: ${JSON.stringify(this.options.dimensions)}\n` +
        `Query: ${this.tpl}`
      );
    }
    if (actual < min || actual > max) {
      throw new Error(
        `Expected value between ${min} and ${max}, but got ${actual}\n` +
        `Dimensions: ${JSON.stringify(this.options.dimensions)}\n` +
        `Query: ${this.tpl}`
      );
    }
    return this;
  }

  /**
   * Assert the cell's formatted string value matches.
   */
  shouldHaveFormattedValue(expected: string): this {
    this.shouldExist();
    if (this.result!.value !== expected) {
      throw new Error(
        `Expected formatted value "${expected}", but got "${this.result!.value}"\n` +
        `Dimensions: ${JSON.stringify(this.options.dimensions)}\n` +
        `Query: ${this.tpl}`
      );
    }
    return this;
  }

  /**
   * Assert the cell's tooltip contains expected text.
   */
  shouldHaveTooltipContaining(expected: string): this {
    this.shouldExist();
    if (!this.result!.title || !this.result!.title.includes(expected)) {
      throw new Error(
        `Expected tooltip to contain "${expected}", but got "${this.result!.title}"\n` +
        `Dimensions: ${JSON.stringify(this.options.dimensions)}\n` +
        `Query: ${this.tpl}`
      );
    }
    return this;
  }
}

/**
 * Assertion wrapper for multiple cells.
 */
export class MultiCellAssertion {
  private results: CellLookupResult[];

  constructor(
    private html: string,
    private tpl: string,
    private options: CellLookupOptions
  ) {
    this.results = findAllCells(html, options);
  }

  /**
   * Get all matching cells.
   */
  getAll(): CellLookupResult[] {
    return this.results;
  }

  /**
   * Get all numeric values.
   */
  getNumericValues(): number[] {
    return this.results
      .map(r => {
        const cleaned = r.value.replace(/[,$%]/g, '').trim();
        return parseFloat(cleaned);
      })
      .filter(n => !isNaN(n));
  }

  /**
   * Assert at least one cell matches.
   */
  shouldExist(): this {
    if (this.results.length === 0) {
      throw new Error(
        `No cells found for dimensions: ${JSON.stringify(this.options.dimensions)}\n` +
        `Query: ${this.tpl}`
      );
    }
    return this;
  }

  /**
   * Assert a specific number of cells match.
   */
  shouldHaveCount(expected: number): this {
    if (this.results.length !== expected) {
      throw new Error(
        `Expected ${expected} cells, but found ${this.results.length}\n` +
        `Dimensions: ${JSON.stringify(this.options.dimensions)}\n` +
        `Query: ${this.tpl}`
      );
    }
    return this;
  }

  /**
   * Assert all cells have numeric values greater than expected.
   */
  shouldAllBeGreaterThan(expected: number): this {
    this.shouldExist();
    const values = this.getNumericValues();
    for (let i = 0; i < values.length; i++) {
      if (values[i] <= expected) {
        throw new Error(
          `Expected all values > ${expected}, but cell ${i} has value ${values[i]}\n` +
          `Cell: ${this.results[i].path}\n` +
          `Query: ${this.tpl}`
        );
      }
    }
    return this;
  }

  /**
   * Assert all cells have numeric values less than expected.
   */
  shouldAllBeLessThan(expected: number): this {
    this.shouldExist();
    const values = this.getNumericValues();
    for (let i = 0; i < values.length; i++) {
      if (values[i] >= expected) {
        throw new Error(
          `Expected all values < ${expected}, but cell ${i} has value ${values[i]}\n` +
          `Cell: ${this.results[i].path}\n` +
          `Query: ${this.tpl}`
        );
      }
    }
    return this;
  }

  /**
   * Assert all cells have positive values.
   */
  shouldAllBePositive(): this {
    return this.shouldAllBeGreaterThan(0);
  }

  /**
   * Assert the sum of all cell values equals expected.
   */
  shouldSumTo(expected: number, tolerance = 0.01): this {
    this.shouldExist();
    const sum = this.getNumericValues().reduce((a, b) => a + b, 0);
    if (Math.abs(sum - expected) > tolerance) {
      throw new Error(
        `Expected sum ${expected}, but got ${sum}\n` +
        `Dimensions: ${JSON.stringify(this.options.dimensions)}\n` +
        `Query: ${this.tpl}`
      );
    }
    return this;
  }

  /**
   * Assert the sum of percentage cells is approximately 100%.
   */
  shouldSumToApproximately100Percent(tolerance = 1): this {
    this.shouldExist();
    const sum = this.getNumericValues().reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > tolerance) {
      throw new Error(
        `Expected percentages to sum to ~100%, but got ${sum}%\n` +
        `Dimensions: ${JSON.stringify(this.options.dimensions)}\n` +
        `Query: ${this.tpl}`
      );
    }
    return this;
  }
}

/**
 * Configuration for the TPL test runner.
 */
export interface TPLTestRunnerConfig {
  /** Default source name for queries */
  sourceName?: string;
  /** Malloy source/model definition */
  source?: string;
  /** Function to execute Malloy queries */
  executeMalloy: (malloy: string) => Promise<any[]>;
  /**
   * Pipeline functions - must be provided by the test setup.
   * This avoids circular dependency issues.
   */
  pipeline: {
    parse: (tpl: string) => any;
    buildTableSpec: (ast: any) => any;
    generateQueryPlan: (tableSpec: any) => any;
    generateMalloyQueries: (queryPlan: any, sourceName: string, options?: any) => any[];
    buildGridSpec: (tableSpec: any, queryPlan: any, queryResults: Map<string, any[]>, malloyQueries: any[]) => any;
    renderGridToHTML: (gridSpec: any) => string;
  };
}

/**
 * Create a TPL test runner with the given configuration.
 *
 * @example
 * ```typescript
 * import { parse } from '../dist/parser/index.js';
 * import { buildTableSpec, generateQueryPlan, generateMalloyQueries, buildGridSpec } from '../dist/compiler/index.js';
 * import { renderGridToHTML } from '../dist/renderer/index.js';
 *
 * const runTPL = createTPLRunner({
 *   sourceName: 'survey',
 *   source: DEFAULT_SOURCE,
 *   executeMalloy: executeMalloy,
 *   pipeline: { parse, buildTableSpec, generateQueryPlan, generateMalloyQueries, buildGridSpec, renderGridToHTML }
 * });
 *
 * it('should calculate totals correctly', async () => {
 *   const table = await runTPL('TABLE ROWS state | ALL * n;');
 *   table.cell({ state: 'ALL' }).shouldBeGreaterThan(1000);
 * });
 * ```
 */
export function createTPLRunner(config: TPLTestRunnerConfig): (tpl: string) => Promise<TableAssertion> {
  const { parse, buildTableSpec, generateQueryPlan, generateMalloyQueries, buildGridSpec, renderGridToHTML } = config.pipeline;

  return async function runTPL(tpl: string): Promise<TableAssertion> {
    const ast = parse(tpl);
    const tableSpec = buildTableSpec(ast);
    const queryPlan = generateQueryPlan(tableSpec);
    const sourceName = config.sourceName ?? 'data';
    const malloyQueries = generateMalloyQueries(queryPlan, sourceName, { where: tableSpec.where });

    const queryResults = new Map<string, any[]>();
    for (const queryInfo of malloyQueries) {
      const fullMalloy = config.source
        ? `${config.source}\n${queryInfo.malloy}`
        : queryInfo.malloy;
      const data = await config.executeMalloy(fullMalloy);
      queryResults.set(queryInfo.id, data);
    }

    const gridSpec = buildGridSpec(tableSpec, queryPlan, queryResults, malloyQueries);
    const html = renderGridToHTML(gridSpec);

    return new TableAssertion(html, tpl);
  };
}
