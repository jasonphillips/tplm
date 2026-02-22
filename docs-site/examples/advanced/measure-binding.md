# Measure Binding

Bind multiple measures to multiple aggregations with `(measures).(aggregations)` syntax.

## Interactive Example

<Playground
  initial-query="TABLE\n  ROWS occupation * gender\n  COLS education * (income | hourly).(sum | mean)\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="4"
  label="Try It"
  :variations="[
    { label: 'Percentile distribution', query: 'TABLE\n  ROWS occupation\n  COLS education * income.(p25 | p50 | p75 | p95)\n;' },
    { label: 'Single Measure, Multiple Aggs', query: 'TABLE\n  ROWS occupation\n  COLS education * income.(sum | mean | min | max)\n;' },
    { label: 'Multiple Measures, Single Agg', query: 'TABLE\n  ROWS occupation * gender\n  COLS education * (income | hourly).sum\n;' },
    { label: 'With Formatting (separate bindings)', query: 'TABLE\n  ROWS occupation * gender\n  COLS education * (income.sum:currency | income.mean:decimal.2)\n;' },
    { label: 'With Formatting (per-agg format)', query: 'TABLE\n  ROWS occupation * gender\n  COLS education * income.(sum:currency | mean:decimal.2)\n;' }
  ]"
/>

## Query Breakdown

- `(income | hourly)` - Two measures concatenated: income and hourly wage
- `.(sum | mean)` - Two aggregations applied to each measure
- Result: 4 aggregate columns per education level (income.sum, income.mean, hourly.sum, hourly.mean)
- `occupation * gender` - Two-level row hierarchy

The measure binding syntax `(measures).(aggregations)` creates a cartesian product: each measure gets each aggregation. This is more concise than writing `income.sum | income.mean | hourly.sum | hourly.mean`.

## Per-Aggregation Formats

You can apply different formats to each aggregation using the `aggregation:format` syntax:

```tpl
income.(sum:currency | mean:decimal.2)
```

This applies currency format to the sum and 2-decimal format to the mean. Each format applies only to its aggregation.


## Related Examples

- [Multiple Aggregates](/examples/core/multiple-aggregates) - Basic multiple aggregate syntax
- [Currency Format](/examples/formatting/currency-format) - Formatting aggregate values
- [Complex Crosstab](/examples/advanced/complex-crosstab) - Combining with other features
