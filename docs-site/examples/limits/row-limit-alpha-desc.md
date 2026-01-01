# Reverse Alphabetic Limit

Use `[-N]` to show the last N values alphabetically (descending order). This shows the last 5 occupations when sorted A-Z.

## Interactive Example

<Playground
  initial-query="TABLE\n  ROWS occupation[-5]\n  COLS education * gender * income.sum\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="4"
  label="Try It"
  :variations="[
    { label: 'First 5 alphabetically instead', query: 'TABLE\n  ROWS occupation[5]\n  COLS education * gender * income.sum\n;' },
    { label: 'Last 3 occupations', query: 'TABLE\n  ROWS occupation[-3]\n  COLS education * gender * income.sum\n;' },
    { label: 'Last 5 by value instead of alpha', query: 'TABLE\n  ROWS occupation[-5@income.sum]\n  COLS education * gender * income.sum\n;' },
    { label: 'Reverse alpha with totals', query: 'TABLE\n  ROWS (occupation[-5] | ALL)\n  COLS education * gender * income.sum\n;' }
  ]"
/>

## Query Breakdown

- `TABLE` - Declares a crosstab table statement
- `ROWS occupation[-5]` - Last 5 occupations alphabetically
  - `[-5]` - Negative number means reverse alphabetical order (Z-A), limit to 5
  - No `@aggregate` - ordering is alphabetical, not by value
- `COLS education * gender * income.sum` - Three-level column hierarchy
- `income.sum` - Measure: sum of income for each cell

The sign of the number controls direction: `[5]` gives first 5 (A-Z), `[-5]` gives last 5 (Z-A). Add `@aggregate` to order by value instead of alphabetically.


## Related Examples

- [Alphabetic Limit](/examples/limits/row-limit-alpha) - First N values alphabetically
- [Top N by Value](/examples/limits/limit-by-value) - Limit by computed value instead
- [Column Limits](/examples/limits/column-limits) - Apply limits to column dimensions
