import { describe, it, expect } from 'vitest';
import { parsePeggy, parseChevrotain } from '../dist/parser/index.js';
import { buildTableSpec } from '../dist/compiler/index.js';

describe('Per-aggregation format specifiers', () => {
  it('PEG: parses (sum:currency | mean:decimal.2) syntax', () => {
    const tpl = 'TABLE ROWS occupation COLS education * (income | hourly).(sum:currency | mean:decimal.2);';
    const ast = parsePeggy(tpl);

    // Get the annotated group
    const annotatedGroup = ast.colAxis.groups[0].items[1];
    expect(annotatedGroup.type).toBe('annotatedGroup');
    expect(annotatedGroup.aggregations).toEqual([
      { method: 'sum', format: { type: 'currency' } },
      { method: 'mean', format: { type: 'decimal', precision: 2 } },
    ]);
  });

  it('Chevrotain: parses (sum:currency | mean:decimal.2) syntax', () => {
    const tpl = 'TABLE ROWS occupation COLS education * (income | hourly).(sum:currency | mean:decimal.2);';
    const ast = parseChevrotain(tpl);

    // Get the annotated group
    const annotatedGroup = ast.colAxis.groups[0].items[1];
    expect(annotatedGroup.type).toBe('annotatedGroup');
    expect(annotatedGroup.aggregations).toEqual([
      { method: 'sum', format: { type: 'currency' } },
      { method: 'mean', format: { type: 'decimal', precision: 2 } },
    ]);
  });

  it('Parity: per-aggregation format specifiers', () => {
    const tpl = 'TABLE ROWS occupation COLS education * (income | hourly).(sum:currency | mean:decimal.2);';
    const peg = parsePeggy(tpl);
    const chev = parseChevrotain(tpl);
    expect(chev).toEqual(peg);
  });

  it('builds table spec with per-aggregation formats', () => {
    const tpl = 'TABLE ROWS occupation COLS education * income.(sum:currency | mean:decimal.2);';
    const ast = parsePeggy(tpl);
    const tableSpec = buildTableSpec(ast);

    // Verify table spec was built
    expect(tableSpec).toBeDefined();
    expect(tableSpec.colAxis).toBeDefined();

    // Get all aggregate leaves from the column axis
    const aggregates = collectAggregates(tableSpec.colAxis);

    // Should have 2 aggregates: sum and mean
    expect(aggregates.length).toBe(2);

    // Check that formats are correctly applied
    expect(aggregates[0].format).toEqual({ type: 'currency' });
    expect(aggregates[1].format).toEqual({ type: 'decimal', precision: 2 });
  });

  it('handles single aggregation with format', () => {
    const tpl = 'TABLE ROWS occupation COLS education * income.sum:currency;';
    const ast = parsePeggy(tpl);
    const binding = ast.colAxis.groups[0].items[1];

    expect(binding.type).toBe('binding');
    expect(binding.aggregations).toEqual([
      { method: 'sum', format: { type: 'currency' } },
    ]);
  });

  it('formats in binding take precedence over group format', () => {
    // The format on sum:currency should take precedence
    const tpl = 'TABLE ROWS occupation COLS education * income.(sum:currency | mean):decimal.2;';
    const ast = parsePeggy(tpl);
    const annotatedGroup = ast.colAxis.groups[0].items[1];

    // sum has its own format
    expect(annotatedGroup.aggregations[0].format).toEqual({ type: 'currency' });
    // mean doesn't have format at aggregation level
    expect(annotatedGroup.aggregations[1].format).toBeUndefined();
    // Group-level format is on the annotated group
    expect(annotatedGroup.format).toEqual({ type: 'decimal', precision: 2 });
  });
});

// Helper function to collect aggregates from tree
function collectAggregates(node: any): any[] {
  if (!node) return [];
  if (node.nodeType === 'aggregate') {
    return [node];
  }
  if (node.nodeType === 'siblings') {
    return node.children.flatMap((c: any) => collectAggregates(c));
  }
  if (node.child) {
    return collectAggregates(node.child);
  }
  return [];
}
