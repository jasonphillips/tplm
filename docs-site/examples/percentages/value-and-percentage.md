# Value and Percentage

Show both raw values and percentages side by side using the pipe operator.

## Interactive Example

<Playground
  initial-query="TABLE\n  WHERE occupation IS NOT NULL\n  ROWS occupation * gender\n  COLS education * (income.sum | (income.sum ACROSS COLS))\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="5"
  label="Try It"
  :variations="[
    { label: 'Column %', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS occupation * gender\n  COLS education * (income.sum | (income.sum ACROSS ROWS))\n;' },
    { label: 'Grand Total %', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS occupation * gender\n  COLS education * (income.sum | (income.sum ACROSS))\n;' },
    { label: 'Count with %', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS occupation * gender\n  COLS education * (count | (count ACROSS COLS))\n;' }
  ]"
/>

## Query Breakdown

- `ROWS occupation * gender` - Creates row hierarchy with occupation and gender
- `COLS education` - Education levels as columns
- `income.sum | (income.sum ACROSS COLS)` - Pipe operator concatenates two measures: raw sum and row percentage

The pipe operator `|` places multiple measures side by side. This pattern is useful when you need both absolute values and their relative proportions for comparison.

## Related Examples

- [Row Percentages](/examples/percentages/row-percentages) - Each row sums to 100%
- [Column Percentages](/examples/percentages/column-percentages) - Each column sums to 100%
- [Cell Percentage](/examples/percentages/cell-percentage) - Percentage of grand total
