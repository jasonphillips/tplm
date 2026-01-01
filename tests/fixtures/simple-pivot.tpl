# Simple pivot: one row dimension, one column dimension
# Expected: state rows with year columns
---
input: TABLE ROWS state[-5] * births.sum COLS year[-3];
---
expected_structure:
  row_dimensions: [state]
  col_dimensions: [year]
  aggregates: [births_sum]
  query_count: 1
---
expected_output: |
  |       | 2022 | 2021 | 2020 | Total |
  |-------|------|------|------|-------|
  | CA    | ...  | ...  | ...  | ...   |
  | TX    | ...  | ...  | ...  | ...   |
  | NY    | ...  | ...  | ...  | ...   |
  | FL    | ...  | ...  | ...  | ...   |
  | IL    | ...  | ...  | ...  | ...   |
