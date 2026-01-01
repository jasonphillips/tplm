# Custom Format

Use custom format strings with `#` as a placeholder for flexible number formatting. Enclose your format pattern in quotes after the colon.

## Interactive Example

<Playground
  initial-query='TABLE ROWS occupation * gender COLS education * income.sum:"$ #.2";'
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="2"
  label="Try It"
  :variations='[
    { label: "Euro format", query: "TABLE ROWS occupation * gender COLS education * income.sum:\"€ #.2\";" },
    { label: "With units", query: "TABLE ROWS occupation * gender COLS education * income.sum:\"#.0 USD\";" },
    { label: "Millions", query: "TABLE ROWS occupation * gender COLS education * income.sum:\"$ #.2 M\";" }
  ]'
/>

## Query Breakdown

- `income.sum:'$ #.2'` - Custom format with dollar sign prefix and 2 decimal places
- `#` - Placeholder for the number value (includes thousands separators)
- `.N` - Decimal precision (e.g., `.2` for 2 decimal places, `.0` for none)
- Text before/after `#` appears as prefix/suffix

## Custom Format Syntax

```
:'prefix #.N suffix'
```

Examples:
- `:'$ #.2'` → `$ 1,234.57`
- `:'€ #.2'` → `€ 1,234.57`
- `:'#.0 units'` → `1,235 units`
- `:'#.1%'` → `45.7%`
- `:'$ #.2 M'` → `$ 1.23 M`

## Built-in Formats

For common cases, use the built-in format keywords:
- `:currency` - Dollar formatting with 2 decimals
- `:integer` - Whole numbers with commas
- `:percent` - Percentage with % symbol
- `:decimal.N` - N decimal places
- `:comma.N` - Commas with N decimal places


## Related Examples

- [Currency](/examples/formatting/currency-format) - Built-in currency format
- [Decimal](/examples/formatting/decimal-format) - Decimal precision
- [Integer](/examples/formatting/integer-format) - Whole numbers
- [Multiple Formats](/examples/formatting/multiple-formats) - Combining formats
