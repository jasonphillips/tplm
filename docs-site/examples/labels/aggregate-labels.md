# Aggregate Labels

Labels on aggregates clarify what each column shows.

## Interactive Example

<Playground
  initial-query="TABLE\n  ROWS occupation * gender\n  COLS education * (income.sum 'Total Income' | income.mean 'Avg Income')\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="4"
  label="Try It"
  :variations="[
    { label: 'Multiple Aggregate Labels', query: 'TABLE\n  ROWS occupation\n  COLS income.sum \'Sum\' | income.mean \'Average\' | n \'Count\'\n;' },
    { label: 'Labels with Totals', query: 'TABLE\n  ROWS (occupation | ALL \'All Jobs\')\n  COLS (education | ALL) * income.sum \'Income Total\'\n;' }
  ]"
/>

## Query Breakdown

- `income.sum 'Total Income'` - Labels the sum aggregate as "Total Income"
- `income.mean 'Avg Income'` - Labels the mean aggregate as "Avg Income"
- Labels appear in column headers instead of default names like "income_sum"

Aggregate labels make tables more readable by replacing technical field names with user-friendly descriptions.

## Related Examples

- [Dimension Labels](/examples/labels/dimension-labels) - Label row and column dimensions
- [Total Labels](/examples/labels/total-labels) - Label ALL totals
