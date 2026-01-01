# Order by aggregate without limit (default DESC)
# Shows all rows ordered by aggregate value, highest first
---
input: TABLE ROWS occupation DESC@income.sum COLS education * income.sum;
---
expected_structure:
  row_dimensions: [occupation]
  col_dimensions: [education]
  aggregates: [income_sum]
  query_count: 1
---
expected_malloy_contains:
  - order_by: income_sum desc
  - limit: 100000
