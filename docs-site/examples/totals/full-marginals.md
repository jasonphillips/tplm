# Full Marginals

Complete table with totals on both rows and columns for comprehensive summaries.

## Interactive Example

<Playground
  initial-query="TABLE\n  WHERE occupation IS NOT NULL\n  ROWS (occupation | ALL) * (gender | ALL)\n  COLS (education | ALL) * income.sum\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="5"
  label="Try It"
  :variations="[
    { label: 'Remove inner subtotals', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS (occupation | ALL)\n  COLS (education | ALL) * income.sum\n;' },
    { label: 'Subtotals only (no grand total)', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS occupation * (gender | ALL)\n  COLS education * income.sum\n;' },
    { label: 'Add percentage alongside sum', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS (occupation | ALL)\n  COLS (education | ALL) * (income.sum | income.mean)\n;' }
  ]"
/>

## Query Breakdown

- `(occupation | ALL)` - Adds a grand total row after all occupations
- `(gender | ALL)` - Adds a subtotal row for each occupation showing both genders combined
- `(education | ALL)` - Adds a grand total column after all education levels
- `* income.sum` - The measure displayed in all cells

Placing `ALL` at multiple nesting levels creates a complete marginal table with subtotals at each hierarchy level and grand totals at the edges.


## Related Examples

- [Subtotals](/examples/totals/subtotals) - Subtotals at inner nesting levels only
- [Total Labels](/examples/labels/total-labels) - Custom labels for clarity
- [Row Total](/examples/totals/row-total) - Simple row total without column totals
