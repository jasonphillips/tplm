# SQL Attribution

TPL can track and expose the raw SQL query behind every data cell in a rendered table. This is useful when consumers need to verify exactly how a number was produced, without relying on intermediate layers.

## Enabling SQL Tracking

Pass `trackSQL: true` when creating a TPL instance:

```typescript
import { createTPL } from 'tplm-lang';

const tpl = createTPL({ trackSQL: true });
const result = await tpl.execute(query, { malloySource: SOURCE });
```

When enabled, each rendered `<td>` data cell includes two additional HTML attributes:

| Attribute | Description |
|-----------|-------------|
| `data-sql` | The full SQL query that produced the cell's data |
| `data-cell-sql` | A narrowed version with a WHERE clause filtering to this cell's specific dimension values |

## Live Demo

Hover over any data cell below to see the SQL in the popover. The `data-cell-sql` shows the query narrowed to that specific cell's dimension values.

<Playground
  initial-query="TABLE ROWS occupation[-3] COLS gender * income.sum;"
  :auto-run="true"
  :show-tabs="true"
  :track-sql="true"
  :editor-rows="2"
  label="SQL Attribution Demo"
  :variations="[
    { label: 'With totals', query: 'TABLE ROWS occupation[-3] COLS gender * ALL * income.sum;' },
    { label: 'Multi-dimension rows', query: 'TABLE ROWS education * gender COLS income.sum;' },
    { label: 'Nested columns', query: 'TABLE ROWS occupation[-3] COLS education * gender * income.sum;' }
  ]"
/>

::: tip
Hover over a data cell and you'll see the SQL section in the popover. The SQL is a narrowed query: the base query is wrapped with `WHERE` conditions matching the cell's row and column dimension values.
:::

## How It Works

Each TPL table is backed by one or more SQL queries. When `trackSQL` is enabled:

1. **SQL Capture** &mdash; As Malloy compiles each query to SQL, the raw SQL string is captured
2. **Cell Attribution** &mdash; During grid construction, each cell is tagged with the query ID that produced it
3. **SQL Narrowing** &mdash; The cell's SQL is the base query wrapped in `SELECT * FROM (<base>) WHERE <conditions>` filtering to the cell's specific dimension values
4. **HTML Output** &mdash; The renderer writes `data-sql` and `data-cell-sql` attributes on each `<td>`

### The `CellValue` Object

When using the programmatic API, each cell value includes SQL fields:

```typescript
interface CellValue {
  raw: number | null;
  formatted: string;
  aggregate: string;

  /** Full SQL query that produced this cell's data */
  sql?: string;

  /** Narrowed SQL with WHERE clause for this cell's dimensions */
  cellSQL?: string;
}
```

### Cell SQL Narrowing

For a cell at `occupation = Sales, gender = Male`, the `cellSQL` wraps the base query:

```sql
SELECT * FROM (
  -- original query here
  SELECT ...
  FROM samples
  GROUP BY ...
) AS _tpl_base
WHERE "occupation" = 'Sales' AND "gender" = 'Male'
```

This gives consumers a self-contained query they can run directly to verify a cell's value.

## Accessing SQL in JavaScript

You can read the SQL from data attributes on rendered cells:

```javascript
const cell = document.querySelector('[data-cell="occupation=Sales|gender=Male"]');

// Full query
const sql = cell?.getAttribute('data-sql');

// Narrowed query for this specific cell
const cellSQL = cell?.getAttribute('data-cell-sql');
```

## Performance Note

SQL tracking is opt-in because it adds an extra async call (`getSQL()`) per query during execution, and the SQL strings add to the HTML output size. For tables with many cells, this can be significant. Only enable it when SQL transparency is needed.

## Edge Cases

- **Totals (ALL)**: Total cells use the same base SQL as regular cells, but the narrowed `cellSQL` omits the dimension that is being totaled
- **Percentile queries**: Percentile cells show the derived SQL that includes window functions. The narrowed `cellSQL` may not reproduce the exact percentile value when run standalone, since window functions depend on the full partition
- **Multi-query tables**: Tables with concatenated axes (`|` operator) produce multiple SQL queries. Each cell's `data-sql` reflects which specific query produced it

## Related

- [Cell Data Attributes](/styling/cell-data-attributes) &mdash; All data attributes on rendered cells
- [CSS Reference](/styling/css-reference) &mdash; Styling rendered tables
