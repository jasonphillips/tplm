// TPL Grammar (PEG.js / Peggy)
//
// This is a draft grammar for the Table Producing Language.
// Use with peggy (npm install peggy) to generate the parser.
//
// Generate parser: npx peggy --format es tpl.pegjs -o parser.js
//
// Syntax overview:
//   Concatenation: | or THEN (items shown side-by-side)
//   Nesting: * or BY (items crossed/nested)
//   Labels: 'label' after item (optional quoted string)
//   Ordering: ASC/DESC keyword (e.g., state DESC 'State')
//   Limits: [N] for ascending, [-N] for descending (e.g., state[-5])
//   Cross-dimensional: ACROSS dim (aggregate across all values of dim)
//
// Examples:
//   year[-5] 'Year' | state[5] 'US State'
//   year[-5] 'Year' THEN state[5] 'US State'
//   (year | state) * births.sum 'Total'
//   (year THEN state) BY births.sum 'Total'
//   state DESC 'State' * births.sum   // Order by state descending
//   year ASC | state DESC             // Different orderings
//   state[-3@(births.sum ACROSS name)]  // Top 3 states by % of name's total
//   state[-3@(a.sum / b.sum ACROSS name)]  // Explicit ratio with different measures

{{
  // Helper functions available in the generated parser

  function makeAxis(groups) {
    return { type: 'axis', groups: groups };
  }

  function makeGroup(items) {
    return { type: 'group', items: items };
  }

  function makeDimension(name, annotations) {
    return { type: 'dimension', name, ...annotations };
  }

  function makeMeasure(name, annotations) {
    return { type: 'measure', name, ...annotations };
  }

  function makeAggregation(method, annotations) {
    return { type: 'aggregation', method, ...annotations };
  }

  function makeAll(annotations) {
    return { type: 'all', ...annotations };
  }

  function makeBinding(measure, aggregations, annotations) {
    return { type: 'binding', measure, aggregations, ...annotations };
  }

  function mergeAnnotations(list) {
    return list.reduce((acc, ann) => ({ ...acc, ...ann }), {});
  }

  function makeAggregateExpr(field, func, ungroupedDims) {
    return {
      type: 'aggregateExpr',
      field,
      function: func,
      ungroupedDimensions: ungroupedDims ?? []
    };
  }

  function makeRatioExpr(numerator, denominator) {
    return {
      type: 'ratioExpr',
      numerator,
      denominator
    };
  }

  function makePercentageAggregate(measure, method, scope, annotations) {
    return {
      type: 'percentageAggregate',
      measure: measure ?? undefined,
      method,
      denominatorScope: scope,
      ...annotations
    };
  }
}}

// ============================================================
// TOP-LEVEL RULES
// ============================================================

start
  = _ stmt:tableStatement _ { return stmt; }

tableStatement
  = TABLE optionsClause:optionsClause? fromClause:fromClause? whereClause:whereClause? __ ROWS __ rowAxis:axis __ COLS __ colAxis:axis _ ";" {
      // ROWS declared first - row limits take priority
      return {
        type: 'table',
        source: fromClause ?? null,
        where: whereClause ?? null,
        options: optionsClause ?? {},
        rowAxis: rowAxis,
        colAxis: colAxis,
        firstAxis: 'row'
      };
    }
  / TABLE optionsClause:optionsClause? fromClause:fromClause? whereClause:whereClause? __ COLS __ colAxis:axis __ ROWS __ rowAxis:axis _ ";" {
      // COLS declared first - column limits take priority
      return {
        type: 'table',
        source: fromClause ?? null,
        where: whereClause ?? null,
        options: optionsClause ?? {},
        rowAxis: rowAxis,
        colAxis: colAxis,
        firstAxis: 'col'
      };
    }
  / TABLE optionsClause:optionsClause? fromClause:fromClause? whereClause:whereClause? __ ROWS __ rowAxis:axis _ ";" {
      // Single axis form (row only, for lists)
      return {
        type: 'table',
        source: fromClause ?? null,
        where: whereClause ?? null,
        options: optionsClause ?? {},
        rowAxis: rowAxis,
        colAxis: null,
        firstAxis: 'row'
      };
    }

// ============================================================
// OPTIONS CLAUSE
// ============================================================

// OPTIONS clause: OPTIONS key:value key:value ...
// Example: OPTIONS rowHeaders:above
optionsClause
  = __ OPTIONS __ options:tableOption+ {
      return options.reduce((acc, opt) => ({ ...acc, ...opt }), {});
    }

// Individual option: key:value (no spaces around colon)
tableOption
  = _ "rowHeaders"i ":" value:("above"i / "left"i) {
      return { rowHeaders: value.toLowerCase() };
    }
  / _ "includeNulls"i ":" value:("true"i / "false"i) {
      return { includeNulls: value.toLowerCase() === 'true' };
    }

// ============================================================
// FROM AND WHERE CLAUSES
// ============================================================

fromClause
  = __ FROM __ source:sourceIdentifier { return source; }

whereClause
  = __ WHERE __ condition:whereExpression { return condition; }

// Source can be schema.table or just table
sourceIdentifier
  = schema:identifier "." table:identifier { return schema + '.' + table; }
  / table:identifier { return table; }

// WHERE expression captures everything up to ROWS keyword
// We use a permissive approach - capture raw SQL-like expression
whereExpression
  = expr:$whereChar+ { return expr.trim(); }

// Characters allowed in WHERE expressions (everything except start of ROWS)
whereChar
  = !(_ ROWS) .

// ============================================================
// AXIS EXPRESSIONS
// ============================================================

// An axis is one or more groups separated by | or THEN (concatenation)
axis
  = head:group tail:(concatOp group)* {
      const groups = [head, ...tail.map(t => t[1])];
      return makeAxis(groups);
    }

// Concatenation operator: | or THEN
concatOp
  = _ "|" _ { return '|'; }
  / __ THEN __ { return 'THEN'; }

// A group is one or more items joined by * or BY (crossing/nesting)
group
  = head:item tail:(nestOp item)* {
      const items = [head, ...tail.map(t => t[1])];
      return makeGroup(items);
    }

// Nesting operator: * or BY
nestOp
  = _ "*" _ { return '*'; }
  / __ BY __ { return 'BY'; }

// An item is a single element or a parenthesized sub-expression
// Labels are optional quoted strings after the element
item
  = percentageAggregateRef
  / "(" _ inner:axis _ ")" "." "(" _ aggs:aggregationList _ ")" annotations:annotations label:inlineLabel? {
      // (revenue | cost).(sum | mean) - group binding with multiple aggregations
      const ann = mergeAnnotations(annotations);
      if (label) ann.label = label;
      return { type: 'annotatedGroup', inner: inner, aggregations: aggs, ...ann };
    }
  / "(" _ inner:axis _ ")" "." agg:aggregationSpec annotations:annotations label:inlineLabel? {
      // (revenue cost).sum - group binding with single aggregation
      const ann = mergeAnnotations(annotations);
      if (label) ann.label = label;
      return { type: 'annotatedGroup', inner: inner, aggregations: [agg], ...ann };
    }
  / "(" _ inner:axis _ ")" annotations:annotations label:inlineLabel? {
      const ann = mergeAnnotations(annotations);
      if (label) ann.label = label;
      // If annotations present, wrap in annotated group for compiler to distribute
      if (Object.keys(ann).length > 0) {
        return { type: 'annotatedGroup', inner: inner, ...ann };
      }
      return inner;
    }
  / allRef
  / aggregationRef
  / fieldRef

// Inline label: optional quoted string after whitespace
inlineLabel
  = __ label:stringLiteral { return label; }

// ============================================================
// PERCENTAGE AGGREGATES (ACROSS syntax)
// ============================================================

// Percentage aggregate: measure.agg ACROSS [scope] or (agg ACROSS [scope])
// Examples:
//   (count ACROSS)           - cell percentage of grand total (standalone agg needs parens)
//   income.sum ACROSS        - sum as cell percentage
//   income.sum ACROSS COLS   - row percentage (each row sums to 100%)
//   income.sum ACROSS ROWS   - column percentage (each column sums to 100%)
//   count ACROSS gender      - percentage within gender grouping
//
// Note: measure.agg ACROSS scope does NOT require enclosing parentheses,
// which allows concatenation like: education * (income.sum ACROSS COLS | income.mean)
percentageAggregateRef
  = measure:identifier "." method:aggregationKeyword __ "ACROSS"i scope:percentageScope? annotations:annotations label:inlineLabel? {
      // measure.agg ACROSS [scope] - measure binding percentage (no enclosing parens required)
      const ann = mergeAnnotations(annotations);
      if (label) ann.label = label;
      return makePercentageAggregate(measure, method, scope ?? 'all', ann);
    }
  / method:aggregationKeyword __ "ACROSS"i scope:percentageScope? annotations:annotations label:inlineLabel? {
      // agg ACROSS [scope] - standalone aggregation percentage (e.g., count ACROSS)
      const ann = mergeAnnotations(annotations);
      if (label) ann.label = label;
      return makePercentageAggregate(null, method, scope ?? 'all', ann);
    }

// Scope for percentage denominator
percentageScope
  = __ "COLS"i !identifierChar { return 'cols'; }  // Row percentage (divide by row total)
  / __ "ROWS"i !identifierChar { return 'rows'; }  // Column percentage (divide by column total)
  / __ dims:dimensionList { return dims; }          // Specific dimensions

// ============================================================
// FIELD REFERENCES (dimensions and measures)
// ============================================================

// A field reference - can be:
// 1. Simple identifier (dimension or format-annotated measure)
// 2. Binding: identifier.aggregation (measure bound to single agg)
// 3. Binding: identifier.(agg1 agg2) (measure bound to multiple aggs)
// 4. With optional ASC/DESC keyword for ordering (e.g., state ASC or state DESC)
fieldRef
  = name:identifier "." "(" _ aggs:aggregationList _ ")" annotations:annotations label:inlineLabel? {
      // measure.(sum | mean) - binding with multiple aggregations
      const ann = mergeAnnotations(annotations);
      if (label) ann.label = label;
      return makeBinding(name, aggs, ann);
    }
  / name:identifier "." agg:aggregationSpec annotations:annotations label:inlineLabel? {
      // measure.sum or measure.sum:currency - binding with single aggregation
      const ann = mergeAnnotations(annotations);
      if (label) ann.label = label;
      return makeBinding(name, [agg], ann);
    }
  / name:identifier preAnn:preAnnotations orderDir:orderDirection? postAnn:postAnnotations label:inlineLabel? {
      const ann = mergeAnnotations([...preAnn, ...postAnn]);
      if (label) ann.label = label;

      // Forbid redundant limit + ASC/DESC combinations
      // If there's a limit, the direction comes from [-N] vs [N], not ASC/DESC
      if (ann.limit && orderDir) {
        error('Cannot combine limit [N] with ASC/DESC keyword. Use [-N] for descending or [N] for ascending.');
      }

      // Merge order direction with order annotation if both present
      if (orderDir) {
        if (ann.order) {
          // Merge direction into existing order (from @field.agg annotation)
          ann.order.direction = orderDir;
        } else {
          // Create new order with just direction
          ann.order = { direction: orderDir };
        }
      } else if (ann.order && !ann.order.direction) {
        // Default direction is DESC when using @field.agg without explicit ASC/DESC
        ann.order.direction = 'desc';
      }

      // If it has a format, it's likely a measure; otherwise dimension
      // The compiler will resolve this based on schema
      if (ann.format) {
        return makeMeasure(name, ann);
      }
      return makeDimension(name, ann);
    }

// Order direction keyword: ASC or DESC
orderDirection
  = __ dir:("ASC"i / "DESC"i) !identifierChar { return dir.toLowerCase(); }

// List of aggregation specs for multi-binding: (sum | mean) or (sum THEN mean) or (sum:currency | mean:decimal.2)
// Supports both | and THEN as separators for consistency with axis operators
aggregationList
  = head:aggregationSpec tail:(aggListSep aggregationSpec)* {
      return [head, ...tail.map(t => t[1])];
    }

// Separator for aggregation list: | or THEN
aggListSep
  = _ "|" _ { return '|'; }
  / __ THEN __ { return 'THEN'; }

// Aggregation keyword with optional format and label: sum, sum:currency, sum "Total", sum:currency "Total"
aggregationSpec
  = method:aggregationKeyword format:formatAnnotation? label:inlineLabel? {
      const result = { method };
      if (format && format.format) result.format = format.format;
      if (label) result.label = label;
      return result;
    }

// ============================================================
// AGGREGATION REFERENCES
// ============================================================

aggregationRef
  = method:aggregationKeyword annotations:annotations label:inlineLabel? {
      const ann = mergeAnnotations(annotations);
      if (label) ann.label = label;
      return makeAggregation(method, ann);
    }

aggregationKeyword
  = "sum"i !identifierChar { return 'sum'; }
  / "mean"i !identifierChar { return 'mean'; }
  / "avg"i !identifierChar { return 'mean'; }
  / "count"i !identifierChar { return 'count'; }
  / "min"i !identifierChar { return 'min'; }
  / "max"i !identifierChar { return 'max'; }
  / "median"i !identifierChar { return 'median'; }
  / "stdev"i !identifierChar { return 'stdev'; }
  / "pct"i !identifierChar { return 'pct'; }
  / "pctn"i !identifierChar { return 'pctn'; }
  / "pctsum"i !identifierChar { return 'pctsum'; }
  / "n"i !identifierChar { return 'count'; }
  // Percentile aggregations (require window function workaround)
  / "p25"i !identifierChar { return 'p25'; }
  / "p50"i !identifierChar { return 'p50'; }
  / "p75"i !identifierChar { return 'p75'; }
  / "p90"i !identifierChar { return 'p90'; }
  / "p95"i !identifierChar { return 'p95'; }
  / "p99"i !identifierChar { return 'p99'; }

identifierChar
  = [a-zA-Z0-9_]

// ============================================================
// ALL (totals)
// ============================================================

allRef
  = "ALL"i annotations:annotations label:inlineLabel? {
      const ann = mergeAnnotations(annotations);
      if (label) ann.label = label;
      return makeAll(ann);
    }

// ============================================================
// ANNOTATIONS
// ============================================================

// All annotations (used in most places)
annotations
  = ann:annotation* { return ann; }

// Annotations that come before orderDirection (limit, format, diff, over)
preAnnotations
  = ann:preAnnotation* { return ann; }

// Annotations that come after orderDirection (order @)
postAnnotations
  = ann:postAnnotation* { return ann; }

annotation
  = formatAnnotation
  / limitAnnotation
  / orderAnnotation
  / diffAnnotation
  / overAnnotation

preAnnotation
  = formatAnnotation
  / limitAnnotation
  / diffAnnotation
  / overAnnotation

postAnnotation
  = orderAnnotation

// Format: :currency or :decimal.2 or :"#,##0.00"
formatAnnotation
  = _ ":" _ format:formatSpec {
      return { format: format };
    }

formatSpec
  = "currency"i { return { type: 'currency' }; }
  / "percent"i { return { type: 'percent' }; }
  / "integer"i { return { type: 'integer' }; }
  / "decimal"i "." digits:$[0-9]+ { return { type: 'decimal', precision: parseInt(digits, 10) }; }
  / "comma"i "." digits:$[0-9]+ { return { type: 'comma', precision: parseInt(digits, 10) }; }
  / str:stringLiteral { return { type: 'custom', pattern: str }; }

// Limit: [10] or [-10] or [-10@revenue.sum]
// Negative number means "top N" (descending), positive means ascending
limitAnnotation
  = _ "[" _ sign:"-"? _ count:$[0-9]+ _ orderBy:limitOrderBy? _ "]" {
      const direction = sign ? 'desc' : 'asc';
      const limit = {
        count: parseInt(count, 10),
        direction
      };
      if (orderBy) {
        limit.orderBy = orderBy;
      }
      return { limit };
    }

// Order-by for limits: @field.agg or @(ratio/across expression) or @count/n or @field.agg ACROSS dims
limitOrderBy
  = "@" "(" _ expr:orderByExpressionInParens _ ")" { return expr; }
  / "@" expr:aggregateExpressionWithAcross { return expr; }
  / "@" agg:aggregationKeyword {
      // Standalone count/n (or other aggregation keywords) - use empty field
      return makeAggregateExpr('', agg, null);
    }
  / "@" field:identifier "." agg:aggregationKeyword { return field + '.' + agg; }
  / "@" field:identifier { return field; }

// Expression inside @(...) - can be explicit ratio or implicit ratio via ACROSS
orderByExpressionInParens
  = left:aggregateExpression _ "/" _ right:aggregateExpressionWithAcross {
      // Explicit ratio: births.sum / births.sum ACROSS name
      return makeRatioExpr(left, right);
    }
  / expr:aggregateExpressionWithAcross {
      // Implicit ratio: births.sum ACROSS name -> births.sum / births.sum ACROSS name
      if (expr.ungroupedDimensions && expr.ungroupedDimensions.length > 0) {
        // Create implicit ratio: same measure/agg as numerator and denominator
        const numerator = makeAggregateExpr(expr.field, expr.function, null);
        return makeRatioExpr(numerator, expr);
      }
      // No ACROSS, just a simple aggregate
      return expr;
    }

// Aggregate expression with optional ACROSS dimensions
// e.g., births.sum or births.sum ACROSS name or births.sum ACROSS name state
aggregateExpressionWithAcross
  = field:identifier "." agg:aggregationKeyword ungrouped:ungroupedSpec? {
      return makeAggregateExpr(field, agg, ungrouped);
    }

// Simple aggregate expression (no ACROSS) for ratio numerators
aggregateExpression
  = field:identifier "." agg:aggregationKeyword {
      return makeAggregateExpr(field, agg, null);
    }

// Ungrouped dimension specification: ACROSS dim1 dim2 ... or ACROSS (dim1 dim2)
ungroupedSpec
  = __ "ACROSS"i __ "(" _ dims:dimensionList _ ")" { return dims; }
  / __ "ACROSS"i __ dims:dimensionList { return dims; }

// List of dimension names (space or comma separated)
dimensionList
  = head:identifier tail:(__ identifier)* {
      return [head, ...tail.map(t => t[1])];
    }

// Order: @field.agg or @(expression) or @count/n - same syntax as limitOrderBy but without the limit
// Note: Direction (ASC/DESC) is handled separately and merged with this
orderAnnotation
  = _ "@" _ "(" _ expr:orderByExpressionInParens _ ")" {
      return { order: { orderBy: expr } };
    }
  / _ "@" _ expr:aggregateExpressionWithAcross {
      return { order: { orderBy: expr } };
    }
  / _ "@" _ agg:aggregationKeyword {
      // Standalone count/n (or other aggregation keywords) - use empty field
      return { order: { orderBy: makeAggregateExpr('', agg, null) } };
    }
  / _ "@" _ field:identifier "." agg:aggregationKeyword {
      return { order: { orderBy: field + '.' + agg } };
    }
  / _ "@" _ field:identifier {
      return { order: { orderBy: field } };
    }

// Diff: ~baseline or ~prior_year
diffAnnotation
  = _ "~" _ baseline:identifier {
      return { diff: baseline };
    }

// Over: /dimension (for percent-of calculations)
overAnnotation
  = _ "/" _ dimension:identifier {
      return { over: dimension };
    }
  / _ "/" _ "ALL"i {
      return { over: 'ALL' };
    }

// ============================================================
// LEXICAL RULES
// ============================================================

identifier
  = !reservedWord id:$([a-zA-Z_][a-zA-Z0-9_]*) { return id; }

reservedWord
  = ("TABLE"i / "OPTIONS"i / "FROM"i / "WHERE"i / "ROWS"i / "COLS"i / "COLUMNS"i / "ALL"i / "THEN"i / "BY"i / "ASC"i / "DESC"i / "ACROSS"i) !identifierChar

stringLiteral
  = '"' chars:$[^"]* '"' { return chars; }
  / "'" chars:$[^']* "'" { return chars; }

// Reserved words
TABLE = "TABLE"i
OPTIONS = "OPTIONS"i
FROM = "FROM"i
WHERE = "WHERE"i
ROWS = "ROWS"i
COLS = "COLS"i / "COLUMNS"i
THEN = "THEN"i
BY = "BY"i

// Whitespace
_ "whitespace"
  = [ \t\n\r]*

__ "mandatory whitespace"
  = [ \t\n\r]+
