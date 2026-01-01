# Different aggregates per branch: state gets sum, gender gets min
# Expected: side labels, single agg column that shows different agg per row
---
input: TABLE ROWS (state[-3] * births.sum) | (gender * births.min) COLS year[-2];
---
expected_structure:
  row_dimensions: [state, gender]  # These share a column position
  col_dimensions: [year]
  aggregates: [births_sum, births_min]  # Different agg per branch
  query_count: 2
  side_label_style: true
---
expected_output: |
  |       |      | 2022     | 2021     |
  |-------|------|----------|----------|
  | state | CA   | sum:...  | sum:...  |
  | state | TX   | sum:...  | sum:...  |
  | state | NY   | sum:...  | sum:...  |
  | gender| M    | min:...  | min:...  |
  | gender| F    | min:...  | min:...  |
