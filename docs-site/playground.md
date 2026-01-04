# Interactive Playground

Experiment with TPLm queries in your browser. All queries run locally using DuckDB WASM with a sample employment survey dataset.

## Query Editor

Write your TPL query and click Run to see results:

<Playground
  initial-query="TABLE ROWS occupation[5] * income.sum COLS education;"
  :show-tabs="true"
  :show-timing="true"
  :editor-rows="4"
  label="TPL Query"
/>

## Dimension Definitions

Expand this section to view or customize the computed dimensions. Changes apply to all queries on this page.

<DimensionsEditor />

::: tip Definition Order
Notice how `occupation[5]` returns the first 5 occupations by *definition order* (Managerial, Professional, Technical...) rather than alphabetically. TPL automatically detects pick expressions and sorts by declaration order.
:::

## More Examples

<Playground
  initial-query="TABLE ROWS occupation * income.sum;"
  :show-tabs="true"
  :editor-rows="2"
  label="Simple Table"
/>

<Playground
  initial-query="TABLE ROWS occupation * income.sum COLS education;"
  :show-tabs="true"
  :editor-rows="2"
  label="Basic Crosstab"
/>

<Playground
  initial-query="TABLE
  ROWS occupation[-5@income.sum] * (gender | ALL) * income.(sum | mean)
  COLS education | ALL;"
  :show-tabs="true"
  :editor-rows="4"
  label="Advanced Example"
/>

## Quick Reference

### Basic Structure
```sql
TABLE [FROM source] [WHERE condition]
      ROWS <row-axis>
      [COLS <column-axis>];
```

### Common Patterns

#### Nesting (*)
```sql
-- Each state contains cities
state * city
```

#### Concatenation (|)
```sql
-- State section followed by gender section
state | gender
```

#### Totals (ALL)
```sql
-- Row with total
(state | ALL)

-- Column with total
COLS year | ALL
```

#### Limits and Ordering
```sql
-- Top 10 by value
state[-10@births.sum]

-- Bottom 5 alphabetically
state[5]
```

#### Percentages (ACROSS)
```sql
-- Row percentages (each row sums to 100%)
income.sum ACROSS COLS

-- Column percentages
income.sum ACROSS ROWS

-- Cell percentages
income.sum ACROSS
```

## More Examples

Explore categorized examples in the sidebar:
- [Core Concepts](/examples/core/basic-crosstab) - Basic building blocks
- [Totals](/examples/totals/row-total) - Marginals and subtotals
- [Limits](/examples/limits/limit-by-value) - Top N and ordering
- [Percentages](/examples/percentages/row-percentages) - Ratio calculations
- [Advanced](/examples/advanced/complex-crosstab) - Complex patterns
