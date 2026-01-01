# Interactive Playground

Experiment with TPLm queries in your browser. All queries run locally using DuckDB WASM with a sample employment survey dataset.

## Dataset Schema

The `samples` dataset contains employment survey data with the following fields:

- **Dimensions**: `occupation`, `education`, `gender`, `custtype`, `size`
- **Measures**: `income`, `record_count`

## Try These Examples

<Playground
  initial-query="TABLE ROWS occupation * income.sum;"
  :show-tabs="true"
  :show-timing="true"
  :editor-rows="2"
  label="Simple Table"
/>

<Playground
  initial-query="TABLE ROWS occupation * income.sum COLS education;"
  :show-tabs="true"
  :show-timing="true"
  :editor-rows="2"
  label="Basic Crosstab"
/>

<Playground
  initial-query="TABLE
  ROWS occupation[-5@income.sum] * (gender | ALL) * income.(sum | mean)
  COLS education | ALL;"
  :show-tabs="true"
  :show-timing="true"
  :editor-rows="4"
  label="Advanced Example"
/>

## Build Your Own

Start with a blank canvas and create your own TPLm query:

<Playground
  initial-query="TABLE ROWS occupation * income.sum COLS education;"
  :show-tabs="true"
  :show-timing="true"
  :editor-rows="6"
  label="Custom Query"
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
