# Order by aggregate without explicit direction (defaults to DESC)
# Syntax: field@aggregate (no ASC/DESC keyword)
---
input: TABLE ROWS occupation@income.sum COLS education * income.sum;
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
