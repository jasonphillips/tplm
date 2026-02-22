# Distinct Count

Count the number of unique values in a field using `field.count`.

## How It Works

TPL has two forms of count:

| Syntax | Meaning | SQL Equivalent |
|--------|---------|---------------|
| `n` or `count` | Row count | `COUNT(*)` |
| `field.count` | Distinct count of field values | `COUNT(DISTINCT field)` |

When you bind `count` to a field (e.g., `occupation.count`), it counts the number of **unique** values of that field within each group. Standalone `count` or `n` counts the total number of rows.

## Interactive Example

<Playground
  initial-query="TABLE ROWS education * (n | occupation.count);"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="1"
  label="Try It"
  :variations="[
    { label: 'Distinct count only', query: 'TABLE ROWS education * occupation.count;' },
    { label: 'Multiple distinct counts', query: 'TABLE ROWS education * (occupation.count | gender.count);' },
    { label: 'With crosstab', query: 'TABLE ROWS education * occupation.count COLS gender;' },
    { label: 'Top N by distinct count', query: 'TABLE ROWS education[-5@occupation.count] * occupation.count;' }
  ]"
/>

## Query Breakdown

- `n` - Row count: how many rows exist for each education level
- `occupation.count` - Distinct count: how many **unique** occupations appear in each education level
- The row count will always be >= the distinct count

This is useful for understanding data cardinality, e.g.:
- How many unique users per region
- How many distinct products per category
- How many unique event types per session

## Ordering by Distinct Count

You can order and limit rows by distinct count, just like any other aggregate:

```sql
-- Top 5 education levels by number of distinct occupations
TABLE ROWS education[-5@occupation.count] * occupation.count;

-- All education levels ordered by distinct occupation count (descending)
TABLE ROWS education DESC@occupation.count * occupation.count;
```

## Distinct Count with Percentages

Combine distinct count with `ACROSS` to see each group's share of unique values:

```sql
TABLE ROWS education * (occupation.count ACROSS);
```

## Related Examples

- [Multiple Aggregates](/examples/core/multiple-aggregates) - Side-by-side aggregations
- [Measure Binding](/examples/advanced/measure-binding) - Bind multiple aggs to a measure
- [Limit by Value](/examples/limits/limit-by-value) - Top-N ordering
