# Currency Format

The `:currency` format adds dollar signs and thousands separators to numeric values.

## Interactive Example

<Playground
  initial-query="TABLE\n  ROWS occupation * gender\n  COLS education * income.sum:currency\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="4"
  label="Try It"
  :variations="[
    { label: 'Currency with Mean', query: 'TABLE\n  ROWS occupation\n  COLS education * income.mean:currency\n;' },
    { label: 'Currency with Totals', query: 'TABLE\n  ROWS (occupation | ALL) * income.sum:currency\n  COLS education | ALL\n;' },
    { label: 'Multiple Currency Measures', query: 'TABLE\n  ROWS occupation\n  COLS education * (income.sum:currency | income.mean:currency)\n;' }
  ]"
/>

## Query Breakdown

- `income.sum:currency` - Formats the sum of income as currency ($1,234.56)
- `occupation * gender` - Nests gender within occupation for row hierarchy
- `education * ...` - Nests the formatted measure under each education level

The `:currency` format is ideal for financial data, automatically adding the dollar sign and comma separators.

## Related Examples

- [Decimal](/examples/formatting/decimal-format) - Control decimal precision
- [Integer](/examples/formatting/integer-format) - Whole numbers with separators
- [Multiple Formats](/examples/formatting/multiple-formats) - Different formats per measure
- [Custom Format](/examples/formatting/custom-format) - Non-USD currencies and custom patterns
