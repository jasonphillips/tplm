# Row Percentages

ACROSS COLS makes each row sum to 100% across its columns.

## Interactive Example

<Playground
  initial-query="TABLE\n  WHERE occupation IS NOT NULL\n  ROWS occupation * gender\n  COLS education * (income.sum ACROSS COLS)\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="5"
  label="Try It"
  :variations="[
    { label: 'Count %', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS occupation * gender\n  COLS education * (count ACROSS COLS)\n;' },
    { label: 'Column % Instead', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS occupation * gender\n  COLS education * (income.sum ACROSS ROWS)\n;' },
    { label: 'With Raw Value', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS occupation * gender\n  COLS education * (income.sum | (income.sum ACROSS COLS))\n;' }
  ]"
/>

## Query Breakdown

- `ROWS occupation * gender` - Creates row hierarchy with occupation and gender
- `COLS education` - Education levels as columns
- `(income.sum ACROSS COLS)` - Calculates percentage within each row; values sum to 100% horizontally

ACROSS COLS computes percentages by dividing each cell by its row total. This shows how income is distributed across education levels for each occupation-gender combination.

## Related Examples

- [Column Percentages](/examples/percentages/column-percentages) - Each column sums to 100%
- [Cell Percentage](/examples/percentages/cell-percentage) - Percentage of grand total
- [Value and Percentage](/examples/percentages/value-and-percentage) - Show both raw and percentage
