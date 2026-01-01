# Order by aggregate ascending without limit
# Shows all rows ordered by aggregate value, lowest first
---
input: TABLE ROWS occupation ASC@income.sum COLS education * income.sum;
---
expected_structure:
  row_dimensions: [occupation]
  col_dimensions: [education]
  aggregates: [income_sum]
  query_count: 1
---
expected_malloy_contains:
  - order_by: income_sum asc
  - limit: 100000
