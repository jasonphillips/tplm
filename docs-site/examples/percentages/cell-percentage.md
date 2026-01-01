# Cell Percentage

ACROSS with no scope calculates each cell as a percentage of the grand total.

## Interactive Example

<Playground
  initial-query="TABLE\n  WHERE occupation IS NOT NULL\n  ROWS occupation * gender\n  COLS education * (income.sum ACROSS)\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="5"
  label="Try It"
  :variations="[
    { label: 'Count %', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS occupation * gender\n  COLS education * (count ACROSS)\n;' },
    { label: 'Mean Income %', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS occupation * gender\n  COLS education * (income.mean ACROSS)\n;' },
    { label: 'With Raw Value', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS occupation * gender\n  COLS education * (income.sum | (income.sum ACROSS))\n;' }
  ]"
/>

## Query Breakdown

- `ROWS occupation * gender` - Creates row hierarchy with occupation and gender
- `COLS education` - Education levels as columns
- `(income.sum ACROSS)` - Each cell shows its percentage of the grand total across all rows and columns

When ACROSS has no scope specified, percentages are calculated against the entire table. All cells together sum to 100%.

## Related Examples

- [Row Percentages](/examples/percentages/row-percentages) - Each row sums to 100%
- [Column Percentages](/examples/percentages/column-percentages) - Each column sums to 100%
- [Value and Percentage](/examples/percentages/value-and-percentage) - Show both raw and percentage
