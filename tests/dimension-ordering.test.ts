/**
 * Dimension-Based Ordering Tests
 *
 * Tests ordering dimensions by other dimensions (e.g., occupation@occupation_order.min)
 * to support ordering by definition order rather than alphabetic or value-based ordering.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { parse } from '../dist/parser/index.js';
import {
  buildTableSpec,
  generateQueryPlan,
  generateMalloyQueries,
} from '../dist/compiler/index.js';
import {
  createLocalConnection,
  executeMalloy,
} from '../dist/executor/index.js';
import fs from 'fs';
import path from 'path';

// Malloy source for employment dataset with occupation_order dimension
const EMPLOYMENT_SOURCE = `
connection: employment_db is duckdb.connect('./data/employment.parquet');

source: employment is employment_db.table('data/employment.parquet') extend {
  dimension:
    occupation is
      pick 'Managerial' when occup = 1
      pick 'Professional' when occup = 2
      pick 'Technical' when occup = 3
      pick 'Sales' when occup = 4
      pick 'Clerical' when occup = 5
      pick 'Services' when occup >= 6 and occup <= 8
      else null

    occupation_order is occup

    education is
      pick '<HS' when educ < 12
      pick 'HS' when educ = 12
      pick 'College' when educ >= 13
      else null
}
`;

beforeAll(async () => {
  await createLocalConnection();
});

describe('Dimension-Based Ordering', () => {
  describe('1. Parser', () => {
    it('should parse dimension@dimension.agg syntax in limits', () => {
      const tpl = 'TABLE ROWS occupation[-5@occupation_order.min] * income.sum COLS education;';
      const ast = parse(tpl);

      expect(ast.type).toBe('table');
      expect(ast.rowAxis.groups[0].items[0].type).toBe('dimension');
      expect(ast.rowAxis.groups[0].items[0].name).toBe('occupation');
      expect(ast.rowAxis.groups[0].items[0].limit).toBeDefined();
      expect(ast.rowAxis.groups[0].items[0].limit?.orderBy).toBeDefined();

      const orderBy = ast.rowAxis.groups[0].items[0].limit?.orderBy;
      // Should be an AggregateExpr object, not a string
      expect(typeof orderBy).toBe('object');
      expect(orderBy).toHaveProperty('type', 'aggregateExpr');
      expect(orderBy).toHaveProperty('field', 'occupation_order');
      expect(orderBy).toHaveProperty('function', 'min');
    });

    it('should parse dimension@dimension.agg syntax in order without limit', () => {
      const tpl = 'TABLE ROWS occupation@occupation_order.min * income.sum COLS education;';
      const ast = parse(tpl);

      expect(ast.type).toBe('table');
      expect(ast.rowAxis.groups[0].items[0].type).toBe('dimension');
      expect(ast.rowAxis.groups[0].items[0].name).toBe('occupation');
      expect(ast.rowAxis.groups[0].items[0].order).toBeDefined();
      expect(ast.rowAxis.groups[0].items[0].order?.orderBy).toBeDefined();

      const orderBy = ast.rowAxis.groups[0].items[0].order?.orderBy;
      // Should be an AggregateExpr object
      expect(typeof orderBy).toBe('object');
      expect(orderBy).toHaveProperty('type', 'aggregateExpr');
      expect(orderBy).toHaveProperty('field', 'occupation_order');
      expect(orderBy).toHaveProperty('function', 'min');
    });

    it('should support .max as well as .min', () => {
      const tpl = 'TABLE ROWS occupation@occupation_order.max * income.sum COLS education;';
      const ast = parse(tpl);

      const orderBy = ast.rowAxis.groups[0].items[0].order?.orderBy;
      expect(orderBy).toHaveProperty('type', 'aggregateExpr');
      expect(orderBy).toHaveProperty('field', 'occupation_order');
      expect(orderBy).toHaveProperty('function', 'max');
    });
  });

  describe('2. Query Plan Generation', () => {
    it('should generate correct query plan with order spec', () => {
      const tpl = 'TABLE ROWS occupation@occupation_order.min * income.sum COLS education;';
      const ast = parse(tpl);
      const tableSpec = buildTableSpec(ast);
      const queryPlan = generateQueryPlan(tableSpec);

      expect(queryPlan.queries.length).toBeGreaterThan(0);

      const firstQuery = queryPlan.queries[0];
      expect(firstQuery.rowGroupings.length).toBe(1);
      expect(firstQuery.rowGroupings[0].dimension).toBe('occupation');

      // The order spec should be present in the grouping
      expect(firstQuery.rowGroupings[0].order).toBeDefined();
      expect(firstQuery.rowGroupings[0].order?.orderBy).toBeDefined();

      // The orderBy should be an AggregateExpr
      const orderBy = firstQuery.rowGroupings[0].order?.orderBy;
      expect(typeof orderBy).toBe('object');
      expect(orderBy).toHaveProperty('type', 'aggregateExpr');
      expect(orderBy).toHaveProperty('field', 'occupation_order');
      expect(orderBy).toHaveProperty('function', 'min');
    });

    it('should not duplicate aggregates when ordering field is also displayed', () => {
      const tpl = 'TABLE ROWS occupation@income.sum * income.sum COLS education;';
      const ast = parse(tpl);
      const tableSpec = buildTableSpec(ast);
      const queryPlan = generateQueryPlan(tableSpec);

      const firstQuery = queryPlan.queries[0];
      const aggregates = firstQuery.aggregates;

      // Should only have income_sum once
      const incomeSumAggs = aggregates.filter((agg) => agg.name === 'income_sum');
      expect(incomeSumAggs.length).toBe(1);
    });
  });

  describe('3. Malloy Generation', () => {
    it('should generate Malloy with ordering aggregate not in group_by', () => {
      const tpl = 'TABLE ROWS occupation@occupation_order.min * income.sum COLS education;';
      const ast = parse(tpl);
      const tableSpec = buildTableSpec(ast);
      const queryPlan = generateQueryPlan(tableSpec);
      const malloyQueries = generateMalloyQueries(queryPlan, 'employment', { where: null });

      expect(malloyQueries.length).toBeGreaterThan(0);

      const firstQuery = malloyQueries[0];
      const malloy = firstQuery.malloy;

      // Should group_by occupation only
      expect(malloy).toContain('group_by: occupation');
      // Should NOT group by occupation_order
      expect(malloy).not.toMatch(/group_by:.*occupation_order/);
      // Should aggregate occupation_order.min() for ordering
      expect(malloy).toMatch(/occupation_order_min\s+is\s+occupation_order\.min\(\)/);
      // Should order by the aggregate
      expect(malloy).toContain('order_by: occupation_order_min');
    });

    it('should handle .max aggregation', () => {
      const tpl = 'TABLE ROWS occupation@occupation_order.max * income.sum COLS education;';
      const ast = parse(tpl);
      const tableSpec = buildTableSpec(ast);
      const queryPlan = generateQueryPlan(tableSpec);
      const malloyQueries = generateMalloyQueries(queryPlan, 'employment', { where: null });

      const firstQuery = malloyQueries[0];
      const malloy = firstQuery.malloy;

      // Should use .max() instead of .min()
      expect(malloy).toMatch(/occupation_order_max\s+is\s+occupation_order\.max\(\)/);
      expect(malloy).toContain('order_by: occupation_order_max');
    });
  });

  describe('4. End-to-End with Real Data', () => {
    // Skip if employment data doesn't exist
    const dataPath = './data/employment.parquet';
    const skipE2E = !fs.existsSync(dataPath);

    (skipE2E ? it.skip : it)('should execute and return results ordered by definition order', async () => {
      const tpl = 'TABLE ROWS occupation@occupation_order.min * income.sum COLS education;';
      const ast = parse(tpl);
      const tableSpec = buildTableSpec(ast);
      const queryPlan = generateQueryPlan(tableSpec);
      const malloyQueries = generateMalloyQueries(queryPlan, 'employment', { where: null });

      // Execute the main query
      const mainQuery = malloyQueries[0];
      const fullMalloy = `${EMPLOYMENT_SOURCE}\n${mainQuery.malloy}`;
      const results = await executeMalloy(fullMalloy);

      // Results should be ordered by occupation_order (1, 2, 3, 4, 5, 6)
      // Which means: Managerial, Professional, Technical, Sales, Clerical, Services
      expect(results.length).toBeGreaterThan(0);

      // Get occupation values in order
      const occupations = results.map((row: any) => row.occupation).filter(Boolean);

      // The first should be Managerial (occup=1), last should be Services (occup=6+)
      expect(occupations[0]).toBe('Managerial');
      if (occupations.length > 1) {
        // Services should come last
        const servicesIndex = occupations.indexOf('Services');
        if (servicesIndex !== -1) {
          expect(servicesIndex).toBe(occupations.length - 1);
        }
      }
    });

    (skipE2E ? it.skip : it)('should not create duplicate rows when ordering dimension has multiple values per display dimension', async () => {
      // This tests the many-to-1 case: occup 6,7,8 all map to 'Services'
      // We should get one row for Services, not three
      const tpl = 'TABLE ROWS occupation@occupation_order.min * count COLS education;';
      const ast = parse(tpl);
      const tableSpec = buildTableSpec(ast);
      const queryPlan = generateQueryPlan(tableSpec);
      const malloyQueries = generateMalloyQueries(queryPlan, 'employment', { where: null });

      const mainQuery = malloyQueries[0];
      const fullMalloy = `${EMPLOYMENT_SOURCE}\n${mainQuery.malloy}`;
      const results = await executeMalloy(fullMalloy);

      // Count how many times 'Services' appears
      const servicesCount = results.filter((row: any) => row.occupation === 'Services').length;

      // Should appear exactly once, not 3 times (for occup 6, 7, 8)
      expect(servicesCount).toBe(1);
    });
  });
});
