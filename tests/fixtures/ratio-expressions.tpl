# Ratio expressions for ordering dimensions
# Uses ACROSS syntax: field.agg ACROSS dim to compute percentage vs aggregate at parent level
# e.g., births.sum ACROSS name computes births as % of total across all names
#
# IMPORTANT: all() in Malloy aggregates up to the PARENT level in nested queries.
# With state * name structure (state outer, name nested):
#   - all(births.sum()) at name level gives STATE totals
#   - births.sum() / all(births.sum()) = "% of state"
#
# IMPLICIT RATIOS:
# births.sum ACROSS name automatically expands to: births.sum / births.sum ACROSS name
# For explicit different-measure ratios: a.sum / b.sum ACROSS name
#
# CROSS-DIMENSIONAL RATIOS:
# When ACROSS specifies an OUTER dimension (e.g., name * state ACROSS name),
# the compiler automatically INVERTS the query structure so that all() gives
# the correct totals. Results are then reorganized for display.
#
# This query finds: for each state, top 3 names by % of that state's births
---
input: TABLE ROWS state * name[-3@(births.sum ACROSS name)] COLS births.sum;
---
expected_structure:
  row_dimensions: [state, name]
  aggregates: [births_sum]
  query_count: 1
---
expected_malloy_contains:
  - group_by: state
  - group_by: name
  - ratio_births_sum_by_births_sum_over_name is births.sum() / all(births.sum())
  - order_by: ratio_births_sum_by_births_sum_over_name desc
  - limit: 3
