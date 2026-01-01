# Subtotals: (gender ALL) within state gives subtotal per state
# Expected: state > gender rows with subtotal after each state's genders
---
input: TABLE ROWS state[-2] * (gender | ALL) * births.sum COLS year[-2];
---
expected_structure:
  row_dimensions: [state, gender]
  col_dimensions: [year]
  aggregates: [births_sum]
  query_count: 2
  has_subtotals: true
---
expected_output: |
  | state | gender | 2022 | 2021 |
  |-------|--------|------|------|
  | CA    | M      | ...  | ...  |
  | CA    | F      | ...  | ...  |
  | CA    | All    | ...  | ...  |  <- subtotal
  | TX    | M      | ...  | ...  |
  | TX    | F      | ...  | ...  |
  | TX    | All    | ...  | ...  |  <- subtotal
