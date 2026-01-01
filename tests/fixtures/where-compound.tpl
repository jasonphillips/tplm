# WHERE clause with compound condition (reserved words auto-escaped)
---
input: TABLE WHERE gender = 'F' and year >= 2018 ROWS state[-5] * births.sum;
---
expected_structure:
  row_dimensions: [state]
  aggregates: [births_sum]
  query_count: 1
---
expected_malloy_contains:
  - where: gender = 'F' and `year` >= 2018
  - group_by: state
