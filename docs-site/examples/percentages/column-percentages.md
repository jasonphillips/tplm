# Column Percentages

ACROSS ROWS makes each column sum to 100% down its rows.

## Interactive Example

<Playground
  initial-query="TABLE\n  WHERE occupation IS NOT NULL\n  ROWS occupation * gender\n  COLS education * (income.sum ACROSS ROWS)\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="5"
  label="Try It"
  :variations="[
    { label: 'Count %', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS occupation * gender\n  COLS education * (count ACROSS ROWS)\n;' },
    { label: 'Row % Instead', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS occupation * gender\n  COLS education * (income.sum ACROSS COLS)\n;' },
    { label: 'With Raw Value', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS occupation * gender\n  COLS education * (income.sum | (income.sum ACROSS ROWS))\n;' }
  ]"
/>

## Query Breakdown

- `ROWS occupation * gender` - Creates row hierarchy with occupation and gender
- `COLS education` - Education levels as columns
- `(income.sum ACROSS ROWS)` - Calculates percentage within each column; values sum to 100% vertically

ACROSS ROWS computes percentages by dividing each cell by its column total. This shows how income is distributed across occupations and genders within each education level.

## Related Examples

- [Row Percentages](/examples/percentages/row-percentages) - Each row sums to 100%
- [Cell Percentage](/examples/percentages/cell-percentage) - Percentage of grand total
- [Value and Percentage](/examples/percentages/value-and-percentage) - Show both raw and percentage
