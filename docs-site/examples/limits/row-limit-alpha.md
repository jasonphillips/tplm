# Alphabetic Limit

Use `[N]` to show the first N values in ascending order.

::: tip Definition Order for DIMENSION
For dimensions defined with `DIMENSION` syntax, this uses **definition order** (the order buckets are declared), not alphabetical order. This lets you control the natural ordering of categories like education levels or income brackets.
:::

This example shows the first 5 occupations from the `occupation` dimension (which follows definition order: Managerial, Professional, Technical, Sales, Clerical, ...).

## Interactive Example

<Playground
  initial-query="TABLE\n  ROWS occupation[5]\n  COLS education * gender * income.sum\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="4"
  label="Try It"
  :variations="[
    { label: 'First 3 occupations only', query: 'TABLE\n  ROWS occupation[3]\n  COLS education * gender * income.sum\n;' },
    { label: 'Last 5 alphabetically (Z-A)', query: 'TABLE\n  ROWS occupation[-5]\n  COLS education * gender * income.sum\n;' },
    { label: 'Top 5 by income instead of alpha', query: 'TABLE\n  ROWS occupation[-5@income.sum]\n  COLS education * gender * income.sum\n;' },
    { label: 'First 5 with totals row', query: 'TABLE\n  ROWS (occupation[5] | ALL)\n  COLS education * gender * income.sum\n;' }
  ]"
/>

## Query Breakdown

- `TABLE` - Declares a crosstab table statement
- `ROWS occupation[5]` - First 5 occupations
  - `[5]` - Positive number means ascending order, limit to 5
  - For `DIMENSION`-defined dimensions, uses **definition order** (not alphabetic)
  - For raw columns, uses alphabetic order (A-Z)
- `COLS education * gender * income.sum` - Three-level column hierarchy
- `income.sum` - Measure: sum of income for each cell

The sign of the number controls direction: `[5]` gives first N, `[-5]` gives last N. For dimensions defined with `DIMENSION` syntax, ordering follows definition order by default. To order by a computed value instead, add `@aggregate` like `[-5@income.sum]`.


## Related Examples

- [Reverse Alphabetic Limit](/examples/limits/row-limit-alpha-desc) - Last N values alphabetically
- [Top N by Value](/examples/limits/limit-by-value) - Limit by computed value instead
- [Nested Limits](/examples/limits/nested-limits) - Apply limits at multiple hierarchy levels
