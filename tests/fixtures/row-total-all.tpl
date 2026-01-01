# Row total using ALL: shows detailed rows plus total row
# Expected: state rows followed by Total row
---
input: TABLE ROWS (state[-3] | ALL) * births.sum COLS year[-2];
---
expected_structure:
  row_dimensions: [state]
  col_dimensions: [year]
  aggregates: [births_sum]
  query_count: 2
  has_row_total: true
---
expected_output: |
  | state | 2022 | 2021 |
  |-------|------|------|
  | CA    | ...  | ...  |
  | TX    | ...  | ...  |
  | NY    | ...  | ...  |
  | Total | ...  | ...  |
