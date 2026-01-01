# Concatenation with Totals

Multiple sections each with their own totals using nested concatenation.

## Interactive Example

<Playground
  initial-query="TABLE\n  WHERE occupation IS NOT NULL\n  ROWS ((occupation | ALL) | (education | ALL)) * gender\n  COLS income.sum\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="5"
  label="Try It"
  :variations="[
    { label: 'Single Section with Total', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS (occupation | ALL) * gender\n  COLS income.sum\n;' },
    { label: 'Three Sections', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS ((occupation | ALL) | (education | ALL) | (gender | ALL)) * income.sum\n;' },
    { label: 'Without Subtotals', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS (occupation | education) * gender\n  COLS income.sum\n;' }
  ]"
/>

## Query Breakdown

- `((occupation | ALL) | (education | ALL))` - Two independent sections, each with its own total
- `occupation | ALL` - First section: occupation breakdown with total
- `education | ALL` - Second section: education breakdown with total
- `* gender` - Both sections are crossed with gender as a second level
- `income.sum` - Measure: sum of income for each cell

The outer concatenation `|` creates two separate table sections stacked vertically. Each section has its own dimension and its own total row, allowing you to compare different breakdowns in a single table.


## Related Examples

- [Row Concatenation](/examples/core/row-concat) - Basic concatenation of dimensions
- [Labeled Totals](/examples/totals/labeled-totals) - Custom labels on total rows
- [Deep Hierarchy](/examples/advanced/deep-hierarchy) - Multiple nesting with totals
