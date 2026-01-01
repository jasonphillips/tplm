# Alphabetic Limit

Use `[N]` to show the first N values alphabetically. This shows the first 5 occupations when sorted A-Z.

## Interactive Example

<Playground
  initial-query="TABLE\n  ROWS occupation[5]\n  COLS education * gender * income.sum\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="4"
  label="Try It"
  :variations="[
    { label: 'First 3 occupations only', query: 'TABLE\n  ROWS occupation[3]\n  COLS education * gender * income.sum\n;' },
    { label: 'Last 5 alphabetically (Z-A)', query: 'TABLE\n  ROWS occupation[-5]\n  COLS education * gender * income.sum\n;' },
    { label: 'Top 5 by income instead of alpha', query: 'TABLE\n  ROWS occupation[-5@income.sum]\n  COLS education * gender * income.sum\n;' },
    { label: 'First 5 with totals row', query: 'TABLE\n  ROWS (occupation[5] | ALL)\n  COLS education * gender * income.sum\n;' }
  ]"
/>

## Query Breakdown

- `TABLE` - Declares a crosstab table statement
- `ROWS occupation[5]` - First 5 occupations alphabetically
  - `[5]` - Positive number means ascending alphabetical order (A-Z), limit to 5
  - No `@aggregate` - ordering is alphabetical, not by value
- `COLS education * gender * income.sum` - Three-level column hierarchy
- `income.sum` - Measure: sum of income for each cell

The sign of the number controls direction: `[5]` gives first 5 (A-Z), `[-5]` gives last 5 (Z-A). To order by a computed value instead, add `@aggregate` like `[-5@income.sum]`.


## Related Examples

- [Reverse Alphabetic Limit](/examples/limits/row-limit-alpha-desc) - Last N values alphabetically
- [Top N by Value](/examples/limits/limit-by-value) - Limit by computed value instead
- [Nested Limits](/examples/limits/nested-limits) - Apply limits at multiple hierarchy levels
