# Complex Crosstab

Full-featured table combining nesting, totals, limits, and multiple aggregates.

## Interactive Example

<Playground
  initial-query="TABLE\n  WHERE occupation IS NOT NULL\n  ROWS (sector_label | ALL) * occupation[-3@income.sum] * gender\n  COLS (education | ALL) * (income.sum:currency | income.mean:decimal.2)\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="5"
  label="Try It"
  :variations="[
    { label: 'With median and P95', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS (sector_label | ALL) * occupation[-3@income.sum] * gender\n  COLS (education | ALL) * (income.p50:currency | income.p95:currency)\n;' },
    { label: 'Without Totals', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS sector_label * occupation[-3@income.sum] * gender\n  COLS education * (income.sum:currency | income.mean:decimal.2)\n;' },
    { label: 'Top 5 Occupations', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS (sector_label | ALL) * occupation[-5@income.sum] * gender\n  COLS (education | ALL) * income.sum:currency\n;' },
    { label: 'Single Aggregate', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS (sector_label | ALL) * occupation[-3@income.sum]\n  COLS (education | ALL) * income.sum:currency\n;' }
  ]"
/>

## Query Breakdown

- `(sector_label | ALL)` - Sector dimension with grand total row
- `occupation[-3@income.sum]` - Top 3 occupations by total income within each sector
- `gender` - Third level of row nesting for male/female breakdown
- `(education | ALL)` - Education dimension with grand total column
- `(income.sum:currency | income.mean:decimal.2)` - Two aggregates side-by-side: sum formatted as currency and mean with 2 decimal places

This query creates a professional financial table with three levels of row hierarchy, totals at both row and column levels, and multiple formatted aggregates.


## Related Examples

- [Deep Hierarchy](/examples/advanced/deep-hierarchy) - Multiple nesting levels with totals
- [Measure Binding](/examples/advanced/measure-binding) - Multiple measures with multiple aggregates
- [Subtotals](/examples/totals/subtotals) - Nested totals at inner levels
