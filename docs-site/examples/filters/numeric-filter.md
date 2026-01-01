# Numeric Filter

Numeric comparisons filter to specific value ranges.

## Interactive Example

<Playground
  initial-query="TABLE\n  WHERE income > 50000\n  ROWS occupation\n  COLS gender * income.mean\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="5"
  label="Try It"
  :variations="[
    { label: 'Less than', query: 'TABLE\n  WHERE income < 30000\n  ROWS occupation * gender\n  COLS income.mean\n;' },
    { label: 'Greater than or equal', query: 'TABLE\n  WHERE income >= 40000\n  ROWS education\n  COLS gender * income.sum\n;' },
    { label: 'Less than or equal', query: 'TABLE\n  WHERE income <= 60000\n  ROWS occupation\n  COLS education * income.mean\n;' },
    { label: 'Not equal', query: 'TABLE\n  WHERE income != 0\n  ROWS gender * occupation\n  COLS income.sum\n;' }
  ]"
/>

## Query Breakdown

- `WHERE income > 50000` - Filters to rows where income exceeds 50,000

Numeric filters support all comparison operators: `>`, `<`, `>=`, `<=`, `=`, `!=`.

## Related Examples

- [String Filter](/examples/filters/string-filter) - String equality conditions
- [Compound Filter](/examples/filters/compound-filter) - Combine multiple conditions with AND/OR
