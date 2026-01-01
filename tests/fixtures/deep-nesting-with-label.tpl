# Deep nesting with label on innermost dimension
# When innermost dim has limit, compiler flattens outer dims and nests the limited dim
---
input: TABLE ROWS name * gender * state[-5] "US State" COLS births.sum;
---
expected_structure:
  row_dimensions: [name, gender, state]
  aggregates: [births_sum]
  query_count: 1
---
expected_malloy_contains:
  - group_by: name, gender
  - nest: by_state is
  - group_by: `US State` is state
  - limit: 5
