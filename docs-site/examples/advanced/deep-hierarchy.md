# Deep Hierarchy

Multiple nesting levels with totals at each level using the `(dimension | ALL)` pattern.

## Interactive Example

<Playground
  initial-query="TABLE\n  WHERE occupation IS NOT NULL\n  ROWS (occupation[-5@income.sum] | ALL) * (gender | ALL)\n  COLS (education | ALL) * income.sum\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="5"
  label="Try It"
  :variations="[
    { label: 'Percentile distribution', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS (occupation[-5@income.sum] | ALL) * (gender | ALL)\n  COLS (education | ALL) * income.(p50 | p95)\n;' },
    { label: 'Three Row Levels', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS occupation * gender * education * income.sum\n  COLS sector_label\n;' },
    { label: 'Totals at All Levels', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS (occupation | ALL) * (gender | ALL) * (education | ALL) * income.sum\n;' },
    { label: 'Without Row Totals', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS occupation[-5@income.sum] * gender\n  COLS (education | ALL) * income.sum\n;' }
  ]"
/>

## Query Breakdown

- `occupation[-5@income.sum] | ALL` - Top 5 occupations by income, plus a grand total row
- `(gender | ALL)` - Gender breakdown with subtotal for each occupation
- `(education | ALL)` - Education columns with total column
- `income.sum` - Sum of income as the measure

The `(dimension | ALL)` pattern at each level creates a hierarchical structure with totals. The occupation level shows the top 5 plus a grand total. Within each occupation, gender shows Male, Female, plus a subtotal. Columns show each education level plus an overall total.


## Related Examples

- [Subtotals](/examples/totals/subtotals) - ALL at inner nesting levels
- [Full Marginals](/examples/totals/full-marginals) - Totals on both rows and columns
- [Complex Crosstab](/examples/advanced/complex-crosstab) - Combining multiple advanced features
