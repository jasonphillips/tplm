# Row Total

Add a total row using ALL in the ROWS clause.

## Interactive Example

<Playground
  initial-query="TABLE\n  WHERE occupation IS NOT NULL\n  ROWS (occupation | ALL)\n  COLS education * gender * income.sum\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="5"
  label="Try It"
  :variations="[
    { label: 'Move total to columns', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS occupation\n  COLS (education | ALL) * gender * income.sum\n;' },
    { label: 'Nest gender with subtotals', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS (occupation | ALL) * (gender | ALL)\n  COLS education * income.sum\n;' },
    { label: 'Simple rows with column total', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS occupation * gender\n  COLS (education | ALL) * income.sum\n;' }
  ]"
/>

## Query Breakdown

- `(occupation | ALL)` - Shows each occupation value plus a total row at the bottom
- `COLS education * gender * income.sum` - Nested column headers without totals

The parentheses group the dimension with its total. The `|` operator concatenates the individual values with the ALL aggregate row.


## Related Examples

- [Column Total](/examples/totals/column-total) - Add totals to columns instead of rows
- [Full Marginals](/examples/totals/full-marginals) - Both row and column totals
- [Subtotals](/examples/totals/subtotals) - Totals at inner nesting levels
