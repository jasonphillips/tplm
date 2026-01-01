# Deep nesting with ACROSS ratio on innermost dimension
# ACROSS name references an outer dimension, so query should be inverted
---
input: TABLE ROWS name * gender * state[-5@(births.sum ACROSS name)] "US State" COLS births.sum;
---
expected_structure:
  row_dimensions: [name, gender, state]
  aggregates: [births_sum]
  query_count: 1
---
expected_malloy_contains:
  - Query inverted for cross-dimensional ratio
  - ratio_births_sum_by_births_sum_over_name is births.sum() / all(births.sum())
