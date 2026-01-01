# Total Labels

Labels on ALL make totals more readable.

## Interactive Example

<Playground
  initial-query="TABLE\n  ROWS (occupation | ALL 'All Occupations') * gender\n  COLS (education | ALL 'Overall') * income.sum\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="4"
  label="Try It"
  :variations="[
    { label: 'Row Total Label', query: 'TABLE\n  ROWS (occupation | ALL \'Grand Total\')\n  COLS education * income.sum\n;' },
    { label: 'Column Total Label', query: 'TABLE\n  ROWS occupation\n  COLS (education | ALL \'All Education\') * income.sum\n;' },
    { label: 'Subtotal Labels', query: 'TABLE\n  ROWS occupation * (gender | ALL \'Both Genders\')\n  COLS income.sum\n;' }
  ]"
/>

## Query Breakdown

- `ALL 'All Occupations'` - Labels the row total as "All Occupations"
- `ALL 'Overall'` - Labels the column total as "Overall"
- Labels replace the default "ALL" text with meaningful descriptions

Total labels clarify what aggregation the total row or column represents.


## Related Examples

- [Dimension Labels](/examples/labels/dimension-labels) - Label row and column dimensions
- [Aggregate Labels](/examples/labels/aggregate-labels) - Label measures and aggregates
