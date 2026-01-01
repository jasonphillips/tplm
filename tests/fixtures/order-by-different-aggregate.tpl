# Order by one aggregate while displaying a different aggregate
# Compiler should automatically add the ordering aggregate to the query
---
input: TABLE ROWS occupation DESC@income.sum COLS education * income.mean;
---
expected_structure:
  row_dimensions: [occupation]
  col_dimensions: [education]
  aggregates: [income_mean]
  query_count: 1
---
expected_malloy_contains:
  - order_by: income_sum desc
  - income_mean is income.avg()
  - income_sum is income.sum()
