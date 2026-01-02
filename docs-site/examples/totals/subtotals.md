# Nested Subtotals

Place ALL at inner nesting levels to create subtotals within each parent group.

## Interactive Example

<Playground
  initial-query="TABLE\n  ROWS occupation * (gender | ALL)\n  COLS (education | ALL) * income.sum\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="4"
  label="Try It"
  :variations="[
    { label: 'Add grand total row too', query: 'TABLE\n  ROWS (occupation | ALL) * (gender | ALL)\n  COLS (education | ALL) * income.sum\n;' },
    { label: 'Subtotals on rows only', query: 'TABLE\n  ROWS occupation * (gender | ALL)\n  COLS education * income.sum\n;' },
    { label: 'No subtotals (compare)', query: 'TABLE\n  ROWS occupation * gender\n  COLS education * income.sum\n;' }
  ]"
/>

## Query Breakdown

- `occupation * (gender | ALL)` - For each occupation, shows male, female, and a subtotal
- `(education | ALL)` - Each education level plus a column total
- `* income.sum` - The aggregation applied to all cells

When ALL appears inside a nesting (after `*`), it creates subtotals per parent group rather than a single grand total. Each occupation gets its own gender subtotal row.


## Related Examples

- [Full Marginals](/examples/totals/full-marginals) - Add grand totals alongside subtotals
- [Row Total](/examples/totals/row-total) - Simple grand total without subtotals
- [Total Labels](/examples/labels/total-labels) - Custom labels for subtotal rows
