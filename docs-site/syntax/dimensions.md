# Defining Dimensions

Dimensions transform raw data columns into categorical labels with controlled ordering. Define them in your Malloy source using `.extend()`.

## Why Define Dimensions?

1. **Transform raw codes into readable labels** - Convert `educ=12` into `"High School"`
2. **Control sort order** - Values appear in definition order, not alphabetically
3. **Group values into categories** - Combine multiple codes into logical groups
4. **Handle NULL values** - Explicitly control what happens to unmatched values

::: tip Definition Order
The order you define buckets determines their sort order in tables. For education levels, define them in logical order (`<HS`, `HS`, `College`) rather than alphabetical (`College`, `HS`, `<HS`).
:::

## Basic Syntax

Dimensions are defined using Malloy's `pick` expression within an `extend` block:

```typescript
const tpl = fromCSV('data.csv').extend(`
  dimension:
    dimension_name is
      pick 'Label 1' when condition1
      pick 'Label 2' when condition2
      else default_value
`)
```

## Examples

### Simple Alias (Passthrough)

When the source column already contains the values you want:

```typescript
const tpl = fromCSV('employees.csv').extend(`
  dimension: gender is gendchar
`)
```

This creates a dimension that passes through the values from `gendchar` unchanged.

### Bucketed Dimension

Transform numeric codes into readable labels:

```typescript
const tpl = fromCSV('employees.csv').extend(`
  dimension:
    education is
      pick '<HS' when educ < 12
      pick 'HS' when educ = 12
      pick 'College' when educ >= 13
      else null
`)
```

Values appear in definition order: `<HS`, `HS`, `College` - not alphabetically.

<Playground
  initial-query="TABLE ROWS education * income.sum COLS gender;"
  :auto-run="true"
  :editor-rows="1"
  label="Education dimension (definition order)"
/>

### Compound Conditions

Use `and` and `or` to combine conditions:

```typescript
const tpl = fromCSV('employees.csv').extend(`
  dimension:
    sector_label is
      pick 'Private' when sector = 1 or sector = 5 or sector = 6
      pick 'Public' when sector >= 2 and sector <= 4
      else null

    marital_status is
      pick 'Married' when marital >= 1 and marital <= 3
      pick 'Widowed' when marital = 4
      pick 'Divorced/Sep.' when marital = 5 or marital = 6
      pick 'Never Married' when marital = 7
      else null
`)
```

### Detailed Bucketing

Create fine-grained categories:

```typescript
const tpl = fromCSV('employees.csv').extend(`
  dimension:
    education_detail is
      pick '<HS' when educ < 12
      pick 'HS graduate' when educ = 12
      pick 'Some College' when educ >= 13 and educ <= 15
      pick 'College Grad' when educ = 16
      pick 'Some Graduate' when educ >= 17
      else null
`)
```

<Playground
  initial-query="TABLE ROWS education_detail * income.sum COLS gender;"
  :auto-run="true"
  :editor-rows="1"
  label="Detailed education (5 levels)"
/>

## Condition Operators

| Operator | Example | Meaning |
|----------|---------|---------|
| `=` | `educ = 12` | Equal to |
| `<` | `educ < 12` | Less than |
| `>` | `educ > 12` | Greater than |
| `<=` | `educ <= 12` | Less than or equal |
| `>=` | `educ >= 13` | Greater than or equal |
| `and` | `educ >= 1 and educ <= 3` | Both conditions must be true |
| `or` | `educ = 1 or educ = 2` | Either condition can be true |

## The ELSE Clause

The `else` clause specifies what happens to values that don't match any `pick` condition:

```typescript
// Exclude unmatched values (they become NULL and are filtered out)
const tpl = fromCSV('data.csv').extend(`
  dimension:
    education is
      pick '<HS' when educ < 12
      pick 'HS' when educ = 12
      pick 'College' when educ >= 13
      else null
`)

// Include unmatched values with a label
const tpl = fromCSV('data.csv').extend(`
  dimension:
    education is
      pick '<HS' when educ < 12
      pick 'HS' when educ = 12
      pick 'College' when educ >= 13
      else 'Unknown'
`)
```

::: warning
If you omit `else`, unmatched values will appear with their raw value, which may not be what you want.
:::

## Definition Order

**This is a key feature.** The order you define buckets controls how values sort in tables. When you define buckets using increasing numeric codes, the table will show values in that same order:

```typescript
const tpl = fromCSV('employees.csv').extend(`
  dimension:
    // Values will appear in this order: Managerial, Professional, Technical, ...
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

    // Tell TPL to use the underlying numeric column for ordering
    occupation_order is occup
`)
```

The `occupation_order is occup` line tells TPL to sort by the underlying numeric codes rather than alphabetically. This ensures:

- **Default sort order** - Tables show values in definition order
- **Limit behavior** - `[5]` gives first 5 by definition order, not alphabetically
- **Implicit ordering** - No need for `@aggregate` to get meaningful order

<Playground
  initial-query="TABLE ROWS occupation[5] * income.sum COLS gender;"
  :auto-run="true"
  :editor-rows="1"
  label="First 5 occupations (by definition order)"
  :variations="[
    { label: 'All occupations (definition order)', query: 'TABLE ROWS occupation * income.sum COLS gender;' },
    { label: 'Last 5 (reverse definition order)', query: 'TABLE ROWS occupation[-5] * income.sum COLS gender;' }
  ]"
/>

## Multiple Dimensions

Define as many dimensions as needed. Each is independent:

```typescript
const tpl = fromCSV('employees.csv').extend(`
  dimension:
    education is
      pick '<HS' when educ < 12
      pick 'HS' when educ = 12
      pick 'College' when educ >= 13
      else null
    education_order is educ

    gender is gendchar

    occupation is
      pick 'Managerial' when occup = 1
      pick 'Professional' when occup = 2
      // ... more buckets
      else null
    occupation_order is occup
`)

// Now use them in queries
const { html } = await tpl.query('TABLE ROWS occupation * gender COLS education * income.sum;')
```

## Dimensions and Percentiles

Dimensions work seamlessly with percentile aggregations. The percentile is computed correctly within each dimension bucket:

<Playground
  initial-query="TABLE ROWS education * income.(p25 | p50 | p75) COLS gender;"
  :auto-run="true"
  :editor-rows="1"
  label="Percentiles by education level"
/>

## Best Practices

1. **Define buckets in logical order** - Not alphabetical, but the order that makes sense for your data (e.g., education levels from lowest to highest)

2. **Use `else null` for clean data** - This filters out unexpected values rather than showing raw codes

3. **Keep bucket labels concise** - They become table headers, so shorter is better

4. **Consider multiple granularities** - Define both `education` (3 levels) and `education_detail` (5 levels) for different views

5. **Add ordering dimensions** - Include `<dim>_order is <raw_column>` to enable definition-order sorting

## Related

- [Alphabetic Limit](/examples/limits/row-limit-alpha) - How definition order affects `[N]` limits
- [Order by Code Column](/examples/limits/order-by-code-column) - Ordering by underlying numeric codes
- [Data Model](/getting-started/data-model) - Complete reference of playground dimensions
