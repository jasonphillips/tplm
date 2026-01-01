# Integer Format

The `:integer` format removes decimals and adds thousands separators for clean whole numbers.

## Interactive Example

<Playground
  initial-query="TABLE\n  ROWS occupation * gender\n  COLS education * income.sum:integer\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="4"
  label="Try It"
  :variations="[
    { label: 'Integer Count', query: 'TABLE\n  ROWS occupation\n  COLS education * count:integer\n;' },
    { label: 'Integer with Totals', query: 'TABLE\n  ROWS (occupation | ALL)\n  COLS (education | ALL) * income.sum:integer\n;' },
    { label: 'Integer Mean (Rounded)', query: 'TABLE\n  ROWS occupation\n  COLS education * income.mean:integer\n;' }
  ]"
/>

## Query Breakdown

- `income.sum:integer` - Formats the sum as a whole number with commas (1,235)
- Decimals are rounded to the nearest whole number
- Thousands separators make large numbers readable

Use `:integer` when decimal precision is not needed, such as for counts, population figures, or rounded totals.

## Related Examples

- [Currency](/examples/formatting/currency-format) - Dollar formatting
- [Decimal](/examples/formatting/decimal-format) - Control decimal precision
- [Multiple Formats](/examples/formatting/multiple-formats) - Different formats per measure
- [Custom Format](/examples/formatting/custom-format) - Custom format strings
