# Row Concatenation

The `|` operator creates sibling row sections. Here occupation and education appear as separate row groups stacked vertically.

## Interactive Example

<Playground
  initial-query="TABLE ROWS (occupation | education) COLS gender * income.sum;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="2"
  label="Try It"
  :variations="[
    { label: 'Three row sections', query: 'TABLE ROWS (occupation | education | gender) COLS income.sum;' },
    { label: 'Concat nested hierarchies', query: 'TABLE ROWS (occupation * gender | education * gender) COLS income.sum;' },
    { label: 'Mix concat and nesting', query: 'TABLE ROWS occupation * (gender | education) COLS income.sum;' },
    { label: 'Concat with column nesting', query: 'TABLE ROWS (occupation | education) COLS gender * income.(sum | mean);' }
  ]"
/>

## Query Breakdown

- `TABLE` - Declares a crosstab table statement
- `ROWS (occupation | education)` - Row concatenation: occupation rows appear first, then education rows below as a separate section
- `COLS gender` - Column dimension: gender values become column headers
- `income.sum` - Measure: sum of income values for each cell

The `|` operator creates independent row sections that are stacked vertically, unlike `*` which nests dimensions hierarchically.


## Related Examples

- [Column Concatenation](/examples/core/column-concat) - Apply concatenation to columns instead
- [Row Nesting](/examples/core/row-nesting) - Use `*` to nest rows hierarchically
- [Concat with Totals](/examples/advanced/concat-with-totals) - Add totals to concatenated sections
