# Order Ascending by Value

Use `ASC@aggregate` to order all rows in ascending order by a computed value. This shows all occupations ordered by income from lowest to highest.

## Interactive Example

<Playground
  initial-query="TABLE\n  ROWS occupation ASC@income.sum\n  COLS education * income.sum\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="4"
  label="Try It"
  :variations="[
    { label: 'Ascending by average income instead', query: 'TABLE\n  ROWS occupation ASC@income.mean\n  COLS education * income.mean\n;' },
    { label: 'Descending order (highest first)', query: 'TABLE\n  ROWS occupation DESC@income.sum\n  COLS education * income.sum\n;' },
    { label: 'Bottom 5 with limit', query: 'TABLE\n  ROWS occupation[5@income.sum]\n  COLS education * income.sum\n;' },
    { label: 'Ascending with totals row', query: 'TABLE\n  ROWS (occupation ASC@income.sum | ALL) * income.sum\n  COLS education\n;' }
  ]"
/>

## Query Breakdown

- `TABLE` - Declares a crosstab table statement
- `ROWS occupation ASC@income.sum` - All occupations ordered by income ascending
  - `ASC` - Ascending order (lowest values first)
  - `@income.sum` - Order by this aggregate value, not alphabetically
  - No bracket limit - shows all values
- `COLS education * income.sum` - Column dimension with education breakdown
- `income.sum` - Measure: sum of income for each cell

Use `ASC@` for ascending (lowest first) and `DESC@` for descending (highest first). Without a bracket limit like `[5]`, all rows are shown in the specified order.


## Related Examples

- [Order by Value (Descending)](/examples/limits/order-by-value) - Order descending without limit
- [Top N by Value](/examples/limits/limit-by-value) - Combine ordering with limits
- [Order by Different Aggregate](/examples/limits/order-by-different-aggregate) - Sort by one measure, display another
