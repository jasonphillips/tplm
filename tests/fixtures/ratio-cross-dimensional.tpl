# Cross-dimensional ratio expressions
# When ACROSS specifies an OUTER dimension, the compiler inverts the query
# to compute the ratio correctly using Malloy's all() function.
#
# Example: name * state[-3@(births.sum ACROSS name)]
#   - User wants: name -> state display
#   - Ratio needs: % of STATE (births in state for name / total state births)
#   - Since ACROSS name is outer, compiler inverts to: state -> name
#   - all() at name level then gives state totals correctly
#   - Results are reorganized for intended display
---
input: TABLE ROWS name[-5] * state[-3@(births.sum ACROSS name)] COLS births.sum;
---
expected_structure:
  # Note: row_dimensions reflects the DISPLAY order (user's intent)
  # Query order is inverted (state->name) but display order is preserved (name->state)
  row_dimensions: [name, state]
  aggregates: [births_sum]
  query_count: 1
---
expected_malloy_contains:
  - Query inverted for cross-dimensional ratio
  - Results will be reorganized to display
  - group_by: state
  - nest: by_name is
  - group_by: name
  - ratio_births_sum_by_births_sum_over_name is births.sum() / all(births.sum())
  - order_by: ratio_births_sum_by_births_sum_over_name desc
  - limit: 1000
