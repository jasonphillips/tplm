# Sibling row dimensions with custom labels (TABULATE style)
---
input: TABLE ROWS state[-5] 'US State' | gender 'Gender' | ALL COLS year[-3] * births.sum;
---
expected_structure:
  row_dimensions: [state, gender]
  col_dimensions: [year]
  aggregates: [births_sum]
  query_count: 3
  has_row_total: true
  side_label_style: true
---
expected_malloy_contains:
  - group_by: `US State` is state
  - group_by: `Gender` is gender
