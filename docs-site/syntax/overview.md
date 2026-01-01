# TPLm Syntax Overview

TPLm (Table Producing Language for Malloy) uses a declarative syntax to define cross-tabulated tables.

## Basic Structure

```sql
TABLE [FROM source] [WHERE condition] ROWS <row-axis> [COLS <column-axis>];
```

### Components

- **FROM** (optional): Malloy source name to query (see [Data Sources](#data-sources))
- **WHERE** (optional): Filter condition (passed through to Malloy)
- **ROWS**: Row axis definition (required)
- **COLS**: Column axis definition (optional)

## Examples

### Simple Table

Create a basic table with one dimension:

<Playground
  initial-query="TABLE ROWS occupation * income.sum;"
  :auto-run="true"
  :editor-rows="1"
  label="Simple Table"
/>

### Crosstab

Cross rows with columns to create a pivot table:

<Playground
  initial-query="TABLE ROWS occupation * income.sum COLS education;"
  :auto-run="true"
  :editor-rows="1"
  label="Basic Crosstab"
/>

### With Totals

Add row and column totals using `ALL`:

<Playground
  initial-query="TABLE
  ROWS (occupation | ALL) * income.sum
  COLS education | ALL;"
  :auto-run="true"
  :editor-rows="3"
  label="With Totals"
/>

## Quick Reference

| Syntax | Meaning | Example |
|--------|---------|---------|
| `*` or `BY` | Cross (nesting) | `state * city` or `state BY city` |
| `\|` or `THEN` | Concatenate | `state \| gender` or `state THEN gender` |
| `ALL` | Total row/column | `(state \| ALL)` |
| `[-N]` | Top N (descending) | `state[-10]` |
| `[N]` | Top N (ascending) | `state[10]` |
| `@field` | Order by field | `state[-10@births.sum]` |
| `:format` | Number format | `income.sum:currency` |
| `"label"` | Custom label | `state "US State"` |
| `ACROSS` | Percentage | `income.sum ACROSS COLS` |

## Core Operators

### Nesting (`*` or `BY`)

The `*` operator creates hierarchical relationships:

<Playground
  initial-query="TABLE ROWS occupation * gender * income.sum;"
  :auto-run="true"
  :editor-rows="1"
  label="Nested Dimensions"
/>

Each occupation contains a breakdown by gender.

::: tip Alternative Syntax
You can use `BY` instead of `*` for a more semantic feel: `occupation BY gender BY income.sum`
:::

### Concatenation (`|` or `THEN`)

The `|` operator creates side-by-side sections:

<Playground
  initial-query="TABLE ROWS (occupation | gender) * income.sum;"
  :auto-run="true"
  :editor-rows="1"
  label="Concatenated Sections"
/>

Occupation section appears first, followed by gender section.

::: tip Alternative Syntax
You can use `THEN` instead of `|` for a more semantic feel: `occupation THEN gender`
:::

### Using Alternative Syntax

The `BY` and `THEN` keywords can make complex queries more readable:

```sql
-- Traditional syntax
TABLE ROWS occupation * gender * income.sum COLS education | ALL;

-- Alternative syntax - same result
TABLE ROWS occupation BY gender BY income.sum COLS education THEN ALL;
```

Both operators work everywhere, including in aggregation lists: `income.(sum THEN mean)` is equivalent to `income.(sum | mean)`.

## Aggregations

### Single Aggregation

Bind a measure to an aggregation method:

```sql
TABLE ROWS occupation * income.sum;
TABLE ROWS occupation * income.mean;
TABLE ROWS occupation * income.count;
```

### Multiple Aggregations

Show multiple statistics side by side:

<Playground
  initial-query="TABLE ROWS occupation * income.(sum | mean);"
  :auto-run="true"
  :editor-rows="1"
  label="Multiple Aggregates"
/>

### Available Aggregations

- `sum` - Sum of values
- `mean` / `avg` - Average
- `count` / `n` - Row count
- `min` / `max` - Minimum / Maximum
- `median` - Median value
- `stdev` - Standard deviation

## Limits and Ordering

### Alphabetic Limits

```sql
state[10]     -- First 10 alphabetically (A-J)
state[-10]    -- Last 10 alphabetically (Q-Z)
```

### Value-Based Ordering

<Playground
  initial-query="TABLE ROWS occupation[-5@income.sum] * income.sum;"
  :auto-run="true"
  :editor-rows="1"
  label="Top N by Value"
/>

Orders occupations by income and shows top 5.

### Order Without Limit

Show all values in a specific order:

```sql
occupation@income.sum          -- All, ordered by income (desc)
occupation ASC@income.sum      -- All, ordered by income (asc)
```

## Totals

### Row Totals

<Playground
  initial-query="TABLE ROWS (occupation | ALL 'Total') * income.sum;"
  :auto-run="true"
  :editor-rows="1"
  label="Row Total"
/>

### Column Totals

<Playground
  initial-query="TABLE ROWS occupation * income.sum COLS education | ALL 'Total';"
  :auto-run="true"
  :editor-rows="1"
  label="Column Total"
/>

### Subtotals

<Playground
  initial-query="TABLE ROWS occupation * (gender | ALL 'Both') * income.sum;"
  :auto-run="true"
  :editor-rows="1"
  label="Subtotals"
/>

## Percentages

### Row Percentages

Each row sums to 100%:

<Playground
  initial-query="TABLE ROWS occupation * (income.sum ACROSS COLS) COLS education;"
  :auto-run="true"
  :editor-rows="1"
  label="Row Percentages"
/>

### Column Percentages

Each column sums to 100%:

```sql
TABLE ROWS occupation * (income.sum ACROSS ROWS) COLS education;
```

### Cell Percentages

Each cell as percentage of grand total:

```sql
TABLE ROWS occupation * (income.sum ACROSS) COLS education;
```

## Formatting

### Built-in Formats

```sql
income.sum:currency    -- $1,234.56
income.sum:integer     -- 1,235
income.sum:decimal.2   -- 1234.57
income.sum:percent     -- 45.6%
income.sum:comma.0     -- 1,235
```

<Playground
  initial-query="TABLE ROWS occupation * income.sum:currency COLS education;"
  :auto-run="true"
  :editor-rows="1"
  label="Currency Format"
/>

### Custom Formats

Use `#` as a placeholder for the number, with `.N` to specify decimal places:

```sql
income.sum:'$ #.2'       -- $ 1,234.57
income.sum:'€ #.2'       -- € 1,234.57
income.sum:'#.0 units'   -- 1,235 units
income.sum:'#.1%'        -- 45.7%
income.sum:'$ #.2 M'     -- $ 1.23 M (for millions)
```

<Playground
  initial-query="TABLE ROWS occupation * income.sum:'$ #.2' COLS education;"
  :auto-run="true"
  :editor-rows="1"
  label="Custom Format"
/>

## Labels

Add custom labels to any element:

<Playground
  initial-query="TABLE ROWS occupation 'Job Type' * income.sum 'Total Income' COLS education 'Education Level';"
  :auto-run="true"
  :editor-rows="1"
  label="Custom Labels"
/>

## Filters

Filter data with WHERE:

<Playground
  initial-query="TABLE WHERE gender = 'Male' ROWS occupation * income.sum;"
  :auto-run="true"
  :editor-rows="1"
  label="WHERE Filter"
/>

## Data Sources

TPLm queries a Malloy source, which can be defined from a CSV, Parquet file, or database table.

### Specifying the Source in TPL

Use the `FROM` clause to specify which Malloy source to query:

```sql
TABLE FROM sales ROWS region * revenue.sum COLS quarter;
```

### How It Works

1. **Malloy Source Definition** - Defines the raw data table and any computed dimensions/measures
2. **FROM Clause** - Tells TPLm which source to query
3. **Generated Query** - TPLm compiles to `run: sales -> { ... }`

### Example Malloy Source

```malloy
source: sales is duckdb.table('data/sales.csv') extend {
  dimension:
    quarter is concat('Q', floor((month - 1) / 3 + 1)::string)

  measure:
    total_revenue is revenue.sum()
}
```

With this source, your TPL can reference `quarter` and `total_revenue`:

```sql
TABLE FROM sales ROWS region * total_revenue COLS quarter;
```

See the [Quick Start guide](/getting-started/quick-start#connecting-to-data-sources) for complete examples.

## Next Steps

Explore detailed examples:

- [Core Concepts](/examples/core/basic-crosstab) - Nesting, concatenation, aggregates
- [Totals](/examples/totals/row-total) - Row and column totals with ALL
- [Limits](/examples/limits/limit-by-value) - Top N by value
- [Percentages](/examples/percentages/row-percentages) - ACROSS for ratios
- [Formatting](/examples/formatting/currency-format) - Number formats
- [Advanced](/examples/advanced/complex-crosstab) - Full-featured tables
