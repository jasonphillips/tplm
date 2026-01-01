# Multiple Formats

Different formats can be applied to different measures in the same table using the concatenation operator.

## Interactive Example

<Playground
  initial-query="TABLE\n  ROWS occupation * gender\n  COLS education * (income.sum:currency | income.mean:decimal.2)\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="4"
  label="Try It"
  :variations="[
    { label: 'Currency and Integer', query: 'TABLE\n  ROWS occupation\n  COLS education * (income.sum:currency | count:integer)\n;' },
    { label: 'Three Different Formats', query: 'TABLE\n  ROWS occupation\n  COLS (income.sum:currency | income.mean:decimal.2 | count:integer)\n;' },
    { label: 'With Row Totals', query: 'TABLE\n  ROWS (occupation | ALL)\n  COLS education * (income.sum:currency | income.mean:decimal.2)\n;' }
  ]"
/>

## Query Breakdown

- `income.sum:currency` - Total income formatted as dollars
- `income.mean:decimal.2` - Average income with 2 decimal places
- `(... | ...)` - The pipe operator concatenates measures side by side

Each measure can have its own format, allowing you to display totals as currency while showing averages with decimal precision.

## Related Examples

- [Currency](/examples/formatting/currency-format) - Dollar formatting
- [Decimal](/examples/formatting/decimal-format) - Decimal precision
- [Integer](/examples/formatting/integer-format) - Whole numbers
- [Custom Format](/examples/formatting/custom-format) - Custom format strings
