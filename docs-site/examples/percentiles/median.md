# Median (P50)

Use `median` or `p50` to compute the 50th percentile (median) of a measure.

## Interactive Example

<Playground
  initial-query="TABLE ROWS occupation * income.median;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="2"
  label="Try It"
  :variations="[
    { label: 'Using p50 syntax', query: 'TABLE ROWS occupation * income.p50;' },
    { label: 'Median with column dimension', query: 'TABLE ROWS occupation COLS gender * income.median;' },
    { label: 'Compare mean vs median', query: 'TABLE ROWS occupation * (income.mean | income.median);' },
    { label: 'Top 5 occupations by median income', query: 'TABLE ROWS occupation[-5@income.median] * income.median;' }
  ]"
/>

## Query Breakdown

- `TABLE` - Declares a crosstab table statement
- `ROWS occupation` - Occupation values become row headers
- `income.median` - Computes the 50th percentile (median) of income

The median is less sensitive to outliers than the mean. `median` and `p50` are interchangeable.

## Related Examples

- [Interquartile Range](/examples/percentiles/iqr) - P25, P50, and P75 together
- [Statistical Summary](/examples/percentiles/statistical-summary) - Complete distribution view
- [Multiple Aggregates](/examples/core/multiple-aggregates) - Combine multiple aggregations
