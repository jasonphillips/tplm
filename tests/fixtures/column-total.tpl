# Column total using ALL on column axis
# Note: With concat syntax, ALL creates a separate query branch that gets merged
# Future enhancement: ALL on columns could be rendered as a total column within pivot
---
input: TABLE ROWS state[-3] * births.sum COLS year[-3] | ALL;
---
expected_structure:
  row_dimensions: [state]
  col_dimensions: [year]
  aggregates: [births_sum]
  query_count: 2
  has_col_total: true
---
expected_output: |
  | state | 2022 | 2021 | 2020 | Total |
  |-------|------|------|------|-------|
  | CA    | ...  | ...  | ...  | ...   |
  | TX    | ...  | ...  | ...  | ...   |
  | NY    | ...  | ...  | ...  | ...   |
