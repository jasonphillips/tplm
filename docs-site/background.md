# Background

## Origins of TPL

The original **Table Producing Language (TPL)** was developed by the U.S. Bureau of Labor Statistics in the early 1970s for producing complex statistical tables from survey data on IBM mainframes. It was one of the first task-oriented (rather than procedure-oriented) languages for tabulation.

As government-created software, TPL was freely shared with other federal agencies and research institutions. The language later influenced two commercial products:

- **SAS PROC TABULATE** (1982) - adopted TPL's syntax and concepts
- **TPL Tables** by QQQ Software (1987) - created by former BLS developers

## TPLm

**TPLm** is intended as an opinionated, lean reimplementation with an adjusted syntax that:

- Compiles to [Malloy](https://www.malloydata.dev/) for efficient querying against DuckDB or BigQuery
- Renders to well-structured HTML tables with proper hierarchical headers
- Handles arbitrarily complex or nested crosstabulations

The goal is a contemporary, portable implementation that separates table specification from execution, allowing the same TPL statements to run against different data backends.
