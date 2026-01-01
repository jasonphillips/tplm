# Basic Crosstab

The fundamental TPL pattern: row dimensions crossed with column dimensions to create a summary table.

## Interactive Example

<Playground
  initial-query="TABLE ROWS occupation COLS education * income.sum;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="2"
  label="Try It"
  :variations="[
    { label: 'Swap rows and columns', query: 'TABLE ROWS education COLS occupation * income.sum;' },
    { label: 'Use mean instead of sum', query: 'TABLE ROWS occupation COLS education * income.mean;' },
    { label: 'Different dimensions: gender by education', query: 'TABLE ROWS gender COLS education * income.sum;' },
    { label: 'Count instead of income', query: 'TABLE ROWS occupation COLS education * count;' }
  ]"
/>

## Query Breakdown

- `TABLE` - Declares a crosstab table statement
- `ROWS occupation` - Row dimension: occupation values become row headers
- `COLS education` - Column dimension: education levels become column headers
- `income.sum` - Measure: sum of income values populates each cell

The crosstab creates a matrix where each cell shows the sum of income for that specific combination of occupation and education level.


## Related Examples

- [Row Nesting](/examples/core/row-nesting) - Nest dimensions within rows using `*`
- [Column Nesting](/examples/core/column-nesting) - Nest dimensions within columns
- [Row Total](/examples/totals/row-total) - Add totals to your crosstab
