# Dimension concatenation: state and gender as alternatives at same level
# Expected: side labels showing which dimension, single value column
---
input: TABLE ROWS (state[-3] | gender) * births.sum COLS year[-2];
---
expected_structure:
  row_dimensions: [state, gender]  # These share a column position
  col_dimensions: [year]
  aggregates: [births_sum]
  query_count: 2
  side_label_style: true
---
expected_output: |
  |       |      | 2022 | 2021 |
  |-------|------|------|------|
  | state | CA   | ...  | ...  |
  | state | TX   | ...  | ...  |
  | state | NY   | ...  | ...  |
  | gender| M    | ...  | ...  |
  | gender| F    | ...  | ...  |
