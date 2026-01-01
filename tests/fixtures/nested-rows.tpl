# Nested row dimensions: state then gender within state
# Expected: hierarchical rows with state > gender
---
input: TABLE ROWS state[-3] * gender * births.sum COLS year[-2];
---
expected_structure:
  row_dimensions: [state, gender]
  col_dimensions: [year]
  aggregates: [births_sum]
  query_count: 1
---
expected_output: |
  | state | gender | 2022 | 2021 |
  |-------|--------|------|------|
  | CA    | M      | ...  | ...  |
  | CA    | F      | ...  | ...  |
  | TX    | M      | ...  | ...  |
  | TX    | F      | ...  | ...  |
  | NY    | M      | ...  | ...  |
  | NY    | F      | ...  | ...  |
