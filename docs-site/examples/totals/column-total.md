# Column Total

Add a total column using ALL in the COLS clause.

## Interactive Example

<Playground
  initial-query="TABLE\n  ROWS occupation * gender\n  COLS (education | ALL) * income.sum\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="4"
  label="Try It"
  :variations="[
    { label: 'Move total to rows instead', query: 'TABLE\n  ROWS (occupation | ALL) * gender\n  COLS education * income.sum\n;' },
    { label: 'Totals on both axes', query: 'TABLE\n  ROWS (occupation | ALL) * gender\n  COLS (education | ALL) * income.sum\n;' },
    { label: 'Add multiple aggregates', query: 'TABLE\n  ROWS occupation\n  COLS (education | ALL) * (income.sum | income.mean)\n;' }
  ]"
/>

## Query Breakdown

- `ROWS occupation * gender` - Nests gender within occupation for row headers
- `(education | ALL)` - Shows each education level plus a total column
- `* income.sum` - Applies the sum aggregation across all columns

The `|` operator concatenates the dimension with ALL, creating columns for each education value followed by a grand total column.


## Related Examples

- [Row Total](/examples/totals/row-total) - Add totals to rows instead of columns
- [Full Marginals](/examples/totals/full-marginals) - Both row and column totals
- [Total Labels](/examples/labels/total-labels) - Custom labels for total cells
