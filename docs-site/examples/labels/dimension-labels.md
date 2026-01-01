# Dimension Labels

Quoted strings after dimensions provide display labels.

## Interactive Example

<Playground
  initial-query="TABLE\n  ROWS occupation 'Job Category' * gender 'Sex'\n  COLS education 'Education Level' * income.sum\n;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="4"
  label="Try It"
  :variations="[
    { label: 'Single Dimension Label', query: 'TABLE\n  ROWS occupation \'Job Type\'\n  COLS income.sum\n;' },
    { label: 'Row and Column Labels', query: 'TABLE\n  ROWS gender \'Gender\'\n  COLS education \'Degree Level\' * income.sum\n;' },
    { label: 'Labels with Limits', query: 'TABLE\n  ROWS occupation[-3] \'Top 3 Jobs\'\n  COLS education \'Education\' * income.sum\n;' }
  ]"
/>

## Query Breakdown

- `occupation 'Job Category'` - Labels the occupation dimension as "Job Category"
- `gender 'Sex'` - Labels the gender dimension as "Sex"
- `education 'Education Level'` - Labels the education dimension as "Education Level"

Dimension labels replace field names with descriptive headers, improving table readability for end users.


## Related Examples

- [Aggregate Labels](/examples/labels/aggregate-labels) - Label measures and aggregates
- [Total Labels](/examples/labels/total-labels) - Label ALL totals
