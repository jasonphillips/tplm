# Statistical Summary

Combine min, percentiles, and max to show the full distribution of values.

## Interactive Example

<Playground
  initial-query="TABLE ROWS occupation * income.(min | p25 | p50 | p75 | max);"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="2"
  label="Try It"
  :variations="[
    { label: 'With mean and stdev', query: 'TABLE ROWS occupation * income.(mean | stdev | p50);' },
    { label: 'Full stats with count', query: 'TABLE ROWS occupation * (count | income.(min | mean | p50 | max));' },
    { label: 'High percentiles (p90, p95, p99)', query: 'TABLE ROWS occupation * income.(p50 | p90 | p95 | p99);' },
    { label: 'By education level', query: 'TABLE ROWS education * income.(min | p25 | p50 | p75 | max);' }
  ]"
/>

## Query Breakdown

- `income.(min | p25 | p50 | p75 | max)` - Multi-binding syntax showing the five-number summary
- `min` - Minimum value
- `p25` - First quartile
- `p50` - Median
- `p75` - Third quartile
- `max` - Maximum value

This "five-number summary" provides a complete picture of the data distribution in a single row.

## Use Cases

- **Salary analysis**: See the full range of salaries, not just the average
- **Performance metrics**: Understand response time distributions (p50, p95, p99)
- **Quality control**: Identify outliers by comparing min/max to quartiles
- **Comparing groups**: See if distributions differ across categories

## Related Examples

- [Interquartile Range](/examples/percentiles/iqr) - Focus on the middle 50%
- [Median](/examples/percentiles/median) - Simple median calculation
- [Multiple Aggregates](/examples/core/multiple-aggregates) - General aggregation syntax
