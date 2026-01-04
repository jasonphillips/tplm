# Order by Underlying Code

::: warning Deprecated Pattern
When using TPL-native `DIMENSION` syntax, **definition order is automatic**. You don't need to use `@column.min` for dimensions defined with `DIMENSION` - they will already sort in the order you defined the buckets.

This page documents ordering by underlying code for **advanced cases** or when using raw Malloy models without `DIMENSION` syntax.
:::

## The Modern Solution: Use DIMENSION Syntax

Define your dimension with `DIMENSION` syntax and the order is automatic:

```tpl
DIMENSION education_detail FROM educ
  '<HS' WHEN < 12
  'HS graduate' WHEN = 12
  'Some College' WHEN >= 13 AND <= 15
  'College Grad' WHEN = 16
  'Some Graduate' WHEN >= 17
  ELSE NULL
;

TABLE ROWS education_detail * income.sum;
```

The results will appear in definition order: `<HS`, `HS graduate`, `Some College`, `College Grad`, `Some Graduate`.

## Legacy Pattern: @column.min

For dimensions defined in Malloy models (not `DIMENSION` syntax), alphabetic sorting gives incorrect results:

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

For these cases, use `@column.min` to order by the underlying code.

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

## When You Still Need This

Use `@column.min` ordering when:

1. **Using raw Malloy models** - dimensions defined in Malloy (not TPL `DIMENSION` syntax) don't have definition order metadata
2. **Ordering by a different column** - e.g., sorting product names by product_id
3. **Complex ordering logic** - when definition order isn't the natural order

For new development, prefer `DIMENSION` syntax for automatic definition-order sorting.

## Related Examples

- [Order by Value](/examples/limits/order-by-value) - Order by aggregated values
- [Order by Different Aggregate](/examples/limits/order-by-different-aggregate) - Sort by one measure, display another
- [Alphabetic Limit](/examples/limits/row-limit-alpha) - Default alphabetic ordering
