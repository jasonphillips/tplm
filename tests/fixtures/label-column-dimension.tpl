# Column dimension with custom label
---
input: TABLE ROWS state[-5] * births.sum COLS year[-3] 'Year';
---
expected_structure:
  row_dimensions: [state]
  col_dimensions: [year]
  aggregates: [births_sum]
  query_count: 1
---
expected_malloy_contains:
  - group_by: `Year` is `year`
  - nest: by_year is
