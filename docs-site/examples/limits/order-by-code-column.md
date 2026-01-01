# Order by Underlying Code

When dimension labels are derived from numeric codes, alphabetic sorting gives incorrect results. Order by the underlying code to get the natural progression.

## The Problem

Consider `education_detail` which maps numeric education levels to labels:

```malloy
education_detail is
  pick '<HS' when educ < 12
  pick 'HS graduate' when educ = 12
  pick 'Some College' when educ >= 13 and educ <= 15
  pick 'College Grad' when educ = 16
  pick 'Some Graduate' when educ >= 17
  else null
```

**Alphabetically sorted:** `<HS`, `College Grad`, `HS graduate`, `Some College`, `Some Graduate`

**Natural order (by education level):** `<HS`, `HS graduate`, `Some College`, `College Grad`, `Some Graduate`

## Interactive Example

<Playground
  initial-query="TABLE
  ROWS education_detail ASC@educ.min
  COLS gender * income.sum
;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="4"
  label="Try It"
  :variations="[
    { label: 'Wrong: alphabetic order', query: 'TABLE\n  ROWS education_detail\n  COLS gender * income.sum\n;' },
    { label: 'Correct: order by code', query: 'TABLE\n  ROWS education_detail ASC@educ.min\n  COLS gender * income.sum\n;' },
    { label: 'Descending (most educated first)', query: 'TABLE\n  ROWS education_detail DESC@educ.min\n  COLS gender * income.sum\n;' },
    { label: 'Occupation by code order', query: 'TABLE\n  ROWS occupation ASC@occup.min\n  COLS gender * income.sum\n;' }
  ]"
/>

## Query Breakdown

- `TABLE` - Declares a crosstab table statement
- `ROWS education_detail ASC@educ.min` - Education labels ordered by underlying code
  - `education_detail` - The string label dimension derived from `educ`
  - `ASC` - Ascending order (lowest code values first)
  - `@educ.min` - Order by the minimum `educ` value for each group
- `COLS gender * income.sum` - Column breakdown by gender
- `income.sum` - Measure: sum of income for each cell

## Setting Up Your Malloy Model

To enable this pattern, expose the underlying code column in your Malloy model:

```malloy
source: samples is duckdb.table('data.csv') extend {
  // The display label
  dimension: education_detail is
    pick '<HS' when educ < 12
    pick 'HS graduate' when educ = 12
    pick 'Some College' when educ >= 13 and educ <= 15
    pick 'College Grad' when educ = 16
    pick 'Some Graduate' when educ >= 17
    else null

  // Expose the underlying code for ordering
  // (educ is already a column, but you could also create a computed order field)
}
```

Then in TPL, use `@educ.min` (or `.max`) to order by the code values.

## Related Examples

- [Order by Value](/examples/limits/order-by-value) - Order by aggregated values
- [Order by Different Aggregate](/examples/limits/order-by-different-aggregate) - Sort by one measure, display another
- [Alphabetic Limit](/examples/limits/row-limit-alpha) - Default alphabetic ordering
