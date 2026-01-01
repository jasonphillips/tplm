# Nested Limits

Apply limits at multiple nesting levels in a hierarchy. This shows the top 3 occupations by income, then the top 2 education levels within each.

## Interactive Example

<Playground
  initial-query="TABLE\n  ROWS occupation[-3@income.sum] * education[-2@income.sum]\n  COLS gender * income.sum\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="4"
  label="Try It"
  :variations="[
    { label: 'Different limits: top 5 occupations, top 3 education', query: 'TABLE\n  ROWS occupation[-5@income.sum] * education[-3@income.sum]\n  COLS gender * income.sum\n;' },
    { label: 'Mixed ordering: top occupations, alphabetic education', query: 'TABLE\n  ROWS occupation[-3@income.sum] * education[2]\n  COLS gender * income.sum\n;' },
    { label: 'Bottom performers at each level', query: 'TABLE\n  ROWS occupation[3@income.sum] * education[2@income.sum]\n  COLS gender * income.sum\n;' },
    { label: 'Three levels of nesting with limits', query: 'TABLE\n  ROWS occupation[-2@income.sum] * education[-2@income.sum] * gender\n  COLS income.sum\n;' }
  ]"
/>

## Query Breakdown

- `TABLE` - Declares a crosstab table statement
- `ROWS occupation[-3@income.sum] * education[-2@income.sum]` - Nested hierarchy with limits at each level
  - `occupation[-3@income.sum]` - Top 3 occupations by income sum
    - `[-3]` - Negative means descending order, limit to 3
    - `@income.sum` - Order by this aggregate, not alphabetically
  - `education[-2@income.sum]` - Within each occupation, top 2 education levels by income
- `COLS gender * income.sum` - Column dimension with gender breakdown
- `income.sum` - Measure: sum of income for each cell

Each level of the hierarchy can have its own independent limit and ordering. The inner limits are applied within the context of each outer group.


## Related Examples

- [Top N by Value](/examples/limits/limit-by-value) - Single-level value-based limits
- [Order by Value](/examples/limits/order-by-value) - Order without limiting the count
- [Column Limits](/examples/limits/column-limits) - Apply limits to column dimensions
