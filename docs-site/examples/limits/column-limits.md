# Column Limits

Limits work on column dimensions too. Use `[-N]` to show the last N values alphabetically, limiting the columns displayed.

## Interactive Example

<Playground
  initial-query="TABLE\n  ROWS occupation * gender\n  COLS education[-2] * income.sum\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="4"
  label="Try It"
  :variations="[
    { label: 'First 3 education levels instead', query: 'TABLE\n  ROWS occupation * gender\n  COLS education[3] * income.sum\n;' },
    { label: 'Top 2 education by income', query: 'TABLE\n  ROWS occupation * gender\n  COLS education[-2@income.sum] * income.sum\n;' },
    { label: 'Limit both rows and columns', query: 'TABLE\n  ROWS occupation[-3] * gender\n  COLS education[-2] * income.sum\n;' },
    { label: 'Column limit with nested gender', query: 'TABLE\n  ROWS occupation\n  COLS education[-2] * gender * income.sum\n;' }
  ]"
/>

## Query Breakdown

- `TABLE` - Declares a crosstab table statement
- `ROWS occupation * gender` - Two-level row hierarchy: occupation containing gender
- `COLS education[-2] * income.sum` - Column dimension with limit applied
  - `education[-2]` - Last 2 education levels alphabetically (descending)
  - `[-2]` - Negative number means reverse alphabetical order, limit to 2
- `income.sum` - Measure: sum of income for each cell

Column limits use the same syntax as row limits. The `[-N]` syntax limits to the last N values alphabetically, while `[N]` would give the first N.


## Related Examples

- [Alphabetic Row Limits](/examples/limits/row-limit-alpha) - Limit rows alphabetically
- [Top N by Value](/examples/limits/limit-by-value) - Limit by aggregate value instead of alphabetically
- [Nested Limits](/examples/limits/nested-limits) - Apply limits at multiple hierarchy levels
