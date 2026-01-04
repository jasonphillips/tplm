# Order All by Value

Use `DESC@aggregate` to order all rows by a computed value instead of alphabetically. This shows all occupations ordered by income from highest to lowest.

## Interactive Example

<Playground
  initial-query="TABLE\n  ROWS occupation DESC@income.sum\n  COLS education * income.sum\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="4"
  label="Try It"
  :variations="[
    { label: 'Order by median income', query: 'TABLE\n  ROWS occupation DESC@income.p50\n  COLS education * income.p50\n;' },
    { label: 'Order by average income instead', query: 'TABLE\n  ROWS occupation DESC@income.mean\n  COLS education * income.mean\n;' },
    { label: 'Ascending order (lowest first)', query: 'TABLE\n  ROWS occupation ASC@income.sum\n  COLS education * income.sum\n;' },
    { label: 'Add a limit: top 5 only', query: 'TABLE\n  ROWS occupation[-5@income.sum]\n  COLS education * income.sum\n;' },
    { label: 'Order with totals row', query: 'TABLE\n  ROWS (occupation DESC@income.sum | ALL) * income.sum\n  COLS education\n;' }
  ]"
/>

## Query Breakdown

- `TABLE` - Declares a crosstab table statement
- `ROWS occupation DESC@income.sum` - All occupations ordered by income sum (descending)
  - `DESC` - Descending order (highest values first)
  - `@income.sum` - Order by this aggregate value, not alphabetically
  - No bracket limit - shows all values, just reordered
- `COLS education * income.sum` - Column dimension with education breakdown
- `income.sum` - Measure: sum of income for each cell

Without `@`, dimensions are ordered alphabetically. With `DESC@aggregate` or `ASC@aggregate`, they're ordered by that computed value. Use `[-N@aggregate]` to combine ordering with a limit.


## Related Examples

- [Order Ascending by Value](/examples/limits/order-asc-by-value) - Order from lowest to highest
- [Top N by Value](/examples/limits/limit-by-value) - Limit results while ordering by value
- [Order by Different Aggregate](/examples/limits/order-by-different-aggregate) - Sort by one measure, display another
