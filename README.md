# TPLm

**One Language for Complex Tables** - Define table layout and data requirements in a single declaration.

TPL is a unified language that describes **both** the presentation structure (rows, columns, nesting, totals) **and** the data requirements (dimensions, aggregations, filters). A single TPL table statement compiles to malloy queries, fetches data, and renders the result with correctly nested table structures, even for very complex or deeply nested constructions.

```sql
TABLE
  ROWS (occupation DESC@income.sum) * income.mean:currency
  COLS (education 'education level' * gender) | ALL
;
```

![TPLm table example](preview.png)

## Background

The original TPL was a language developed by the U.S. Bureau of Labor Statistics in the early 1970s for producing complex statistical tables from survey data on IBM mainframes. It was freely shared with other federal agencies and research institutions, with significant adoption. The language later influenced two commercial products: SAS's **PROC TABULATE** (1982), which adopted TPL's syntax and concepts, and **TPL Tables** by QQQ Software (1987).

**TPLm** is intended as an opinionated, lean reimplementation, with an adjusted syntax that compiles to [Malloy](https://www.malloydata.dev/) for efficient querying against DuckDB or BigQuery, and renders to well-structured HTML tables.

## Documentation

**[Visit the full documentation site](https://jasonphillips.github.io/tplm/)** with:

- **Interactive Playground** - Try TPLm in your browser with live execution
- **Complete Syntax Reference** - Full language documentation
- **Categorized Examples** - Learn by example with editable demos
- **WASM-Powered** - Runs DuckDB entirely in your browser

**[Try the standalone playground](https://jasonphillips.github.io/tplm/playground/)** - Full-featured editor with dataset selector and multiple tabs.

---

## Installation

```bash
npm install tplm-lang
```

## Quick Start - Query Your Data Immediately

For basic use, no Malloy knowledge is required; just use your local data and start querying.

```typescript
import { fromCSV } from "tplm-lang";

// Point to your CSV and query immediately
const tpl = fromCSV("data/sales.csv");

const { html } = await tpl.query(
  "TABLE ROWS region[-10@revenue.sum] * revenue.sum COLS quarter | ALL;"
);

console.log(html);
```

### Other Data Sources

```typescript
// Parquet files
import { fromDuckDBTable } from "tplm-lang";
const tpl = fromDuckDBTable("data/sales.parquet");

// BigQuery tables
import { fromBigQueryTable } from "tplm-lang";
const tpl = fromBigQueryTable({
  table: "project.dataset.sales",
  credentialsPath: "./credentials.json",
});

// Then query the same way
const { html } = await tpl.query("TABLE ROWS region * revenue.sum;");
```

### Adding Computed Dimensions

If you need to transform raw values (like mapping codes to labels):

```typescript
const tpl = fromCSV("employees.csv").extend(`
  dimension:
    department is
      pick 'Engineering' when dept_code = 1
      pick 'Sales' when dept_code = 2
      else 'Other'
`);

const { html } = await tpl.query("TABLE ROWS department * salary.sum;");
```

## Advanced Usage with Malloy Models

For complex scenarios with joins, computed measures, or multiple sources:

```typescript
import { createTPL } from "tplm-lang";

const MODEL = `
source: sales is duckdb.table('sales.csv') extend {
  dimension:
    region is pick 'North' when region_code = 1 else 'South'
}
`;

const tpl = createTPL({ maxLimit: 100 });

const { html } = await tpl.execute(
  "TABLE ROWS region * revenue.sum COLS quarter | ALL;",
  { model: MODEL, sourceName: "sales" }
);
```

## Understanding the Model vs TPL

**What belongs in your Malloy model:**

- Computed dimensions (mapping codes to labels)
- Joins between tables
- Complex calculated measures TPL can't express

**What TPL computes at query time:**

- Simple aggregations: `revenue.sum`, `revenue.mean`, `n` (count)
- Percentages: `(revenue.sum ACROSS COLS)`
- You don't need to pre-define `total_revenue is revenue.sum()`

## TPL Syntax

TPL statements describe table structure declaratively:

```sql
TABLE [FROM source] [WHERE condition] ROWS <row-axis> [COLS <column-axis>];
```

### Dimensions and Measures

```sql
-- simple dimensions
ROWS region * product

-- with limits (top N by value)
ROWS region[-10@revenue.sum] * product[-5]

-- with aggregates (computed at query time)
ROWS region * product * revenue.sum

-- multiple aggregates
ROWS region * revenue.(sum | mean | max)

-- count of records
ROWS region * n
```

### Crossing and Concatenation

```sql
-- crossing (*) creates hierarchy
ROWS region * product * revenue.sum

-- concatenation (|) creates sections
ROWS region | product

-- totals with ALL
ROWS (region | ALL) * revenue.sum COLS quarter | ALL "Total"
```

### Formatting

```sql
-- built-in formats
revenue.sum:currency        -- $1,234.56
rate.mean:percent           -- 45.6%
n:integer                   -- 1,235

-- custom formats
revenue:'$ #.2 M'           -- $ 1.23 M
```

### Percentages (ACROSS)

```sql
-- cell percentage of grand total
ROWS occupation * (n ACROSS) COLS education

-- row percentages (each row sums to 100%)
ROWS occupation * (revenue.sum ACROSS COLS) COLS education

-- column percentages (each column sums to 100%)
ROWS occupation * (revenue.sum ACROSS ROWS) COLS education

-- combine percentage with regular measure
COLS education * (revenue.sum ACROSS COLS | revenue.mean)
```

## API

### Easy Connectors (Recommended)

```typescript
import { fromCSV, fromDuckDBTable, fromBigQueryTable } from "tplm-lang";

// CSV or Parquet files
const tpl = fromCSV("data/sales.csv");
const tpl = fromDuckDBTable("data/sales.parquet");

// BigQuery
const tpl = fromBigQueryTable({
  table: "project.dataset.sales",
  credentialsPath: "./credentials.json",
});

// Query and render
const { html } = await tpl.query("TABLE ROWS region * revenue.sum;");

// Add computed dimensions
const tplWithDims = tpl.extend(`
  dimension: region is pick 'North' when region_code = 1 else 'South'
`);
```

### Full API (with Malloy Models)

```typescript
import { TPL, createTPL, createBigQueryTPL } from "tplm-lang";

// DuckDB (default)
const tpl = createTPL({ maxLimit: 100 });

// BigQuery
const tpl = createBigQueryTPL({
  maxLimit: 100,
  credentialsPath: "./credentials.json",
});

// parse only
const ast = tpl.parse("TABLE ROWS region * revenue.sum;");

// compile only (get malloy output)
const { malloy, queries, plan, spec } = tpl.compile(
  "TABLE ROWS region[-10] * revenue.sum COLS quarter;"
);

// full pipeline: parse → compile → execute → render
const { html, grid, malloy, rawResults } = await tpl.execute(tplSource, {
  model: MODEL, // Malloy model (source definitions, computed dimensions)
  sourceName: "sales", // Which source to query from the model
});
```

### Low-Level API

```typescript
import {
  parse,
  formatTPL,
  buildTableSpec,
  generateQueryPlan,
  generateMalloyQueries,
  buildGridSpec,
  renderGridToHTML,
  executeMalloy,
} from "tplm-lang";

// parse TPL to AST
const ast = parse(tplSource);

// format AST back to pretty TPL
const formatted = formatTPL(ast);

// step by step compilation
const spec = buildTableSpec(ast);
const plan = generateQueryPlan(spec);
const queries = generateMalloyQueries(plan, "source_name");
// execute queries...
const grid = buildGridSpec(spec, plan, results, queries);
const html = renderGridToHTML(grid);
```

## Options

### maxLimit

Caps all grouping dimensions to prevent runaway queries:

```typescript
const tpl = createTPL({ maxLimit: 100 });

// this query:
//   TABLE ROWS state[-500] * revenue.sum
// is capped to:
//   TABLE ROWS state[-100] * revenue.sum
```

### sourceName

Default Malloy source name when the statement doesn't include FROM clause:

```typescript
const tpl = createTPL({ sourceName: "my_table" });
```

## Formatting

TPLm includes a built-in prettifier that formats TPL code with consistent style:

```typescript
import { parse, formatTPL } from "tplm-lang";

const messy = "TABLE ROWS (region|ALL)*gender*revenue.sum COLS quarter|ALL;";
const ast = parse(messy);
const pretty = formatTPL(ast);

console.log(pretty);
// TABLE
//   ROWS (region | ALL) * gender * revenue.sum
//   COLS quarter | ALL
// ;
```

**Formatting rules:**

- Very short statements (< 60 chars) stay on one line
- Clauses (ROWS, COLS, WHERE, FROM) on separate lines
- Top-level alternatives (`|` operators) break to new lines
- Crossing (`*` operators) stay compact
- Consistent spacing and indentation

## Output

The renderer produces HTML tables with:

- Multi-level row dimensions with `rowspan`
- Column pivots with `colspan` for multiple aggregates
- Row and column totals
- Number formatting
- CSS classes for styling (`tpl-table`, `tpl-cell`, `tpl-total-cell`, `tpl-corner`, etc.)

## Development

```bash
# install dependencies
npm install

# build (parser + typescript)
npm run build

# run tests
npm run test:run

# interactive playground
npm run playground
```

## License

MIT
