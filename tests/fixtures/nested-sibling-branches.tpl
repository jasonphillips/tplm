# Nested sibling branches with different labels for same dimension
# Expected: 2 queries, header shows generic "state" since labels differ
---
input: TABLE ROWS name[-5@births.sum] 'given name' * (state[-3@births.sum] 'Top States' | state[3@births.sum] 'Bottom States') COLS year[-3] * births.sum;
---
expected_structure:
  row_dimensions: [name, state]
  col_dimensions: [year]
  aggregates: [births_sum]
  query_count: 2
---
expected_malloy_contains:
  - group_by: `given name` is name
  - group_by: `Top States` is state
  - group_by: `Bottom States` is state
  - order_by: births_sum desc
  - order_by: births_sum asc
