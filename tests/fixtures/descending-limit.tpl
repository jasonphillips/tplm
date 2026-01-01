# Descending limit: [-5] gives last 5 alphabetically (descending order)
# For ordering by aggregate, use explicit @aggregate syntax: state[-5@births.sum]
---
input: TABLE ROWS state[-5] * births.sum COLS year[-3];
---
expected_structure:
  row_dimensions: [state]
  col_dimensions: [year]
  aggregates: [births_sum]
  query_count: 1
---
expected_malloy_contains:
  - order_by: state desc
  - limit: 5
