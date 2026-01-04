---
layout: home

hero:
  name: TPLm
  tagline: A single declarative language to describe table layout and data requirements, for efficiently querying and rendering arbitrarily complex or nested crosstabulations.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/quick-start
    - theme: alt
      text: View Examples
      link: /examples/core/basic-crosstab
    - theme: alt
      text: Open Playground
      link: /playground
---

## Background

The original TPL was a language developed by the U.S. Bureau of Labor Statistics in the early 1970s for producing complex statistical tables from survey data on IBM mainframes. It was freely shared with other federal agencies and research institutions, with significant adoption. The language later influenced two commercial products: SAS's **PROC TABULATE** (1982), which adopted TPL's syntax and concepts, and **TPL Tables** by QQQ Software (1987).

**TPLm** is intended as an opinionated, lean reimplementation, with an adjusted syntax that compiles to [Malloy](https://www.malloydata.dev/) for efficient querying against DuckDB or BigQuery, and renders to well-structured HTML tables.

## See What's Possible

One line describes the table structure. TPL handles the rest - generating efficient queries, fetching data, and rendering HTML.

<Playground
  initial-query="TABLE
  ROWS (occupation DESC@income.sum) * income.mean:currency
  COLS (education 'education level' * gender) | ALL
;"
  :auto-run="true"
  :show-tabs="true"
  :show-timing="true"
  label="Top Occupations by Income"
/>

### More Examples - Click to Run

<Playground
  initial-query="TABLE
  ROWS occupation DESC@income.sum * (income.sum ACROSS COLS)
  COLS education
;"
  :auto-run="true"
  :show-tabs="true"
  :show-timing="true"
  label="Row Percentages"
/>

<Playground
  initial-query="TABLE
  ROWS occupation * income.(p50 | p95):currency
  COLS gender
;"
  :auto-run="true"
  :show-tabs="true"
  :show-timing="true"
  label="Median vs 95th Percentile Income"
/>

## How It Works

TPL is a **unified language** that describes both:

1. **Table Layout** - rows, columns, nesting, totals
2. **Data Requirements** - dimensions, aggregations, filters

You write one declaration. TPL compiles it to efficient database queries, executes them, and renders the result.

### Syntax Overview

| Operator       | Meaning     | Example                                                 |
| -------------- | ----------- | ------------------------------------------------------- |
| `*`            | Cross/Nest  | `occupation * gender` (gender nested within occupation) |
| `\|`           | Concatenate | `occupation \| gender` (separate sections)              |
| `ALL`          | Totals      | `(occupation \| ALL)` (add total row)                   |
| `[-N@field]`   | Top N       | `occupation[-5@income.sum]` (top 5 by income)           |
| `.sum` `.mean` | Aggregate   | `income.sum`, `income.(sum \| mean)`                    |
| `.p50` `.p95`  | Percentiles | `income.p50` (median), `income.(p25 \| p75)`            |
| `ACROSS`       | Percentages | `(income.sum ACROSS COLS)` (row percentages)            |

### Common Patterns

```sql
-- Basic crosstab: occupation rows, education columns
TABLE ROWS occupation * income.sum COLS education;

-- Top 5 with totals
TABLE ROWS occupation[-5@income.sum] * income.sum COLS education | ALL;

-- Statistical summary with percentiles
TABLE ROWS occupation * income.(p25 | p50 | p75 | p95) COLS gender;

-- Row percentages (each row sums to 100%)
TABLE ROWS occupation * (income.sum ACROSS COLS) COLS education;

-- Multiple aggregates with currency formatting
TABLE ROWS occupation * income.(sum | mean):currency COLS gender;
```

## Next Steps

<div class="vp-doc" style="margin-top: 24px;">
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px;">
    <a href="./getting-started/quick-start" class="vp-link" style="padding: 20px; border: 1px solid var(--vp-c-divider); border-radius: 8px; text-decoration: none;">
      <h3>Getting Started</h3>
      <p style="margin: 8px 0 0 0; color: var(--vp-c-text-2); font-size: 14px;">Installation, API usage, and connecting to your data</p>
    </a>
    <a href="./syntax/overview" class="vp-link" style="padding: 20px; border: 1px solid var(--vp-c-divider); border-radius: 8px; text-decoration: none;">
      <h3>Syntax Reference</h3>
      <p style="margin: 8px 0 0 0; color: var(--vp-c-text-2); font-size: 14px;">Complete language reference with all operators and features</p>
    </a>
    <a href="./examples/core/basic-crosstab" class="vp-link" style="padding: 20px; border: 1px solid var(--vp-c-divider); border-radius: 8px; text-decoration: none;">
      <h3>Examples</h3>
      <p style="margin: 8px 0 0 0; color: var(--vp-c-text-2); font-size: 14px;">Learn by example with interactive demos</p>
    </a>
    <a href="./playground" class="vp-link" style="padding: 20px; border: 1px solid var(--vp-c-divider); border-radius: 8px; text-decoration: none;">
      <h3>Playground</h3>
      <p style="margin: 8px 0 0 0; color: var(--vp-c-text-2); font-size: 14px;">Experiment with TPL in your browser</p>
    </a>
  </div>
</div>
