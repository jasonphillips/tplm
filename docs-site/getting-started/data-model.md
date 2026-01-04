# Sample Data Model

All interactive examples in the TPL documentation use a sample employment survey dataset. This page explains the dimensions and measures available in the playground.

## Sample Dataset

The playground uses an employment survey dataset (`samples.csv`) containing 6,639 records with demographic, employment, and income information. This is the same data used in all documentation examples.

## Available Dimensions

Dimensions are categorical variables used for grouping data. The sample dataset defines these dimensions in a Malloy source file that transforms raw column values into meaningful labels.

### education

Education level (3 categories) derived from years of education:

```malloy
education is
  pick '<HS' when educ < 12
  pick 'HS' when educ = 12
  pick 'College' when educ >= 13
  else null
```

### education_detail

A more detailed breakdown of education levels:

```malloy
education_detail is
  pick '<HS' when educ < 12
  pick 'HS graduate' when educ = 12
  pick 'Some College' when educ >= 13 and educ <= 15
  pick 'College Grad' when educ = 16
  pick 'Some Graduate' when educ >= 17
  else null
```

### gender

Gender from a character column (simple alias):

```malloy
gender is gendchar
```

### occupation

Occupation categories derived from occupation codes:

```malloy
occupation is
  pick 'Managerial' when occup = 1
  pick 'Professional' when occup = 2
  pick 'Technical' when occup = 3
  pick 'Sales' when occup = 4
  pick 'Clerical' when occup = 5
  pick 'Services' when occup >= 6 and occup <= 8
  pick 'Manufacturing' when occup = 9 or occup = 10
  pick 'Transport' when occup = 11 or occup = 12
  pick 'Farming' when occup = 13 or occup = 14
  else null
```

### employment

Full-time vs part-time status:

```malloy
employment is
  pick 'Full-time' when fulltime = 2
  pick 'Part-time' when fulltime >= 3
  else null
```

### sector_label

Public vs private sector employment:

```malloy
sector_label is
  pick 'Private' when sector = 1 or sector = 5 or sector = 6
  pick 'Public' when sector >= 2 and sector <= 4
  else null
```

### marital_status

Marital status categories:

```malloy
marital_status is
  pick 'Married' when marital >= 1 and marital <= 3
  pick 'Widowed' when marital = 4
  pick 'Divorced/Sep.' when marital = 5 or marital = 6
  pick 'Never Married' when marital = 7
  else null
```

### country

Country of origin:

```malloy
country is
  pick 'North America' when ctry = 1
  pick 'South America' when ctry = 2
  pick 'Other' when ctry >= 3
  else null
```

### union_status

Union membership:

```malloy
union_status is
  pick 'Non-Union' when `union` = 1
  pick 'Union' when `union` = 2
  else null
```

## Available Measures

Measures are numeric columns that can be aggregated. The sample dataset includes these measure columns:

### income

Annual income in dollars. Supports aggregations:
- `income.sum` - Total income
- `income.mean` - Average income
- `income.min` - Minimum income
- `income.max` - Maximum income
- `income.p25`, `income.p50`, `income.p75` - Percentiles

### hourly

Hourly wage rate. Supports aggregations:
- `hourly.sum` - Total of hourly rates
- `hourly.avg` - Average hourly rate
- `hourly.min`, `hourly.max` - Range

### sat

Satisfaction score. Supports aggregations:
- `sat.sum` - Total satisfaction
- `sat.avg` - Average satisfaction

### n (count)

Record count is available via the special `n` measure:
- `n` - Count of records

## Using Dimensions in Your Queries

When working with the playground, you can use any of these dimensions and measures directly:

<Playground
  initial-query="TABLE ROWS occupation COLS education * income.sum;"
  :auto-run="true"
  :show-tabs="true"
  :editor-rows="2"
  label="Try It"
/>

## Defining Your Own Dimensions

For your own data, define dimensions using Malloy's `pick` syntax via `.extend()`:

```typescript
import { fromCSV } from 'tplm-lang'

const tpl = fromCSV('employees.csv').extend(`
  dimension:
    region is
      pick 'North' when region_code = 1
      pick 'South' when region_code = 2
      else 'Other'
    region_order is region_code  // for definition-order sorting
`)

const { html } = await tpl.query('TABLE ROWS region * sales.sum COLS quarter;')
```

### Condition Syntax

Conditions can use various comparison operators:

| Syntax | Meaning |
|--------|---------|
| `= value` | Equal to value |
| `< value` | Less than value |
| `> value` | Greater than value |
| `<= value` | Less than or equal |
| `>= value` | Greater than or equal |
| `and` | Combine conditions |
| `or` | Alternative conditions |

### Simple Aliases

If a column already contains the labels you want, use a simple alias:

```typescript
const tpl = fromCSV('data.csv').extend(`
  dimension: department is dept_name
`)
```

## Next Steps

- **[Quick Start](/getting-started/quick-start)** - Get started with TPL
- **[Basic Crosstab](/examples/core/basic-crosstab)** - Your first table
- **[Playground](/playground)** - Experiment with the sample data
