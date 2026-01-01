# WHERE clause with year filter (reserved word auto-escaped)
---
input: TABLE WHERE year > 2015 ROWS state[-5] * births.sum COLS year[-3];
---
expected_structure:
  row_dimensions: [state]
  col_dimensions: [year]
  aggregates: [births_sum]
  query_count: 1
---
expected_malloy_contains:
  - where: `year` > 2015
  - group_by: state
  - births_sum is births.sum()
