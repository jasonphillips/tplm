# Decimal Format

The `:decimal.N` format controls decimal precision, displaying exactly N decimal places.

## Interactive Example

<Playground
  initial-query="TABLE\n  ROWS occupation * gender\n  COLS education * income.mean:decimal.2\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="4"
  label="Try It"
  :variations="[
    { label: 'One Decimal Place', query: 'TABLE\n  ROWS occupation\n  COLS education * income.mean:decimal.1\n;' },
    { label: 'Three Decimal Places', query: 'TABLE\n  ROWS occupation\n  COLS education * income.mean:decimal.3\n;' },
    { label: 'Decimal with Totals', query: 'TABLE\n  ROWS (occupation | ALL)\n  COLS education * income.mean:decimal.2\n;' }
  ]"
/>

## Query Breakdown

- `income.mean:decimal.2` - Formats the average income with exactly 2 decimal places (1234.57)
- `:decimal.1` - One decimal place
- `:decimal.3` - Three decimal places

The number after the dot specifies the precision. Use decimal format when you need consistent decimal alignment in your tables.

## Related Examples

- [Currency](/examples/formatting/currency-format) - Dollar formatting with separators
- [Integer](/examples/formatting/integer-format) - No decimals, with separators
- [Multiple Formats](/examples/formatting/multiple-formats) - Different formats per measure
- [Custom Format](/examples/formatting/custom-format) - Custom format strings
