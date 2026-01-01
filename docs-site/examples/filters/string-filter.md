# String Filter

WHERE clause filters data before aggregation using string equality.

## Interactive Example

<Playground
  initial-query="TABLE\n  WHERE gender = 'F'\n  ROWS occupation\n  COLS education * income.sum\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="5"
  label="Try It"
  :variations="[
    { label: 'Filter by occupation', query: 'TABLE\n  WHERE occupation = \'Professional\'\n  ROWS gender * education\n  COLS income.mean\n;' },
    { label: 'Filter by education', query: 'TABLE\n  WHERE education = \'College\'\n  ROWS occupation\n  COLS gender * income.sum\n;' },
    { label: 'IS NOT NULL check', query: 'TABLE\n  WHERE occupation IS NOT NULL\n  ROWS gender\n  COLS education * income.mean\n;' },
    { label: 'IS NULL check', query: 'TABLE\n  WHERE education IS NULL\n  ROWS gender\n  COLS occupation * income.sum\n;' }
  ]"
/>

## Query Breakdown

- `WHERE gender = 'F'` - Filters to rows where gender equals 'F'

String values must be enclosed in single quotes. Use IS NULL / IS NOT NULL for null checks.

## Related Examples

- [Numeric Filter](/examples/filters/numeric-filter) - Numeric comparison operators
- [Compound Filter](/examples/filters/compound-filter) - Combine multiple conditions with AND/OR
