# Quick Start

Get started with TPL in 5 minutes.

## What is TPL?

TPL is a **unified language** for defining complex tables. You describe both the **layout** (rows, columns, nesting, totals) and the **data** (dimensions, aggregations, filters) in one declaration. TPL compiles to efficient queries, executes them, and renders the result.

Built on [Malloy](https://www.malloydata.dev/). Runs on DuckDB or BigQuery.

## Try it Online

The fastest way to try TPL is in the [interactive playground](/playground), which runs entirely in your browser.

::: tip Playground Data
The playground comes with pre-configured dimensions and measures for the sample datasets. See [Data Model Configuration](/getting-started/data-model) for details on how these are set up.
:::

## Installation

Install TPLm via npm:

```bash
npm install tplm-lang
```

## Basic Example

Query a CSV file directly - no configuration required:

```typescript
import { fromCSV } from 'tplm-lang'

const tpl = fromCSV('data/employees.csv')

const { html } = await tpl.query(
  'TABLE ROWS department * salary.sum COLS gender;'
)

console.log(html)
```

## Your First Query

Try this example in the playground:

<Playground
  initial-query="TABLE ROWS occupation COLS education * income.sum;"
  :auto-run="true"
  :show-tabs="true"
  label="Basic Crosstab"
/>

This creates a crosstab showing income by occupation (rows) and education (columns).

## Basic Syntax

### Table Structure

```sql
TABLE ROWS <row-axis> [COLS <column-axis>];
```

Every TPL statement starts with `TABLE`, followed by row and column definitions.

### Nesting with `*`

The `*` operator creates hierarchical nesting:

```sql
-- occupation contains gender breakdown
TABLE ROWS occupation * gender * income.sum;
```

### Concatenation with `|`

The `|` operator creates side-by-side sections:

```sql
-- separate occupation and gender sections
TABLE ROWS occupation | gender;
```

### Aggregations

TPL supports many aggregation methods:

```sql
TABLE ROWS occupation * income.sum;           -- sum
TABLE ROWS occupation * income.mean;          -- average
TABLE ROWS occupation * income.(sum | mean);  -- multiple aggregates
TABLE ROWS occupation * income.p50;           -- median (50th percentile)
TABLE ROWS occupation * income.(p25 | p50 | p75);  -- interquartile range
TABLE ROWS occupation * n;                    -- count of records
```

### Totals with `ALL`

Add total rows or columns:

```sql
-- row total
TABLE ROWS (occupation | ALL) * income.sum;

-- column total
TABLE ROWS occupation * income.sum COLS education | ALL;
```

## Data Sources

### Query a CSV File

```typescript
import { fromCSV } from 'tplm-lang'

const tpl = fromCSV('data/employees.csv')
const { html } = await tpl.query('TABLE ROWS department * salary.sum;')
```

### Query a Parquet File

```typescript
import { fromDuckDBTable } from 'tplm-lang'

const tpl = fromDuckDBTable('data/sales.parquet')
const { html } = await tpl.query('TABLE ROWS region * revenue.sum COLS quarter;')
```

### Query BigQuery Directly

```typescript
import { fromBigQueryTable } from 'tplm-lang'

const tpl = fromBigQueryTable({
  table: 'my-project.my_dataset.sales',
  credentialsPath: './service-account.json'
})

const { html } = await tpl.query('TABLE ROWS region * revenue.sum COLS quarter;')
```

## Adding Computed Dimensions

TPL provides a `DIMENSION` syntax for defining computed dimensions that transform raw column values:

```tpl
DIMENSION department FROM dept_code
  'Engineering' WHEN = 1
  'Sales' WHEN = 2
  ELSE 'Other'
;

DIMENSION seniority FROM years
  'Junior' WHEN < 2
  'Mid' WHEN >= 2 AND < 5
  'Senior' WHEN >= 5
;
```

Pass dimension definitions to `fromCSV` to use them in your queries:

```typescript
const dimensions = `
DIMENSION department FROM dept_code
  'Engineering' WHEN = 1
  'Sales' WHEN = 2
  ELSE 'Other'
;

DIMENSION seniority FROM years
  'Junior' WHEN < 2
  'Mid' WHEN >= 2 AND < 5
  'Senior' WHEN >= 5
;
`

const tpl = fromCSV('employees.csv', { dimensions })

// Now use computed dimensions in your queries
const { html } = await tpl.query('TABLE ROWS department * seniority * salary.sum;')
```

Computed dimensions work with all TPL features including percentiles:

```typescript
// Percentiles partition correctly by the underlying raw columns
const { html } = await tpl.query('TABLE ROWS department * salary.p50;')
```

## Common Patterns

### Top N by Value

```sql
-- Top 10 occupations by income
TABLE ROWS occupation[-10@income.sum] * income.sum;
```

### Statistical Summary

```sql
-- Min, quartiles, max
TABLE ROWS occupation * income.(min | p25 | p50 | p75 | max);
```

### Row Percentages

```sql
-- Each row sums to 100%
TABLE ROWS occupation * (income.sum ACROSS COLS) COLS education;
```

### Multiple Aggregates

```sql
-- Show sum, mean, and count
TABLE ROWS occupation * income.(sum | mean) * n;
```

### Nested Totals

```sql
-- Subtotals per occupation
TABLE ROWS occupation * (gender | ALL "Both") * income.sum;
```

### Formatting

```sql
-- Built-in formats
TABLE ROWS occupation * income.sum:currency;
TABLE ROWS occupation * income.sum:percent;

-- Custom formats using # as placeholder
TABLE ROWS occupation * income.sum:'€ #.2';
```

## Next Steps

- **[Syntax Overview](/syntax/overview)** - Complete language reference
- **[Core Examples](/examples/core/basic-crosstab)** - Learn by example
- **[Playground](/playground)** - Experiment with live data

---

## Alternative: Using a Full Malloy Model

For advanced users who need full Malloy capabilities (joins, multiple sources, complex calculated measures), you can alternatively provide a complete Malloy model:

```typescript
import { createTPL } from 'tplm-lang'

const MODEL = `
source: sales is duckdb.table('sales.csv') extend {
  join_one: customers is duckdb.table('customers.csv') on customer_id = customers.id

  dimension:
    region is pick 'North' when region_code = 1 else 'South'

  measure:
    profit_margin is (revenue.sum() - cost.sum()) / revenue.sum()
}
`

const tpl = createTPL()
const { html } = await tpl.execute(
  'TABLE ROWS region * revenue.sum COLS quarter;',
  { model: MODEL, sourceName: 'sales' }
)
```

::: warning Percentile Limitation
When using `createTPL()` with a custom Malloy model, percentile aggregations (p25, p50, p75, median, etc.) are **not supported**. Use the `fromCSV()`, `fromDuckDBTable()`, or `fromBigQueryTable()` approach instead if you need percentiles.
:::

### When to Use Full Malloy Model

- Joining multiple tables
- Complex calculated measures that TPL can't express
- Migrating existing Malloy models to TPL
- Advanced Malloy patterns (views, refinements, etc.)

For most use cases, the `fromCSV()` / `fromDuckDBTable()` / `fromBigQueryTable()` approach with `.extend()` is recommended.
