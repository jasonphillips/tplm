# Labeled Totals

Use custom labels to make totals clearer with `ALL 'Label'` syntax.

## Interactive Example

<Playground
  initial-query="TABLE\n  WHERE occupation IS NOT NULL\n  ROWS (occupation | ALL) * gender\n  COLS (education | ALL) * income.sum\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="5"
  label="Try It"
  :variations="[
    { label: 'Subtotals on gender', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS (occupation | ALL) * (gender | ALL)\n  COLS education * income.sum\n;' },
    { label: 'Labels on columns only', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS occupation * gender\n  COLS (education | ALL) * income.sum\n;' },
    { label: 'Totals on rows only', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS (occupation | ALL) * gender\n  COLS education * income.sum\n;' }
  ]"
/>

## Query Breakdown

- `(occupation | ALL)` - Creates a total row after all occupation values
- `(education | ALL)` - Creates a total column after all education levels
- `* gender` - Gender is nested but has no total (no ALL applied)
- `income.sum` - Measure: sum of income for each cell

The `ALL` keyword adds a total that aggregates across all values of the dimension. You can add custom labels with `ALL 'Label'` syntax.


## Related Examples

- [Full Marginals](/examples/totals/full-marginals) - Complete row and column totals
- [Subtotals](/examples/totals/subtotals) - Nested subtotals
- [Dimension Labels](/examples/labels/dimension-labels) - Renaming dimension headers
