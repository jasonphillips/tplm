# Labels combined with WHERE clause
---
input: TABLE WHERE year >= 2018 ROWS state[-5@births.sum] 'US State' * name[-3] 'Name' * births.sum COLS year ASC;
---
expected_structure:
  row_dimensions: [state, name]
  col_dimensions: [year]
  aggregates: [births_sum]
  query_count: 1
---
expected_malloy_contains:
  - where: `year` >= 2018
  - group_by: `US State` is state
  - group_by: `Name` is name
  - order_by: births_sum desc
