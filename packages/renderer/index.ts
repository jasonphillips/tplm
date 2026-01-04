/**
 * renderer package - gridspec to HTML
 */

export {
  renderGridToHTML,
  type GridRenderOptions,
} from './grid-renderer.js';

// Test utilities for querying rendered tables
export {
  findCell,
  findAllCells,
  getCellValue,
  parseCellPath,
  type CellLookupOptions,
  type CellLookupResult,
} from './test-utils.js';

// E2E test utilities with fluent assertion API
export {
  TableAssertion,
  CellAssertion,
  MultiCellAssertion,
  createTPLRunner,
  type TPLTestRunnerConfig,
} from './e2e-test-utils.js';
