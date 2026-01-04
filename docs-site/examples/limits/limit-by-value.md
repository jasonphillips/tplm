# Top N by Value

Use `@aggregate` to order by a computed value instead of alphabetically. This shows the top 5 occupations ranked by total income.

## Interactive Example

<Playground
  initial-query="TABLE\n  ROWS occupation[-5@income.sum]\n  COLS education * gender * income.sum\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="4"
  label="Try It"
  :variations="[
    { label: 'Top 5 by median income', query: 'TABLE\n  ROWS occupation[-5@income.p50]\n  COLS education * gender * income.p50\n;' },
    { label: 'Top 3 instead of top 5', query: 'TABLE\n  ROWS occupation[-3@income.sum]\n  COLS education * gender * income.sum\n;' },
    { label: 'Bottom 5 by income (ascending)', query: 'TABLE\n  ROWS occupation[5@income.sum]\n  COLS education * gender * income.sum\n;' },
    { label: 'Top 5 by average income instead', query: 'TABLE\n  ROWS occupation[-5@income.mean]\n  COLS education * gender * income.mean\n;' },
    { label: 'Top 5 with totals', query: 'TABLE\n  ROWS (occupation[-5@income.sum] | ALL) * income.sum\n  COLS education * gender\n;' }
  ]"
/>

## Query Breakdown

- `TABLE` - Declares a crosstab table statement
- `occupation[-5@income.sum]` - Top 5 occupations ordered by sum of income (descending)
  - `[-5]` - Negative number means descending order (highest first), limit to 5
  - `@income.sum` - Order by this aggregate value, not alphabetically
- `COLS education * gender` - Two-level column hierarchy: education containing gender
- `income.sum` - Measure: sum of income for each cell

Without `@`, limits are alphabetical. With `@aggregate`, they're ranked by that computed value.


## Related Examples

- [Order by Value (no limit)](/examples/limits/order-by-value) - Sort without limiting the count
- [Alphabetic Limits](/examples/limits/row-limit-alpha) - Limit alphabetically instead of by value
- [Nested Limits](/examples/limits/nested-limits) - Apply limits at multiple hierarchy levels
