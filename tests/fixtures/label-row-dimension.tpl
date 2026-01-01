# Row dimension with custom label
---
input: TABLE ROWS state[-5] 'US State' * births.sum COLS year[-3];
---
expected_structure:
  row_dimensions: [state]
  col_dimensions: [year]
  aggregates: [births_sum]
  query_count: 1
---
expected_malloy_contains:
  - group_by: `US State` is state
  - order_by: `US State` desc
  - limit: 5
