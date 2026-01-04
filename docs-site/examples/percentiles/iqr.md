# Interquartile Range (IQR)

Use `p25`, `p50`, and `p75` together to show the interquartile range - a measure of statistical dispersion.

## Interactive Example

<Playground
  initial-query="TABLE ROWS occupation * income.(p25 | p50 | p75);"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="2"
  label="Try It"
  :variations="[
    { label: 'IQR with column dimension', query: 'TABLE ROWS occupation COLS gender * income.(p25 | p50 | p75);' },
    { label: 'Just median and upper quartile', query: 'TABLE ROWS occupation * income.(p50 | p75);' },
    { label: 'Top 5 by median', query: 'TABLE ROWS occupation[-5@income.p50] * income.(p25 | p50 | p75);' }
  ]"
/>

## Query Breakdown

- `income.(p25 | p50 | p75)` - Multi-binding syntax: applies three percentile aggregations to income
- `p25` - First quartile (25th percentile)
- `p50` - Median (50th percentile)
- `p75` - Third quartile (75th percentile)

The IQR (p75 - p25) contains the middle 50% of the data. It's useful for understanding data spread and identifying outliers.

## Percentile Reference

| Syntax | Percentile | Description |
|--------|------------|-------------|
| `p25` | 25th | First quartile |
| `p50` | 50th | Median (also available as `median`) |
| `p75` | 75th | Third quartile |
| `p90` | 90th | Common for performance metrics |
| `p95` | 95th | Common for SLA/latency reporting |
| `p99` | 99th | Tail latency metric |

## Related Examples

- [Median](/examples/percentiles/median) - Just the 50th percentile
- [Statistical Summary](/examples/percentiles/statistical-summary) - Complete distribution view
- [Multiple Aggregates](/examples/core/multiple-aggregates) - General multi-aggregation syntax
