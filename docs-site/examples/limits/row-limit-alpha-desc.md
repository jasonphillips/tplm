# Reverse Alphabetic Limit

Use `[-N]` to show the last N values in descending order.

::: tip Definition Order for DIMENSION
For dimensions defined with `DIMENSION` syntax, this uses **reverse definition order**, not reverse alphabetical order. The values appear in the opposite order from how buckets are declared in the `DIMENSION` statement.
:::

This example shows the last 5 occupations from the `occupation` dimension (reverse definition order: Farming, Transport, Manufacturing, Services, ...).

## Interactive Example

<Playground
  initial-query="TABLE\n  ROWS occupation[-5]\n  COLS education * gender * income.sum\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="4"
  label="Try It"
  :variations="[
    { label: 'First 5 alphabetically instead', query: 'TABLE\n  ROWS occupation[5]\n  COLS education * gender * income.sum\n;' },
    { label: 'Last 3 occupations', query: 'TABLE\n  ROWS occupation[-3]\n  COLS education * gender * income.sum\n;' },
    { label: 'Last 5 by value instead of alpha', query: 'TABLE\n  ROWS occupation[-5@income.sum]\n  COLS education * gender * income.sum\n;' },
    { label: 'Reverse alpha with totals', query: 'TABLE\n  ROWS (occupation[-5] | ALL)\n  COLS education * gender * income.sum\n;' }
  ]"
/>

## Query Breakdown

- `TABLE` - Declares a crosstab table statement
- `ROWS occupation[-5]` - Last 5 occupations
  - `[-5]` - Negative number means descending order, limit to 5
  - For `DIMENSION`-defined dimensions, uses **reverse definition order**
  - For raw columns, uses reverse alphabetic order (Z-A)
- `COLS education * gender * income.sum` - Three-level column hierarchy
- `income.sum` - Measure: sum of income for each cell

The sign of the number controls direction: `[5]` gives first N, `[-5]` gives last N. For dimensions defined with `DIMENSION` syntax, ordering follows definition order by default. Add `@aggregate` to order by value instead.


## Related Examples

- [Alphabetic Limit](/examples/limits/row-limit-alpha) - First N values alphabetically
- [Top N by Value](/examples/limits/limit-by-value) - Limit by computed value instead
- [Column Limits](/examples/limits/column-limits) - Apply limits to column dimensions
