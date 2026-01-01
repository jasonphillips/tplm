# Nested row dimensions with custom labels
---
input: TABLE ROWS state[-3] 'US State' * name[-2] 'Given Name' * births.sum COLS year[-3];
---
expected_structure:
  row_dimensions: [state, name]
  col_dimensions: [year]
  aggregates: [births_sum]
  query_count: 1
---
expected_malloy_contains:
  - group_by: `US State` is state
  - group_by: `Given Name` is name
  - nest: by_name is
