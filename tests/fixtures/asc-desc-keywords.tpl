# ASC/DESC keywords for ordering without limits
---
input: TABLE ROWS state DESC 'State' * births.sum COLS year ASC;
---
expected_structure:
  row_dimensions: [state]
  col_dimensions: [year]
  aggregates: [births_sum]
  query_count: 1
---
expected_malloy_contains:
  - group_by: `State` is state
  - order_by: `State` desc
  - order_by: `year` asc
