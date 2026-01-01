# Multiple aggregates on rows: should combine into each query, not multiply
# Expected: 6 queries (3 row branches × 2 col branches), each with both aggregates
# Use binding syntax births.(sum | mean) to combine aggregates, not concat
---
input: TABLE ROWS (state[-5] | gender | ALL) * births.(sum | mean) COLS year[-3] | ALL;
---
expected_structure:
  row_dimensions: [state, gender]
  col_dimensions: [year]
  aggregates: [births_sum, births_mean]
  query_count: 6
  has_row_total: true
  has_col_total: true
---
expected_malloy_contains:
  - births_sum is births.sum()
  - births_mean is births.avg()
