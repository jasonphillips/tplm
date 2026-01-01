# Simple WHERE clause filtering
---
input: TABLE WHERE gender = 'M' ROWS state[-5] * births.sum;
---
expected_structure:
  row_dimensions: [state]
  aggregates: [births_sum]
  query_count: 1
---
expected_malloy_contains:
  - where: gender = 'M'
  - group_by: state
  - births_sum is births.sum()
