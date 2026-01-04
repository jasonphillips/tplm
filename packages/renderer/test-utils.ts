/**
 * Test Utilities for TPL HTML Tables
 *
 * Provides functions to query rendered TPL tables for testing.
 * Uses the data-cell attribute added to each cell during rendering.
 */

/**
 * Parse the data-cell attribute format into a map of dimension values.
 * Format: "dimension=value|dimension=value|..."
 */
export function parseCellPath(dataCell: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!dataCell) return result;

  const parts = dataCell.split('|');
  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key && value !== undefined) {
      result.set(key, value);
    }
  }
  return result;
}

/**
 * Options for finding a cell in the HTML table.
 */
export interface CellLookupOptions {
  /**
   * Dimension values to match. Each key is a dimension name, value is the expected value.
   * All specified dimensions must match for a cell to be returned.
   */
  dimensions?: Record<string, string | number>;

  /**
   * The aggregate name to match (e.g., 'income_sum', 'n').
   * If not specified, any aggregate matches.
   */
  measure?: string;
}

/**
 * Result from finding a cell.
 */
export interface CellLookupResult {
  /** The cell's text content (formatted value) */
  value: string;
  /** The raw data-cell attribute value */
  path: string;
  /** Parsed dimension values */
  dimensions: Map<string, string>;
  /** The title attribute (human-readable path) */
  title: string | null;
}

/**
 * Find a cell in rendered TPL HTML by its dimension path.
 *
 * @param html The rendered HTML table string
 * @param options Lookup options specifying which cell to find
 * @returns The cell result, or null if not found
 *
 * @example
 * ```typescript
 * const result = findCell(html, {
 *   dimensions: { education: '<HS', gender: 'Male' },
 *   measure: 'income_sum'
 * });
 * console.log(result?.value); // "1,234,567"
 * ```
 */
export function findCell(html: string, options: CellLookupOptions): CellLookupResult | null {
  const all = findAllCells(html, options);
  return all.length > 0 ? all[0] : null;
}

/**
 * Find all cells matching the given criteria.
 *
 * @param html The rendered HTML table string
 * @param options Lookup options (partial match - finds all cells matching specified dimensions)
 * @returns Array of matching cells
 */
export function findAllCells(html: string, options: CellLookupOptions = {}): CellLookupResult[] {
  const results: CellLookupResult[] = [];

  // More robust regex that handles various attribute orderings
  const tdRegex = /<td([^>]*)>([^<]*)<\/td>/gi;

  let match;
  while ((match = tdRegex.exec(html)) !== null) {
    const attrs = match[1];
    const value = match[2];

    // Extract data-cell attribute
    const dataCellMatch = attrs.match(/data-cell="([^"]*)"/);
    if (!dataCellMatch) continue;

    const path = dataCellMatch[1];
    const dims = parseCellPath(path);

    // Extract title attribute
    const titleMatch = attrs.match(/title="([^"]*)"/);
    const title = titleMatch ? titleMatch[1] : null;

    // Check if dimensions match
    let allMatch = true;
    if (options.dimensions) {
      for (const [key, expectedValue] of Object.entries(options.dimensions)) {
        const actualValue = dims.get(key);
        if (actualValue !== String(expectedValue)) {
          allMatch = false;
          break;
        }
      }
    }

    if (allMatch) {
      results.push({ value, path, dimensions: dims, title });
    }
  }

  return results;
}

/**
 * Get the numeric value of a cell (parsing the formatted string).
 *
 * @param html The rendered HTML table string
 * @param options Lookup options
 * @returns The numeric value, or null if not found or not a number
 */
export function getCellValue(html: string, options: CellLookupOptions): number | null {
  const cell = findCell(html, options);
  if (!cell) return null;

  // Remove formatting (commas, currency symbols, etc.) and parse
  const cleaned = cell.value.replace(/[,$%]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}
