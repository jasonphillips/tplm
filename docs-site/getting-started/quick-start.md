# Quick Start

Get started with TPL in 5 minutes.

## What is TPL?

TPL is a **unified language** for defining complex tables. You describe both the **layout** (rows, columns, nesting, totals) and the **data** (dimensions, aggregations, filters) in one declaration. TPL compiles to efficient queries, executes them, and renders the result.

Built on [Malloy](https://www.malloydata.dev/). Runs on DuckDB or BigQuery.

## Try it Online

The fastest way to try TPL is in the [interactive playground](/playground), which runs entirely in your browser.

## Installation

Install TPLm via npm:

```bash
npm install tplm-lang
```

## Basic Example

Create a simple table:

```typescript
import { createTPL } from 'tplm-lang'

const tpl = createTPL()

const result = await tpl.execute(
  'TABLE ROWS occupation * income.sum;',
  {
    model: MALLOY_MODEL,
    sourceName: 'samples'
  }
)

console.log(result.html)
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

TPL computes aggregations at query time - just specify what you want:

```sql
TABLE ROWS occupation * income.sum;
TABLE ROWS occupation * income.(sum | mean);
TABLE ROWS occupation * n;  -- count of records
```

### Totals with `ALL`

Add total rows or columns:

```sql
-- row total
TABLE ROWS (occupation | ALL) * income.sum;

-- column total
TABLE ROWS occupation * income.sum COLS education | ALL;
```

## Next Steps

- **[Syntax Overview](/syntax/overview)** - Complete language reference
- **[Core Examples](/examples/core/basic-crosstab)** - Learn by example
- **[Playground](/playground)** - Experiment with live data

## Easy Start - No Malloy Required

The fastest way to query your own data is with the easy connectors. No Malloy knowledge needed.

### Query a CSV File

```typescript
import { fromCSV } from 'tplm-lang'

// Point to your CSV and query immediately
const tpl = fromCSV('data/employees.csv')

const { html } = await tpl.query(
  'TABLE ROWS department * salary.sum COLS gender;'
)
```

### Query a Parquet File

```typescript
import { fromDuckDBTable } from 'tplm-lang'

const tpl = fromDuckDBTable('data/sales.parquet')

const { html } = await tpl.query(
  'TABLE ROWS region[-10@revenue.sum] * revenue.sum COLS quarter | ALL;'
)
```

### Query BigQuery Directly

```typescript
import { fromBigQueryTable } from 'tplm-lang'

const tpl = fromBigQueryTable({
  table: 'my-project.my_dataset.sales',
  credentialsPath: './service-account.json'
})

const { html } = await tpl.query(
  'TABLE ROWS region * revenue.sum COLS quarter;'
)
```

### Adding Computed Dimensions

If you need to transform raw values (like mapping codes to labels), use `.extend()`:

```typescript
const tpl = fromCSV('employees.csv').extend(`
  dimension:
    department is
      pick 'Engineering' when dept_code = 1
      pick 'Sales' when dept_code = 2
      else 'Other'
`)

const { html } = await tpl.query('TABLE ROWS department * salary.sum;')
```

## Advanced Configuration

### Using DuckDB with Full Malloy Model

```typescript
import { createTPL } from 'tplm-lang'

const tpl = createTPL({
  maxLimit: 100  // default limit for dimensions
})
```

### Using BigQuery with Full Malloy Model

```typescript
import { createBigQueryTPL } from 'tplm-lang'

const tpl = createBigQueryTPL({
  credentialsPath: './service-account.json',
  maxLimit: 1000
})
```

## Understanding Data Sources (Advanced)

TPL works with two concepts you need to understand:

### 1. The Malloy Model (`model` parameter)

The **model** is a Malloy definition file that describes your data. It contains:
- **Source definitions** - where your data lives (CSV, BigQuery table, etc.)
- **Computed dimensions** - transform raw codes into readable labels
- **Joins** - relationships between tables
- **Complex measures** - calculations TPL can't express directly

**What belongs in the model:**
```malloy
source: sales is duckdb.table('sales.csv') extend {
  // ✓ Computed dimensions - map codes to labels
  dimension:
    region is
      pick 'North' when region_code = 1
      pick 'South' when region_code = 2
      else 'Other'

  // ✓ Complex calculated measures TPL can't express
  measure:
    profit_margin is (revenue.sum() - cost.sum()) / revenue.sum()
}
```

**What you DON'T need in the model:**
```malloy
// ✗ Don't pre-define simple aggregates - TPL computes these!
measure:
  total_revenue is revenue.sum()   // TPL does: revenue.sum
  avg_revenue is revenue.avg()     // TPL does: revenue.mean
  record_count is count()          // TPL does: n
```

### 2. The Source Name (`sourceName` parameter)

The **source name** tells TPL which source from your model to query. If your model defines `source: sales is ...`, then `sourceName: 'sales'` generates `run: sales -> { ... }`.

## Specifying the Source

There are two ways to tell TPL which source to query:

### Method 1: FROM Clause in TPL

```sql
TABLE FROM sales ROWS region * revenue.sum;
```

### Method 2: sourceName Parameter

```typescript
const result = await tpl.execute(
  'TABLE ROWS region * revenue.sum;',
  { model: MODEL, sourceName: 'sales' }
)
```

### Priority Order

1. `FROM` clause in TPL (highest priority)
2. `sourceName` parameter in `.execute()`
3. `sourceName` option in `createTPL()`
4. Default: `'data'`

## Complete Example: CSV → Model → TPL

Here's a full example showing the workflow:

### Step 1: Define Your Malloy Model

```typescript
const MODEL = `
// Define a source pointing to your CSV
source: employees is duckdb.table('data/employees.csv') extend {

  // Computed dimensions - transform raw data into categories
  // TPL will reference these by name
  dimension:
    department is
      pick 'Engineering' when dept_code = 1
      pick 'Sales' when dept_code = 2
      pick 'Marketing' when dept_code = 3
      else 'Other'

    seniority is
      pick 'Junior' when years < 2
      pick 'Mid' when years >= 2 and years < 5
      pick 'Senior' when years >= 5

    // For ordering by definition (not alphabetically)
    seniority_order is years

  // Only define complex measures TPL can't compute
  measure:
    avg_salary_per_year is salary.sum() / years.sum()
}
`;
```

### Step 2: Write TPL Queries

```typescript
import { createTPL } from 'tplm-lang'

const tpl = createTPL()

// TPL computes salary.sum at query time - no pre-definition needed!
const result = await tpl.execute(
  'TABLE ROWS department * seniority * salary.sum COLS gender;',
  { model: MODEL, sourceName: 'employees' }
)

console.log(result.html)
```

### Step 3: What Gets Generated

TPL compiles your query to Malloy:

```malloy
run: employees -> {
  group_by: department
  aggregate:
    salary_sum is salary.sum()
  nest: by_seniority is {
    group_by: seniority
    aggregate:
      salary_sum is salary.sum()
    nest: by_gender is {
      group_by: gender
      aggregate:
        salary_sum is salary.sum()
    }
  }
}
```

## API Reference

### Parse Only

```typescript
const ast = tpl.parse('TABLE ROWS occupation * income.sum;')
```

### Compile Only

```typescript
const { malloy } = tpl.compile('TABLE ROWS occupation[-10] COLS education;')
```

### Full Pipeline

```typescript
const result = await tpl.execute(tplSource, {
  model: MODEL,           // Malloy model (source definitions, computed dimensions)
  sourceName: 'my_source' // Which source to query (if not in FROM clause)
})

console.log(result.html)      // HTML table
console.log(result.grid)      // Grid specification
console.log(result.malloy)    // Generated Malloy
```

## Common Patterns

### Top N by Value

```sql
-- Top 10 occupations by income
TABLE ROWS occupation[-10@income.sum] * income.sum;
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
TABLE ROWS occupation * income.sum:'#.0 units';
```

## Learn More

Check out the full [Examples](/examples/core/basic-crosstab) section for comprehensive patterns and use cases.
