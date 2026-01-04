/**
 * Docs Examples E2E Tests
 *
 * Runs the example queries from the documentation site and validates
 * they produce expected results. These tests serve as regression tests
 * ensuring documented functionality continues to work.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { fromCSV, type EasyTPL } from '../dist/index.js';
import { TableAssertion } from '../dist/renderer/index.js';
import * as path from 'path';
import * as fs from 'fs';

import {
  type DocsExampleFixture,
  coreExamples,
  totalsExamples,
  limitsExamples,
  percentageExamples,
  labelsExamples,
  formattingExamples,
  filterExamples,
  advancedExamples,
  percentileExamples,
} from './fixtures/docs-examples.js';

// Path to the docs site sample data
const SAMPLES_CSV = path.join(process.cwd(), 'docs-site/public/data/samples.csv');
const SAMPLES_MALLOY = path.join(process.cwd(), 'docs-site/public/data/samples.malloy');

let tplInstance: EasyTPL;

beforeAll(() => {
  // Load the extend block from samples.malloy (everything inside extend { ... })
  const malloySource = fs.readFileSync(SAMPLES_MALLOY, 'utf-8');

  // Extract the extend block content (between extend { and final })
  // The file defines a source with extend, we need just the extend content
  const extendMatch = malloySource.match(/extend\s*\{([\s\S]*)\}\s*$/);
  const extendBlock = extendMatch ? extendMatch[1].trim() : '';

  // Create TPL instance from the samples CSV and extend with dimension definitions
  tplInstance = fromCSV(SAMPLES_CSV).extend(extendBlock);
});

/**
 * Helper to run TPL and wrap result in TableAssertion
 */
async function runTPL(query: string): Promise<TableAssertion> {
  const { html } = await tplInstance.query(query);
  return new TableAssertion(html, query);
}

/**
 * Run assertions for a single fixture
 */
async function runFixtureAssertions(fixture: DocsExampleFixture): Promise<void> {
  const table = await runTPL(fixture.query);

  // Table-level assertions
  if (fixture.table) {
    if (fixture.table.cellCount !== undefined) {
      table.shouldHaveCellCount(fixture.table.cellCount);
    }

    if (fixture.table.dimensionValues) {
      for (const [dim, expectedValues] of Object.entries(fixture.table.dimensionValues)) {
        const actualValues = table.getUniqueDimensionValues(dim);
        expect(actualValues.sort()).toEqual(expectedValues.sort());
      }
    }
  }

  // Single cell assertions
  if (fixture.cells) {
    for (const cellSpec of fixture.cells) {
      const cell = table.cell(cellSpec.dimensions);

      if (cellSpec.value !== undefined) {
        cell.shouldEqual(cellSpec.value, 1); // tolerance of 1 for rounding
      }

      if (cellSpec.greaterThan !== undefined) {
        cell.shouldBeGreaterThan(cellSpec.greaterThan);
      }

      if (cellSpec.lessThan !== undefined) {
        cell.shouldBeLessThan(cellSpec.lessThan);
      }

      if (cellSpec.between !== undefined) {
        cell.shouldBeBetween(cellSpec.between[0], cellSpec.between[1]);
      }

      if (cellSpec.formatted !== undefined) {
        cell.shouldHaveFormattedValue(cellSpec.formatted);
      }

      if (cellSpec.tooltipContains !== undefined) {
        cell.shouldHaveTooltipContaining(cellSpec.tooltipContains);
      }
    }
  }

  // Multi-cell assertions
  if (fixture.multiCells) {
    for (const multiSpec of fixture.multiCells) {
      const cells = table.cells(multiSpec.dimensions);

      if (multiSpec.count !== undefined) {
        cells.shouldHaveCount(multiSpec.count);
      }

      if (multiSpec.allGreaterThan !== undefined) {
        cells.shouldAllBeGreaterThan(multiSpec.allGreaterThan);
      }

      if (multiSpec.sumTo !== undefined) {
        cells.shouldSumTo(multiSpec.sumTo);
      }

      if (multiSpec.sumsTo100Percent) {
        cells.shouldSumToApproximately100Percent(2); // 2% tolerance
      }
    }
  }
}

/**
 * Generate tests for a category of fixtures
 */
function describeFixtureCategory(categoryName: string, fixtures: DocsExampleFixture[]): void {
  describe(categoryName, () => {
    for (const fixture of fixtures) {
      if (fixture.skip) {
        it.skip(`${fixture.name} (${fixture.skipReason || 'skipped'})`, async () => {
          await runFixtureAssertions(fixture);
        });
      } else {
        it(fixture.name, async () => {
          await runFixtureAssertions(fixture);
        });
      }
    }
  });
}

describe('Docs Site Examples', () => {
  describeFixtureCategory('Core Examples', coreExamples);
  describeFixtureCategory('Totals Examples', totalsExamples);
  describeFixtureCategory('Limits Examples', limitsExamples);
  describeFixtureCategory('Percentage Examples', percentageExamples);
  describeFixtureCategory('Labels Examples', labelsExamples);
  describeFixtureCategory('Formatting Examples', formattingExamples);
  describeFixtureCategory('Filter Examples', filterExamples);
  describeFixtureCategory('Advanced Examples', advancedExamples);
  describeFixtureCategory('Percentile Examples', percentileExamples);
});
