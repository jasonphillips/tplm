# Column Concatenation

The `|` operator on columns creates side-by-side column groups. Here gender and occupation appear as separate column sections.

## Interactive Example

<Playground
  initial-query="TABLE ROWS education COLS (gender | occupation) * income.sum;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="2"
  label="Try It"
  :variations="[
    { label: 'Three column groups', query: 'TABLE ROWS education COLS (gender | occupation | income.mean) * income.sum;' },
    { label: 'Concat with nested dimensions', query: 'TABLE ROWS education COLS (gender * income.sum | occupation * income.mean);' },
    { label: 'Multiple measures as siblings', query: 'TABLE ROWS occupation COLS gender * (income.sum | income.mean);' },
    { label: 'Reverse: occupation by concatenated rows', query: 'TABLE ROWS (gender | education) COLS occupation * income.sum;' }
  ]"
/>

## Query Breakdown

- `TABLE` - Declares a crosstab table statement
- `ROWS education` - Row dimension: education levels become row headers
- `COLS (gender | occupation)` - Column concatenation: gender columns appear first, then occupation columns as a separate group
- `income.sum` - Measure: sum of income values for each cell

The `|` operator creates sibling column sections that appear side-by-side, unlike `*` which nests dimensions hierarchically.


## Related Examples

- [Row Concatenation](/examples/core/row-concat) - Apply concatenation to rows instead
- [Column Nesting](/examples/core/column-nesting) - Use `*` to nest columns hierarchically
- [Multiple Aggregates](/examples/core/multiple-aggregates) - Concatenate measures instead of dimensions
