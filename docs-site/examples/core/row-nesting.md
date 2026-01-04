# Row Nesting

The `*` operator nests dimensions to create hierarchies. Here occupation contains gender as a sub-grouping.

## Interactive Example

<Playground
  initial-query="TABLE ROWS occupation * gender COLS education * income.sum;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="2"
  label="Try It"
  :variations="[
    { label: 'Show median and P95 income', query: 'TABLE ROWS occupation * gender COLS education * (income.p50 | income.p95);' },
    { label: 'Reverse nesting: gender containing occupation', query: 'TABLE ROWS gender * occupation COLS education * income.sum;' },
    { label: 'Add a third level: occupation > gender > education', query: 'TABLE ROWS occupation * gender * education COLS income.sum;' },
    { label: 'Multiple measures in hierarchy', query: 'TABLE ROWS occupation * gender COLS education * (income.sum | income.mean);' }
  ]"
/>

## Query Breakdown

- `TABLE` - Declares a crosstab table statement
- `ROWS occupation * gender` - Row hierarchy: occupation is the outer dimension, gender is nested within each occupation
- `COLS education` - Column dimension: education levels become column headers
- `income.sum` - Measure: sum of income values for each cell

The `*` operator creates a parent-child relationship where each occupation value contains all gender values beneath it.


## Related Examples

- [Column Nesting](/examples/core/column-nesting) - Apply nesting to columns instead
- [Row Concatenation](/examples/core/row-concat) - Use `|` to show dimensions side-by-side instead of nested
- [Deep Hierarchy](/examples/advanced/deep-hierarchy) - Three or more levels of nesting
