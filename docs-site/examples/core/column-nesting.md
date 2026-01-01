# Column Nesting

The `*` operator nests dimensions in columns. Here education contains gender as sub-columns beneath each education level.

## Interactive Example

<Playground
  initial-query="TABLE ROWS occupation COLS education * gender * income.sum;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="2"
  label="Try It"
  :variations="[
    { label: 'Reverse nesting: gender containing education', query: 'TABLE ROWS occupation COLS gender * education * income.sum;' },
    { label: 'Single level column nesting', query: 'TABLE ROWS occupation COLS education * income.sum;' },
    { label: 'Three column levels with occupation', query: 'TABLE ROWS income.sum COLS occupation * education * gender;' },
    { label: 'Multiple measures under nested columns', query: 'TABLE ROWS occupation COLS education * gender * (income.sum | income.mean);' }
  ]"
/>

## Query Breakdown

- `TABLE` - Declares a crosstab table statement
- `ROWS occupation` - Row dimension: occupation values become row headers
- `COLS education * gender` - Column hierarchy: education is the outer dimension, gender is nested within each education level
- `income.sum` - Measure: sum of income values for each cell

The `*` operator creates a parent-child relationship in columns where each education value spans multiple gender sub-columns beneath it.


## Related Examples

- [Row Nesting](/examples/core/row-nesting) - Apply nesting to rows instead
- [Column Concatenation](/examples/core/column-concat) - Use `|` to show columns side-by-side instead of nested
- [Deep Hierarchy](/examples/advanced/deep-hierarchy) - Three or more levels of nesting
