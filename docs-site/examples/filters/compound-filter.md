# Compound Filter

Multiple conditions combined with AND or OR operators.

## Interactive Example

<Playground
  initial-query="TABLE\n  WHERE gender = 'Female' AND income > 50000\n  ROWS occupation\n  COLS education * income.mean\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="5"
  label="Try It"
  :variations="[
    { label: 'AND with two string conditions', query: 'TABLE\n  WHERE gender = \'F\' AND occupation = \'Professional\'\n  ROWS education\n  COLS income.sum * income.mean\n;' },
    { label: 'OR for multiple values', query: 'TABLE\n  WHERE occupation = \'Professional\' OR occupation = \'Managerial\'\n  ROWS gender * education\n  COLS income.mean\n;' },
    { label: 'Mixed AND/OR', query: 'TABLE\n  WHERE gender = \'M\' AND (occupation = \'Professional\' OR occupation = \'Technical\')\n  ROWS education\n  COLS income.sum\n;' },
    { label: 'Multiple numeric conditions', query: 'TABLE\n  WHERE income > 30000 AND income < 80000\n  ROWS occupation * gender\n  COLS income.mean\n;' }
  ]"
/>

## Query Breakdown

- `WHERE gender = 'Female' AND income > 50000` - Combines a string equality filter with a numeric comparison using AND

Both conditions must be true for a row to be included. Use OR when either condition should match.

## Related Examples

- [String Filter](/examples/filters/string-filter) - Single string equality condition
- [Numeric Filter](/examples/filters/numeric-filter) - Numeric comparison operators
