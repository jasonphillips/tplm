# Multiple Aggregates

Use `|` to show multiple aggregates as sibling columns. The parentheses group the aggregates together.

## Interactive Example

<Playground
  initial-query="TABLE ROWS occupation COLS education * (income.sum | income.mean);"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="2"
  label="Try It"
  :variations="[
    { label: 'Three aggregates: sum, mean, and count', query: 'TABLE ROWS occupation COLS education * (income.sum | income.mean | count);' },
    { label: 'Aggregates without column dimension', query: 'TABLE ROWS occupation * gender COLS income.sum | income.mean;' },
    { label: 'Nested rows with multiple measures', query: 'TABLE ROWS occupation * gender COLS education * (income.sum | income.mean);' },
    { label: 'Alternative syntax with field grouping', query: 'TABLE ROWS occupation COLS education * income.(sum | mean);' }
  ]"
/>

## Query Breakdown

- `TABLE` - Declares a crosstab table statement
- `ROWS occupation` - Row dimension: occupation values become row headers
- `COLS education` - Column dimension: education levels become outer column headers
- `(income.sum | income.mean)` - Multiple measures: sum and mean appear as sibling columns under each education level

The `|` operator concatenates measures horizontally, creating separate columns for each aggregate function applied to the same field.


## Related Examples

- [Column Concatenation](/examples/core/column-concat) - Concatenate dimensions instead of measures
- [Row Concatenation](/examples/core/row-concat) - Apply concatenation to rows
- [Value and Percentage](/examples/percentages/value-and-percentage) - Show value alongside its percentage
