# Order by Different Aggregate

Order rows by one aggregate while displaying a different one. This shows occupations ordered by total income but displays average income in the cells.

## Interactive Example

<Playground
  initial-query="TABLE\n  ROWS occupation DESC@income.sum\n  COLS education * income.mean\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="4"
  label="Try It"
  :variations="[
    { label: 'Order by count, show sum', query: 'TABLE\n  ROWS occupation DESC@N\n  COLS education * income.sum\n;' },
    { label: 'Order by mean, show sum', query: 'TABLE\n  ROWS occupation DESC@income.mean\n  COLS education * income.sum\n;' },
    { label: 'Top 5 by sum, showing mean', query: 'TABLE\n  ROWS occupation[-5@income.sum]\n  COLS education * income.mean\n;' },
    { label: 'Order by sum, show both sum and mean', query: 'TABLE\n  ROWS occupation DESC@income.sum\n  COLS education * (income.sum | income.mean)\n;' }
  ]"
/>

## Query Breakdown

- `TABLE` - Declares a crosstab table statement
- `ROWS occupation DESC@income.sum` - All occupations ordered by sum of income (descending)
  - `DESC` - Descending order (highest values first)
  - `@income.sum` - Order by sum of income, not alphabetically
- `COLS education * income.mean` - Column dimension showing average income
  - The displayed measure (`income.mean`) differs from the ordering measure (`income.sum`)
- `income.mean` - Measure: average income for each cell

The ordering aggregate (`@income.sum`) is independent of the displayed measure (`income.mean`). This is useful when you want to rank by total volume but show per-capita or average values.


## Related Examples

- [Order by Value](/examples/limits/order-by-value) - Order and display the same aggregate
- [Order Ascending by Value](/examples/limits/order-asc-by-value) - Ascending value-based ordering
- [Top N by Value](/examples/limits/limit-by-value) - Combine different aggregates with limits
