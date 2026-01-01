/**
 * TPL Parser using Chevrotain
 *
 * A TypeScript-native recursive descent parser for TPL.
 * This is a parallel implementation to the Peggy-based parser,
 * producing the same AST types.
 */

import { createToken, Lexer, CstParser, CstNode, IToken } from 'chevrotain';
import {
  TPLStatement,
  TableOptions,
  AxisExpression,
  GroupExpression,
  ItemExpression,
  DimensionRef,
  MeasureRef,
  AggregationRef,
  MeasureBinding,
  PercentageAggregateRef,
  AllRef,
  AnnotatedGroupRef,
  FormatSpec,
  OrderSpec,
  LimitSpec,
  AggregationMethod,
  AggregationSpec,
} from './ast.js';

// ---
// TOKEN DEFINITIONS
// ---

// Word boundary helper - matches when NOT followed by identifier chars
const WB = '(?![a-zA-Z0-9_])';

// Keywords - use word boundary to prevent matching as part of longer identifiers
const Table = createToken({ name: 'Table', pattern: new RegExp(`TABLE${WB}`, 'i') });
const Options = createToken({ name: 'Options', pattern: new RegExp(`OPTIONS${WB}`, 'i') });
const From = createToken({ name: 'From', pattern: new RegExp(`FROM${WB}`, 'i') });
const Where = createToken({ name: 'Where', pattern: new RegExp(`WHERE${WB}`, 'i') });
const Rows = createToken({ name: 'Rows', pattern: new RegExp(`ROWS${WB}`, 'i') });
const Cols = createToken({ name: 'Cols', pattern: new RegExp(`COL(S|UMNS?)${WB}`, 'i') });
const All = createToken({ name: 'All', pattern: new RegExp(`ALL${WB}`, 'i') });
const Then = createToken({ name: 'Then', pattern: new RegExp(`THEN${WB}`, 'i') });
const By = createToken({ name: 'By', pattern: new RegExp(`BY${WB}`, 'i') });
const Across = createToken({ name: 'Across', pattern: new RegExp(`ACROSS${WB}`, 'i') });

// Option keywords (for OPTIONS clause)
const RowHeaders = createToken({ name: 'RowHeaders', pattern: /rowHeaders/i });
const IncludeNulls = createToken({ name: 'IncludeNulls', pattern: /includeNulls/i });
const Above = createToken({ name: 'Above', pattern: /above/i });
const Left = createToken({ name: 'Left', pattern: /left/i });
const TrueKeyword = createToken({ name: 'TrueKeyword', pattern: /true/i });
const FalseKeyword = createToken({ name: 'FalseKeyword', pattern: /false/i });

// Logical operators for WHERE
const And = createToken({ name: 'And', pattern: new RegExp(`AND${WB}`, 'i') });
const Or = createToken({ name: 'Or', pattern: new RegExp(`OR${WB}`, 'i') });
const Not = createToken({ name: 'Not', pattern: new RegExp(`NOT${WB}`, 'i') });

// Aggregation keywords (longer patterns first for proper ordering)
const Pctsum = createToken({ name: 'Pctsum', pattern: new RegExp(`pctsum${WB}`, 'i') });
const Pctn = createToken({ name: 'Pctn', pattern: new RegExp(`pctn${WB}`, 'i') });
const Pct = createToken({ name: 'Pct', pattern: new RegExp(`pct${WB}`, 'i') });
const Median = createToken({ name: 'Median', pattern: new RegExp(`median${WB}`, 'i') });
const Stdev = createToken({ name: 'Stdev', pattern: new RegExp(`stdev${WB}`, 'i') });
const Count = createToken({ name: 'Count', pattern: new RegExp(`count${WB}`, 'i') });
const Mean = createToken({ name: 'Mean', pattern: new RegExp(`mean${WB}`, 'i') });
const Avg = createToken({ name: 'Avg', pattern: new RegExp(`avg${WB}`, 'i') });
const Sum = createToken({ name: 'Sum', pattern: new RegExp(`sum${WB}`, 'i') });
const Min = createToken({ name: 'Min', pattern: new RegExp(`min${WB}`, 'i') });
const Max = createToken({ name: 'Max', pattern: new RegExp(`max${WB}`, 'i') });
const N = createToken({ name: 'N', pattern: new RegExp(`n${WB}`, 'i') });

// Format keywords
const Currency = createToken({ name: 'Currency', pattern: new RegExp(`currency${WB}`, 'i') });
const Percent = createToken({ name: 'Percent', pattern: new RegExp(`percent${WB}`, 'i') });
const Integer = createToken({ name: 'Integer', pattern: new RegExp(`integer${WB}`, 'i') });
const Decimal = createToken({ name: 'Decimal', pattern: new RegExp(`decimal${WB}`, 'i') });
const Comma = createToken({ name: 'Comma', pattern: new RegExp(`comma${WB}`, 'i') });

// Sort direction
const Asc = createToken({ name: 'Asc', pattern: new RegExp(`asc${WB}`, 'i') });
const Desc = createToken({ name: 'Desc', pattern: new RegExp(`desc${WB}`, 'i') });

// Identifier comes after all keywords
const Identifier = createToken({ name: 'Identifier', pattern: /[a-zA-Z_][a-zA-Z0-9_]*/ });

// Literals
const StringLiteral = createToken({
  name: 'StringLiteral',
  pattern: /"[^"]*"|'[^']*'/,
});
const NumberLiteral = createToken({ name: 'NumberLiteral', pattern: /\d+/ });

// Operators and punctuation
const Pipe = createToken({ name: 'Pipe', pattern: /\|/ });
const Star = createToken({ name: 'Star', pattern: /\*/ });
const LParen = createToken({ name: 'LParen', pattern: /\(/ });
const RParen = createToken({ name: 'RParen', pattern: /\)/ });
const LBracket = createToken({ name: 'LBracket', pattern: /\[/ });
const RBracket = createToken({ name: 'RBracket', pattern: /]/ });
const Minus = createToken({ name: 'Minus', pattern: /-/ });
const Semicolon = createToken({ name: 'Semicolon', pattern: /;/ });
const Colon = createToken({ name: 'Colon', pattern: /:/ });
const At = createToken({ name: 'At', pattern: /@/ });
const Tilde = createToken({ name: 'Tilde', pattern: /~/ });
const Slash = createToken({ name: 'Slash', pattern: /\// });
const Dot = createToken({ name: 'Dot', pattern: /\./ });
const CommaPunct = createToken({ name: 'CommaPunct', pattern: /,/ });

// Comparison operators for WHERE clause (includes = for equality)
const ComparisonOp = createToken({ name: 'ComparisonOp', pattern: />=|<=|!=|<>|>|<|=/ });

// Whitespace (skipped)
const WhiteSpace = createToken({
  name: 'WhiteSpace',
  pattern: /\s+/,
  group: Lexer.SKIPPED,
});

// Token order matters! Keywords before Identifier
const allTokens = [
  WhiteSpace,
  // Keywords (longer first)
  Table,
  Options,
  From,
  Where,
  Rows,
  Cols,
  All,
  Then,
  By,
  Across,
  // Option keywords (before Identifier)
  RowHeaders,
  IncludeNulls,
  Above,
  Left,
  TrueKeyword,
  FalseKeyword,
  // Logical (for WHERE) - before shorter tokens
  And,
  Or,
  Not,
  // Aggregations (longer patterns first)
  Pctsum,
  Pctn,
  Pct,
  Median,
  Stdev,
  Count,
  Mean,
  Avg,
  Sum,
  Min,
  Max,
  N, // Must be last among aggs due to negative lookahead
  // Format keywords
  Currency,
  Percent,
  Integer,
  Decimal,
  Comma,
  // Sort
  Asc,
  Desc,
  // Identifier last among words
  Identifier,
  // Literals
  StringLiteral,
  NumberLiteral,
  // Operators (order by length)
  ComparisonOp,
  Pipe,
  Star,
  LParen,
  RParen,
  LBracket,
  RBracket,
  Minus,
  Semicolon,
  Colon,
  At,
  Tilde,
  Slash,
  Dot,
  CommaPunct,
];

const TPLLexer = new Lexer(allTokens);

// ---
// PARSER
// ---

class TPLParser extends CstParser {
  constructor() {
    super(allTokens);
    this.performSelfAnalysis();
  }

  // Main entry point
  public tableStatement = this.RULE('tableStatement', () => {
    this.CONSUME(Table);
    this.OPTION(() => {
      this.SUBRULE(this.optionsClause);
    });
    this.OPTION2(() => {
      this.SUBRULE(this.fromClause);
    });
    this.OPTION3(() => {
      this.SUBRULE(this.whereClause);
    });
    // Allow ROWS/COLS in either order
    this.OR([
      {
        // ROWS first, then optional COLS
        ALT: () => {
          this.CONSUME(Rows);
          this.SUBRULE(this.axis, { LABEL: 'rowAxis' });
          this.OPTION4(() => {
            this.CONSUME(Cols);
            this.SUBRULE2(this.axis, { LABEL: 'colAxis' });
          });
        },
      },
      {
        // COLS first, then ROWS
        ALT: () => {
          this.CONSUME2(Cols);
          this.SUBRULE3(this.axis, { LABEL: 'colAxis' });
          this.CONSUME2(Rows);
          this.SUBRULE4(this.axis, { LABEL: 'rowAxis' });
        },
      },
    ]);
    this.CONSUME(Semicolon);
  });

  // OPTIONS clause: OPTIONS key:value key:value ...
  private optionsClause = this.RULE('optionsClause', () => {
    this.CONSUME(Options);
    this.AT_LEAST_ONE(() => {
      this.SUBRULE(this.tableOption, { LABEL: 'options' });
    });
  });

  // Individual option: key:value (no spaces around colon)
  private tableOption = this.RULE('tableOption', () => {
    this.OR([
      {
        ALT: () => {
          this.CONSUME(RowHeaders, { LABEL: 'optionKey' });
          this.CONSUME(Colon);
          this.OR2([
            { ALT: () => this.CONSUME(Above, { LABEL: 'value' }) },
            { ALT: () => this.CONSUME(Left, { LABEL: 'value' }) },
          ]);
        }
      },
      {
        ALT: () => {
          this.CONSUME(IncludeNulls, { LABEL: 'optionKey' });
          this.CONSUME2(Colon);
          this.OR3([
            { ALT: () => this.CONSUME(TrueKeyword, { LABEL: 'value' }) },
            { ALT: () => this.CONSUME(FalseKeyword, { LABEL: 'value' }) },
          ]);
        }
      },
    ]);
  });

  private fromClause = this.RULE('fromClause', () => {
    this.CONSUME(From);
    this.SUBRULE(this.sourceIdentifier);
  });

  private sourceIdentifier = this.RULE('sourceIdentifier', () => {
    this.CONSUME(Identifier, { LABEL: 'schema' });
    this.OPTION(() => {
      this.CONSUME(Dot);
      this.CONSUME2(Identifier, { LABEL: 'table' });
    });
  });

  private whereClause = this.RULE('whereClause', () => {
    this.CONSUME(Where);
    this.SUBRULE(this.whereExpression);
  });

  // Simplified WHERE expression - captures tokens until ROWS
  private whereExpression = this.RULE('whereExpression', () => {
    this.AT_LEAST_ONE(() => {
      this.OR([
        { ALT: () => this.CONSUME(Identifier) },
        { ALT: () => this.CONSUME(StringLiteral) },
        { ALT: () => this.CONSUME(NumberLiteral) },
        { ALT: () => this.CONSUME(ComparisonOp) },
        { ALT: () => this.CONSUME(And) },
        { ALT: () => this.CONSUME(Or) },
        { ALT: () => this.CONSUME(Not) },
        { ALT: () => this.CONSUME(Dot) },
        { ALT: () => this.CONSUME(LParen) },
        { ALT: () => this.CONSUME(RParen) },
      ]);
    });
  });

  // Axis = one or more groups separated by | or THEN (concatenation)
  private axis = this.RULE('axis', () => {
    this.SUBRULE(this.group, { LABEL: 'groups' });
    this.MANY(() => {
      this.SUBRULE(this.concatOp);
      this.SUBRULE2(this.group, { LABEL: 'groups' });
    });
  });

  // Concatenation operator: | or THEN
  private concatOp = this.RULE('concatOp', () => {
    this.OR([
      { ALT: () => this.CONSUME(Pipe) },
      { ALT: () => this.CONSUME(Then) },
    ]);
  });

  // Group = one or more items joined by * or BY (crossing)
  private group = this.RULE('group', () => {
    this.SUBRULE(this.item, { LABEL: 'items' });
    this.MANY(() => {
      this.SUBRULE(this.nestOp);
      this.SUBRULE2(this.item, { LABEL: 'items' });
    });
  });

  // Nesting operator: * or BY
  private nestOp = this.RULE('nestOp', () => {
    this.OR([
      { ALT: () => this.CONSUME(Star) },
      { ALT: () => this.CONSUME(By) },
    ]);
  });

  // Item = atom or parenthesized sub-axis (with optional binding)
  private item = this.RULE('item', () => {
    this.OR([
      {
        // Percentage aggregate: income.sum ACROSS COLS or count ACROSS
        // Note: Does NOT require enclosing parentheses, allowing concatenation like:
        // (income.sum ACROSS COLS | income.mean)
        GATE: () => this.isPercentageAggregate(),
        ALT: () => this.SUBRULE(this.percentageAggregateRef),
      },
      {
        // Parenthesized group with optional binding: (...).<agg> or (...).(<aggs>)
        ALT: () => {
          this.CONSUME(LParen);
          this.SUBRULE(this.axis, { LABEL: 'innerAxis' });
          this.CONSUME(RParen);
          this.OPTION(() => {
            this.SUBRULE(this.bindingSuffix, { LABEL: 'groupBinding' });
          });
          this.SUBRULE(this.annotations, { LABEL: 'parenAnnotations' });
          this.OPTION2(() => {
            this.CONSUME(StringLiteral, { LABEL: 'parenLabel' });
          });
        },
      },
      { ALT: () => this.SUBRULE(this.allRef) },
      { ALT: () => this.SUBRULE(this.aggregationRef) },
      { ALT: () => this.SUBRULE(this.fieldRef) },
    ]);
  });

  // Lookahead helper: check if we're looking at a percentage aggregate pattern
  // Patterns: field.agg ACROSS... or agg ACROSS...
  // Note: Does NOT require parentheses - this allows concatenation like:
  // (income.sum ACROSS COLS | income.mean)
  private isPercentageAggregate(): boolean {
    const aggKeywords = [Sum, Mean, Avg, Count, Min, Max, Median, Stdev, Pct, Pctn, Pctsum, N];

    // Pattern 1: agg ACROSS ...
    const token1 = this.LA(1);
    const isAgg1 = aggKeywords.some(k => token1.tokenType === k);
    if (isAgg1) {
      const token2 = this.LA(2);
      return token2.tokenType === Across;
    }

    // Pattern 2: field.agg ACROSS ...
    if (token1.tokenType === Identifier) {
      const token2 = this.LA(2);
      if (token2.tokenType === Dot) {
        const token3 = this.LA(3);
        const isAgg3 = aggKeywords.some(k => token3.tokenType === k);
        if (isAgg3) {
          const token4 = this.LA(4);
          return token4.tokenType === Across;
        }
      }
    }

    return false;
  }

  // Percentage aggregate: income.sum ACROSS COLS or count ACROSS
  // Note: Does NOT consume parentheses - this allows concatenation like:
  // (income.sum ACROSS COLS | income.mean)
  private percentageAggregateRef = this.RULE('percentageAggregateRef', () => {
    // Measure: field.agg or just agg
    this.OR([
      {
        // field.agg ACROSS
        ALT: () => {
          this.CONSUME(Identifier, { LABEL: 'measure' });
          this.CONSUME(Dot);
          this.SUBRULE(this.aggregationKeyword, { LABEL: 'method' });
        },
      },
      {
        // agg ACROSS (for count, etc.)
        ALT: () => {
          this.SUBRULE2(this.aggregationKeyword, { LABEL: 'method' });
        },
      },
    ]);

    this.CONSUME(Across);

    // Optional scope: ROWS, COLS, or dimension list
    this.OPTION(() => {
      this.SUBRULE(this.percentageScope, { LABEL: 'scope' });
    });

    // Annotations (format, etc.) and label
    this.SUBRULE(this.annotations, { LABEL: 'pctAnnotations' });
    this.OPTION2(() => {
      this.CONSUME(StringLiteral, { LABEL: 'pctLabel' });
    });
  });

  // Percentage scope: ROWS, COLS, or dimension list
  private percentageScope = this.RULE('percentageScope', () => {
    this.OR([
      { ALT: () => this.CONSUME(Rows, { LABEL: 'rows' }) },
      { ALT: () => this.CONSUME(Cols, { LABEL: 'cols' }) },
      {
        // Dimension list
        ALT: () => {
          this.AT_LEAST_ONE(() => {
            this.OPTION(() => this.CONSUME(CommaPunct));
            this.CONSUME(Identifier, { LABEL: 'dims' });
          });
        },
      },
    ]);
  });

  // Binding suffix: .<agg> or .(<agg1> | <agg2>) or .(<agg1> THEN <agg2>)
  private bindingSuffix = this.RULE('bindingSuffix', () => {
    this.CONSUME(Dot);
    this.OR([
      {
        // Multiple aggregations: .(sum | mean) or .(sum THEN mean)
        ALT: () => {
          this.CONSUME(LParen);
          this.SUBRULE(this.aggregationKeyword, { LABEL: 'aggs' });
          this.MANY(() => {
            this.SUBRULE(this.aggListSep);
            this.SUBRULE2(this.aggregationKeyword, { LABEL: 'aggs' });
          });
          this.CONSUME(RParen);
        },
      },
      {
        // Single aggregation: .sum
        ALT: () => {
          this.SUBRULE3(this.aggregationKeyword, { LABEL: 'singleAgg' });
        },
      },
    ]);
  });

  // Aggregation list separator: | or THEN (for consistency with axis operators)
  private aggListSep = this.RULE('aggListSep', () => {
    this.OR([
      { ALT: () => this.CONSUME(Pipe) },
      { ALT: () => this.CONSUME(Then) },
    ]);
  });

  // Aggregation keyword with optional format and label (returns AggregationSpec via visitor)
  // e.g., sum, mean:decimal.2, count:integer, sum "Total", sum:currency "Total"
  private aggregationKeyword = this.RULE('aggregationKeyword', () => {
    this.OR([
      { ALT: () => this.CONSUME(Sum) },
      { ALT: () => this.CONSUME(Mean) },
      { ALT: () => this.CONSUME(Avg) },
      { ALT: () => this.CONSUME(Count) },
      { ALT: () => this.CONSUME(Min) },
      { ALT: () => this.CONSUME(Max) },
      { ALT: () => this.CONSUME(Median) },
      { ALT: () => this.CONSUME(Stdev) },
      { ALT: () => this.CONSUME(Pct) },
      { ALT: () => this.CONSUME(Pctn) },
      { ALT: () => this.CONSUME(Pctsum) },
      { ALT: () => this.CONSUME(N) },
    ]);
    // Optional format specifier: :currency, :decimal.2, etc.
    this.OPTION(() => {
      this.SUBRULE(this.formatAnnotation, { LABEL: 'format' });
    });
    // Optional label: "Total", "Average", etc.
    this.OPTION2(() => {
      this.CONSUME(StringLiteral, { LABEL: 'aggLabel' });
    });
  });

  private allRef = this.RULE('allRef', () => {
    this.CONSUME(All);
    this.SUBRULE(this.annotations);
    this.OPTION(() => {
      this.CONSUME(StringLiteral, { LABEL: 'label' });
    });
  });

  private aggregationRef = this.RULE('aggregationRef', () => {
    this.OR([
      { ALT: () => this.CONSUME(Sum) },
      { ALT: () => this.CONSUME(Mean) },
      { ALT: () => this.CONSUME(Avg) },
      { ALT: () => this.CONSUME(Count) },
      { ALT: () => this.CONSUME(Min) },
      { ALT: () => this.CONSUME(Max) },
      { ALT: () => this.CONSUME(Median) },
      { ALT: () => this.CONSUME(Stdev) },
      { ALT: () => this.CONSUME(Pct) },
      { ALT: () => this.CONSUME(Pctn) },
      { ALT: () => this.CONSUME(Pctsum) },
      { ALT: () => this.CONSUME(N) },
    ]);
    this.SUBRULE(this.annotations);
    this.OPTION(() => {
      this.CONSUME(StringLiteral, { LABEL: 'label' });
    });
  });

  // Field reference with optional binding: field or field.<agg> or field.(<aggs>)
  // With optional ASC/DESC and inline label
  // Note: Split annotations into pre (before ASC/DESC) and post (after ASC/DESC)
  // This allows syntax like "field DESC@aggregate" while forbidding "field[5] DESC"
  private fieldRef = this.RULE('fieldRef', () => {
    this.CONSUME(Identifier);
    this.OPTION(() => {
      this.SUBRULE(this.bindingSuffix, { LABEL: 'fieldBinding' });
    });
    this.SUBRULE(this.preAnnotations, { LABEL: 'preAnn' });
    this.OPTION2(() => {
      this.SUBRULE(this.orderDirection, { LABEL: 'orderDir' });
    });
    this.SUBRULE(this.postAnnotations, { LABEL: 'postAnn' });
    this.OPTION3(() => {
      this.CONSUME(StringLiteral, { LABEL: 'label' });
    });
  });

  // Order direction: ASC or DESC
  private orderDirection = this.RULE('orderDirection', () => {
    this.OR([
      { ALT: () => this.CONSUME(Asc) },
      { ALT: () => this.CONSUME(Desc) },
    ]);
  });

  // All annotations (used in most contexts)
  private annotations = this.RULE('annotations', () => {
    this.MANY(() => {
      this.SUBRULE(this.annotation, { LABEL: 'annotationList' });
    });
  });

  // Annotations that come before orderDirection (limit, format, diff, over)
  private preAnnotations = this.RULE('preAnnotations', () => {
    this.MANY(() => {
      this.SUBRULE(this.preAnnotation, { LABEL: 'preAnnotationList' });
    });
  });

  // Annotations that come after orderDirection (order @)
  private postAnnotations = this.RULE('postAnnotations', () => {
    this.MANY(() => {
      this.SUBRULE(this.postAnnotation, { LABEL: 'postAnnotationList' });
    });
  });

  private annotation = this.RULE('annotation', () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.formatAnnotation) },
      { ALT: () => this.SUBRULE(this.limitAnnotation) },
      { ALT: () => this.SUBRULE(this.orderAnnotation) },
      { ALT: () => this.SUBRULE(this.diffAnnotation) },
      { ALT: () => this.SUBRULE(this.overAnnotation) },
    ]);
  });

  private preAnnotation = this.RULE('preAnnotation', () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.formatAnnotation) },
      { ALT: () => this.SUBRULE(this.limitAnnotation) },
      { ALT: () => this.SUBRULE(this.diffAnnotation) },
      { ALT: () => this.SUBRULE(this.overAnnotation) },
    ]);
  });

  private postAnnotation = this.RULE('postAnnotation', () => {
    this.SUBRULE(this.orderAnnotation);
  });

  private formatAnnotation = this.RULE('formatAnnotation', () => {
    this.CONSUME(Colon);
    this.SUBRULE(this.formatSpec);
  });

  private formatSpec = this.RULE('formatSpec', () => {
    this.OR([
      { ALT: () => this.CONSUME(Currency) },
      { ALT: () => this.CONSUME(Percent) },
      { ALT: () => this.CONSUME(Integer) },
      {
        ALT: () => {
          this.CONSUME(Decimal);
          this.CONSUME(Dot);
          this.CONSUME(NumberLiteral);
        },
      },
      {
        ALT: () => {
          this.CONSUME(Comma);
          this.CONSUME2(Dot);
          this.CONSUME2(NumberLiteral);
        },
      },
      { ALT: () => this.CONSUME(StringLiteral) },
    ]);
  });

  // Limit: [10] or [-10] or [-10@revenue.sum] or [-10@(births.sum ACROSS name)]
  private limitAnnotation = this.RULE('limitAnnotation', () => {
    this.CONSUME(LBracket);
    this.OPTION(() => {
      this.CONSUME(Minus, { LABEL: 'negative' });
    });
    this.CONSUME(NumberLiteral, { LABEL: 'count' });
    this.OPTION2(() => {
      this.SUBRULE(this.limitOrderBy, { LABEL: 'orderBy' });
    });
    this.CONSUME(RBracket);
  });

  // Order-by for limits: @(expr) or @field.agg or @count or @field
  private limitOrderBy = this.RULE('limitOrderBy', () => {
    this.CONSUME(At);
    this.OR([
      {
        // @(complex expression with optional ratio and ACROSS)
        ALT: () => {
          this.CONSUME(LParen);
          this.SUBRULE(this.orderByExpressionInParens, { LABEL: 'parenExpr' });
          this.CONSUME(RParen);
        },
      },
      {
        // @field.agg with optional ACROSS
        ALT: () => {
          this.SUBRULE(this.aggregateExpressionWithAcross, { LABEL: 'aggExpr' });
        },
      },
      {
        // @count or @n (standalone aggregation keyword)
        // This handles the case where users want to sort/limit by count without a measure
        ALT: () => {
          this.SUBRULE(this.aggregationKeyword, { LABEL: 'standaloneAgg' });
        },
      },
      {
        // @field (simple field reference)
        ALT: () => {
          this.CONSUME(Identifier, { LABEL: 'simpleField' });
        },
      },
    ]);
  });

  // Expression inside @(...) - can be ratio or single aggregate
  private orderByExpressionInParens = this.RULE('orderByExpressionInParens', () => {
    this.SUBRULE(this.aggregateExpressionWithAcross, { LABEL: 'left' });
    this.OPTION(() => {
      this.CONSUME(Slash);
      this.SUBRULE2(this.aggregateExpressionWithAcross, { LABEL: 'right' });
    });
  });

  // Aggregate expression: field.agg with optional ACROSS dims
  private aggregateExpressionWithAcross = this.RULE('aggregateExpressionWithAcross', () => {
    this.CONSUME(Identifier, { LABEL: 'field' });
    this.CONSUME(Dot);
    this.SUBRULE(this.aggregationKeyword, { LABEL: 'agg' });
    this.OPTION(() => {
      this.SUBRULE(this.ungroupedSpec, { LABEL: 'ungrouped' });
    });
  });

  // ACROSS dimension(s) - supports comma-separated or space-separated
  // e.g., ACROSS name or ACROSS gender, name or ACROSS gender name
  private ungroupedSpec = this.RULE('ungroupedSpec', () => {
    this.CONSUME(Across);
    this.OR([
      {
        // ACROSS (dim1 dim2) - parenthesized list
        ALT: () => {
          this.CONSUME(LParen);
          this.AT_LEAST_ONE(() => {
            this.CONSUME(Identifier, { LABEL: 'dims' });
          });
          this.CONSUME(RParen);
        },
      },
      {
        // ACROSS dim1, dim2, ... or ACROSS dim1 dim2 ...
        // First dimension required, then optional comma-separated or space-separated additional dims
        ALT: () => {
          this.CONSUME2(Identifier, { LABEL: 'dims' });
          this.MANY(() => {
            this.OPTION(() => {
              this.CONSUME(CommaPunct);
            });
            this.CONSUME3(Identifier, { LABEL: 'dims' });
          });
        },
      },
    ]);
  });

  // Order: @field.agg or @(expression) or @count/n - same syntax as limitOrderBy but without the limit
  private orderAnnotation = this.RULE('orderAnnotation', () => {
    this.CONSUME(At);
    this.OR([
      {
        // @(complex expression with optional ratio and ACROSS)
        ALT: () => {
          this.CONSUME(LParen);
          this.SUBRULE(this.orderByExpressionInParens, { LABEL: 'parenExpr' });
          this.CONSUME(RParen);
        },
      },
      {
        // @field.agg with optional ACROSS (handles both @field.agg and @field.agg ACROSS dims)
        ALT: () => {
          this.SUBRULE(this.aggregateExpressionWithAcross, { LABEL: 'aggExpr' });
        },
      },
      {
        // @count or @n (standalone count aggregation)
        // This handles the case where users want to sort by count without a measure
        ALT: () => {
          this.SUBRULE2(this.aggregationKeyword, { LABEL: 'standaloneAgg' });
        },
      },
      {
        // @field (simple field reference)
        ALT: () => {
          this.CONSUME(Identifier, { LABEL: 'simpleField' });
        },
      },
    ]);
  });

  private diffAnnotation = this.RULE('diffAnnotation', () => {
    this.CONSUME(Tilde);
    this.CONSUME(Identifier);
  });

  private overAnnotation = this.RULE('overAnnotation', () => {
    this.CONSUME(Slash);
    this.OR([
      { ALT: () => this.CONSUME(All) },
      { ALT: () => this.CONSUME(Identifier) },
    ]);
  });
}

// Create singleton parser instance
const parserInstance = new TPLParser();

// ---
// CST TO AST VISITOR
// ---

// Helper to create aggregate expression object
function makeAggregateExpr(field: string, func: string, ungroupedDims: string[] | null) {
  return {
    type: 'aggregateExpr' as const,
    field,
    function: func,
    ungroupedDimensions: ungroupedDims ?? [],
  };
}

// Helper to create ratio expression object
function makeRatioExpr(numerator: any, denominator: any) {
  return {
    type: 'ratioExpr' as const,
    numerator,
    denominator,
  };
}

// Get the base visitor class
const BaseTPLVisitor = parserInstance.getBaseCstVisitorConstructor();

class TPLToAstVisitor extends BaseTPLVisitor {
  constructor() {
    super();
    this.validateVisitor();
  }

  tableStatement(ctx: any): TPLStatement {
    const source = ctx.fromClause ? this.visit(ctx.fromClause) : null;
    const where = ctx.whereClause ? this.visit(ctx.whereClause) : null;
    const options = ctx.optionsClause ? this.visit(ctx.optionsClause[0]) : {};
    const rowAxis = this.visit(ctx.rowAxis[0]);
    const colAxis = ctx.colAxis ? this.visit(ctx.colAxis[0]) : null;

    // Determine which axis was declared first by comparing token positions
    // If no colAxis, default to 'row'
    let firstAxis: 'row' | 'col' = 'row';
    if (ctx.Cols && ctx.Rows) {
      // Find the first Rows and first Cols token
      const rowsToken = ctx.Rows[0];
      const colsToken = ctx.Cols[0];
      if (colsToken.startOffset < rowsToken.startOffset) {
        firstAxis = 'col';
      }
    }

    return {
      type: 'table',
      source,
      where,
      options,
      rowAxis,
      colAxis,
      firstAxis,
    };
  }

  optionsClause(ctx: any): Record<string, any> {
    if (!ctx.options) return {};
    return ctx.options.reduce((acc: any, opt: any) => {
      const parsed = this.visit(opt);
      return { ...acc, ...parsed };
    }, {});
  }

  tableOption(ctx: any): Record<string, any> {
    if (!ctx.optionKey || !ctx.value) return {};

    const key = ctx.optionKey[0].image;
    const value = ctx.value[0].image.toLowerCase();

    if (key.toLowerCase() === 'rowheaders') {
      return { rowHeaders: value };
    } else if (key.toLowerCase() === 'includenulls') {
      return { includeNulls: value === 'true' };
    }

    return {};
  }

  fromClause(ctx: any): string {
    return this.visit(ctx.sourceIdentifier[0]);
  }

  sourceIdentifier(ctx: any): string {
    const schema = ctx.schema[0].image;
    if (ctx.table) {
      return `${schema}.${ctx.table[0].image}`;
    }
    return schema;
  }

  whereClause(ctx: any): string {
    return this.visit(ctx.whereExpression[0]);
  }

  whereExpression(ctx: any): string {
    // Reconstruct the WHERE expression from tokens
    const allTokens: IToken[] = [];
    for (const key of Object.keys(ctx)) {
      const tokens = ctx[key];
      if (Array.isArray(tokens)) {
        allTokens.push(...tokens);
      }
    }

    // Sort by position and join
    allTokens.sort((a, b) => a.startOffset - b.startOffset);
    return allTokens.map(t => t.image).join(' ');
  }

  axis(ctx: any): AxisExpression {
    const groups = ctx.groups.map((g: CstNode) => this.visit(g));
    return { type: 'axis', groups };
  }

  concatOp(_ctx: any): void {
    // Just a separator, no value needed
  }

  group(ctx: any): GroupExpression {
    const items = ctx.items.map((i: CstNode) => this.visit(i));
    return { type: 'group', items };
  }

  nestOp(_ctx: any): void {
    // Just a separator, no value needed
  }

  aggListSep(_ctx: any): void {
    // Just a separator, no value needed
  }

  item(ctx: any): ItemExpression {
    // Check for percentage aggregate first
    if (ctx.percentageAggregateRef) {
      return this.visit(ctx.percentageAggregateRef[0]);
    }
    if (ctx.innerAxis) {
      const inner = this.visit(ctx.innerAxis[0]);
      const annotations = ctx.parenAnnotations
        ? this.visit(ctx.parenAnnotations[0])
        : {};

      // Get label if present
      if (ctx.parenLabel) {
        const raw = ctx.parenLabel[0].image;
        annotations.label = raw.slice(1, -1);
      }

      // Check for group binding: (...).<agg>
      if (ctx.groupBinding) {
        const aggregations = this.visit(ctx.groupBinding[0]);
        return { type: 'annotatedGroup', inner, aggregations, ...annotations } as AnnotatedGroupRef;
      }

      if (Object.keys(annotations).length > 0) {
        return { type: 'annotatedGroup', inner, ...annotations } as AnnotatedGroupRef;
      }
      return inner;
    }
    if (ctx.allRef) {
      return this.visit(ctx.allRef[0]);
    }
    if (ctx.aggregationRef) {
      return this.visit(ctx.aggregationRef[0]);
    }
    if (ctx.fieldRef) {
      return this.visit(ctx.fieldRef[0]);
    }
    throw new Error('Unexpected item structure');
  }

  percentageAggregateRef(ctx: any): PercentageAggregateRef {
    // Get measure name if present
    const measure = ctx.measure ? ctx.measure[0].image : undefined;

    // Get aggregation method - now returns AggregationSpec, extract method
    const aggSpec = this.visit(ctx.method[0]) as AggregationSpec;
    const method = aggSpec.method;

    // Get scope (default to 'all' if not specified)
    let denominatorScope: 'all' | 'rows' | 'cols' | string[] = 'all';
    if (ctx.scope) {
      denominatorScope = this.visit(ctx.scope[0]);
    }

    // Get annotations
    const annotations = ctx.pctAnnotations
      ? this.visit(ctx.pctAnnotations[0])
      : {};

    // Per-aggregation format from the aggregation spec takes precedence
    if (aggSpec.format && !annotations.format) {
      annotations.format = aggSpec.format;
    }

    // Get label if present
    if (ctx.pctLabel) {
      const raw = ctx.pctLabel[0].image;
      annotations.label = raw.slice(1, -1);
    }

    return {
      type: 'percentageAggregate',
      measure,
      method,
      denominatorScope,
      ...annotations,
    };
  }

  percentageScope(ctx: any): 'all' | 'rows' | 'cols' | string[] {
    if (ctx.rows) return 'rows';
    if (ctx.cols) return 'cols';
    if (ctx.dims) {
      return ctx.dims.map((d: IToken) => d.image);
    }
    return 'all';
  }

  bindingSuffix(ctx: any): AggregationSpec[] {
    // Multiple aggregations in parens
    if (ctx.aggs) {
      return ctx.aggs.map((agg: CstNode) => this.visit(agg));
    }
    // Single aggregation
    if (ctx.singleAgg) {
      return [this.visit(ctx.singleAgg[0])];
    }
    throw new Error('Unexpected binding suffix structure');
  }

  aggregationKeyword(ctx: any): AggregationSpec {
    let method: AggregationMethod;
    if (ctx.Sum) method = 'sum';
    else if (ctx.Mean || ctx.Avg) method = 'mean';
    else if (ctx.Count || ctx.N) method = 'count';
    else if (ctx.Min) method = 'min';
    else if (ctx.Max) method = 'max';
    else if (ctx.Median) method = 'median';
    else if (ctx.Stdev) method = 'stdev';
    else if (ctx.Pct) method = 'pct';
    else if (ctx.Pctn) method = 'pctn';
    else if (ctx.Pctsum) method = 'pctsum';
    else throw new Error('Unknown aggregation keyword');

    // Check for optional format specifier
    const result: AggregationSpec = { method };
    if (ctx.format) {
      // formatAnnotation returns { format: FormatSpec }, extract the inner format
      const formatAnn = this.visit(ctx.format[0]);
      result.format = formatAnn.format;
    }
    // Check for optional label
    if (ctx.aggLabel) {
      const raw = ctx.aggLabel[0].image;
      result.label = raw.slice(1, -1); // Remove quotes
    }
    return result;
  }

  allRef(ctx: any): AllRef {
    const annotations = this.visit(ctx.annotations[0]);
    if (ctx.label) {
      const raw = ctx.label[0].image;
      annotations.label = raw.slice(1, -1);
    }
    return { type: 'all', ...annotations };
  }

  aggregationRef(ctx: any): AggregationRef {
    // Determine which aggregation keyword was used
    let method: AggregationMethod;
    if (ctx.Sum) method = 'sum';
    else if (ctx.Mean || ctx.Avg) method = 'mean';
    else if (ctx.Count || ctx.N) method = 'count';
    else if (ctx.Min) method = 'min';
    else if (ctx.Max) method = 'max';
    else if (ctx.Median) method = 'median';
    else if (ctx.Stdev) method = 'stdev';
    else if (ctx.Pct) method = 'pct';
    else if (ctx.Pctn) method = 'pctn';
    else if (ctx.Pctsum) method = 'pctsum';
    else throw new Error('Unknown aggregation method');

    const annotations = this.visit(ctx.annotations[0]);
    if (ctx.label) {
      const raw = ctx.label[0].image;
      annotations.label = raw.slice(1, -1);
    }
    return { type: 'aggregation', method, ...annotations };
  }

  orderDirection(ctx: any): string {
    if (ctx.Asc) return 'asc';
    if (ctx.Desc) return 'desc';
    throw new Error('Unknown order direction');
  }

  fieldRef(ctx: any): DimensionRef | MeasureRef | MeasureBinding {
    const name = ctx.Identifier[0].image;

    // Merge pre and post annotations
    const preAnn = this.visit(ctx.preAnn[0]);
    const postAnn = this.visit(ctx.postAnn[0]);
    const annotations = { ...preAnn, ...postAnn };

    // Get label if present
    if (ctx.label) {
      const raw = ctx.label[0].image;
      annotations.label = raw.slice(1, -1);
    }

    // Check for binding: field.<agg>
    if (ctx.fieldBinding) {
      const aggregations = this.visit(ctx.fieldBinding[0]);
      return { type: 'binding', measure: name, aggregations, ...annotations };
    }

    // Check for ASC/DESC
    if (ctx.orderDir) {
      const dir = this.visit(ctx.orderDir[0]);
      // If there's a limit, can't also have ASC/DESC
      if (annotations.limit) {
        throw new Error('Cannot combine limit [N] with ASC/DESC keyword. Use [-N] for descending or [N] for ascending.');
      }
      // Merge direction into existing order (from @field.agg annotation) or create new order
      if (annotations.order) {
        annotations.order.direction = dir;
      } else {
        annotations.order = { direction: dir };
      }
    } else if (annotations.order && !annotations.order.direction) {
      // Default direction is DESC when using @field.agg without explicit ASC/DESC
      annotations.order.direction = 'desc';
    }

    // If has format, it's a measure; otherwise dimension
    if (annotations.format) {
      return { type: 'measure', name, ...annotations };
    }
    return { type: 'dimension', name, ...annotations };
  }

  annotations(ctx: any): Record<string, any> {
    if (!ctx.annotationList) return {};

    const result: Record<string, any> = {};
    for (const ann of ctx.annotationList) {
      const parsed = this.visit(ann);
      Object.assign(result, parsed);
    }
    return result;
  }

  preAnnotations(ctx: any): Record<string, any> {
    if (!ctx.preAnnotationList) return {};

    const result: Record<string, any> = {};
    for (const ann of ctx.preAnnotationList) {
      const parsed = this.visit(ann);
      Object.assign(result, parsed);
    }
    return result;
  }

  postAnnotations(ctx: any): Record<string, any> {
    if (!ctx.postAnnotationList) return {};

    const result: Record<string, any> = {};
    for (const ann of ctx.postAnnotationList) {
      const parsed = this.visit(ann);
      Object.assign(result, parsed);
    }
    return result;
  }

  annotation(ctx: any): Record<string, any> {
    if (ctx.formatAnnotation) return this.visit(ctx.formatAnnotation[0]);
    if (ctx.limitAnnotation) return this.visit(ctx.limitAnnotation[0]);
    if (ctx.orderAnnotation) return this.visit(ctx.orderAnnotation[0]);
    if (ctx.diffAnnotation) return this.visit(ctx.diffAnnotation[0]);
    if (ctx.overAnnotation) return this.visit(ctx.overAnnotation[0]);
    return {};
  }

  preAnnotation(ctx: any): Record<string, any> {
    if (ctx.formatAnnotation) return this.visit(ctx.formatAnnotation[0]);
    if (ctx.limitAnnotation) return this.visit(ctx.limitAnnotation[0]);
    if (ctx.diffAnnotation) return this.visit(ctx.diffAnnotation[0]);
    if (ctx.overAnnotation) return this.visit(ctx.overAnnotation[0]);
    return {};
  }

  postAnnotation(ctx: any): Record<string, any> {
    if (ctx.orderAnnotation) return this.visit(ctx.orderAnnotation[0]);
    return {};
  }

  formatAnnotation(ctx: any): { format: FormatSpec } {
    return { format: this.visit(ctx.formatSpec[0]) };
  }

  formatSpec(ctx: any): FormatSpec {
    if (ctx.Currency) return { type: 'currency' };
    if (ctx.Percent) return { type: 'percent' };
    if (ctx.Integer) return { type: 'integer' };
    if (ctx.Decimal) {
      const precision = parseInt(ctx.NumberLiteral[0].image, 10);
      return { type: 'decimal', precision };
    }
    if (ctx.Comma) {
      const precision = parseInt(ctx.NumberLiteral[0].image, 10);
      return { type: 'comma', precision };
    }
    if (ctx.StringLiteral) {
      const raw = ctx.StringLiteral[0].image;
      return { type: 'custom', pattern: raw.slice(1, -1) };
    }
    throw new Error('Unknown format spec');
  }

  limitAnnotation(ctx: any): { limit: LimitSpec } {
    const count = parseInt(ctx.count[0].image, 10);
    const direction = ctx.negative ? 'desc' : 'asc';
    const limit: LimitSpec = { count, direction };

    if (ctx.orderBy) {
      limit.orderBy = this.visit(ctx.orderBy[0]);
    }

    return { limit };
  }

  limitOrderBy(ctx: any): any {
    // @(complex expression)
    if (ctx.parenExpr) {
      return this.visit(ctx.parenExpr[0]);
    }
    // @field.agg with optional ACROSS - create implicit ratio if ACROSS present
    if (ctx.aggExpr) {
      const aggExpr = this.visit(ctx.aggExpr[0]);
      // If ACROSS is present, create implicit ratio: field.agg / field.agg ACROSS dims
      if (aggExpr.ungroupedDimensions && aggExpr.ungroupedDimensions.length > 0) {
        const numerator = makeAggregateExpr(aggExpr.field, aggExpr.function, null);
        return makeRatioExpr(numerator, aggExpr);
      }
      return aggExpr;
    }
    // @count or @n (standalone aggregation keyword)
    // Creates an aggregateExpr with empty field (will be interpreted as count())
    if (ctx.standaloneAgg) {
      const aggSpec = this.visit(ctx.standaloneAgg[0]) as AggregationSpec;
      // Use empty string for field, the compiler will handle this as count()
      return makeAggregateExpr('', aggSpec.method, null);
    }
    // @field (simple)
    if (ctx.simpleField) {
      return ctx.simpleField[0].image;
    }
    throw new Error('Unexpected limitOrderBy structure');
  }

  orderByExpressionInParens(ctx: any): any {
    const left = this.visit(ctx.left[0]);

    // Check for ratio: left / right
    if (ctx.right) {
      const right = this.visit(ctx.right[0]);
      // If right has ACROSS but left doesn't, it's an implicit ratio
      return makeRatioExpr(left, right);
    }

    // Check if left has ACROSS - if so, create implicit ratio
    if (left.ungroupedDimensions && left.ungroupedDimensions.length > 0) {
      const numerator = makeAggregateExpr(left.field, left.function, null);
      return makeRatioExpr(numerator, left);
    }

    return left;
  }

  aggregateExpressionWithAcross(ctx: any): any {
    const field = ctx.field[0].image;
    const aggSpec = this.visit(ctx.agg[0]) as AggregationSpec;
    const ungrouped = ctx.ungrouped ? this.visit(ctx.ungrouped[0]) : null;
    return makeAggregateExpr(field, aggSpec.method, ungrouped);
  }

  ungroupedSpec(ctx: any): string[] {
    return ctx.dims.map((d: IToken) => d.image);
  }

  orderAnnotation(ctx: any): { order: { orderBy: any } } {
    // @(complex expression)
    if (ctx.parenExpr) {
      return { order: { orderBy: this.visit(ctx.parenExpr[0]) } };
    }
    // @field.agg with optional ACROSS - create implicit ratio if ACROSS present
    if (ctx.aggExpr) {
      const aggExpr = this.visit(ctx.aggExpr[0]);
      // If ACROSS is present, create implicit ratio: field.agg / field.agg ACROSS dims
      if (aggExpr.ungroupedDimensions && aggExpr.ungroupedDimensions.length > 0) {
        const numerator = makeAggregateExpr(aggExpr.field, aggExpr.function, null);
        return { order: { orderBy: makeRatioExpr(numerator, aggExpr) } };
      }
      return { order: { orderBy: aggExpr } };
    }
    // @count or @n (standalone aggregation keyword)
    // Creates an aggregateExpr with empty field (will be interpreted as count())
    if (ctx.standaloneAgg) {
      const aggSpec = this.visit(ctx.standaloneAgg[0]) as AggregationSpec;
      // Use empty string for field, the compiler will handle this as count()
      return { order: { orderBy: makeAggregateExpr('', aggSpec.method, null) } };
    }
    // @field (simple field reference)
    if (ctx.simpleField) {
      return { order: { orderBy: ctx.simpleField[0].image } };
    }
    throw new Error('Unexpected orderAnnotation structure');
  }

  diffAnnotation(ctx: any): { diff: string } {
    return { diff: ctx.Identifier[0].image };
  }

  overAnnotation(ctx: any): { over: string } {
    if (ctx.All) return { over: 'ALL' };
    return { over: ctx.Identifier[0].image };
  }
}

const visitorInstance = new TPLToAstVisitor();

// ---
// PUBLIC API
// ---

export interface ParseResult {
  ast: TPLStatement;
  lexErrors: any[];
  parseErrors: any[];
}

/**
 * Parse a TPL statement using Chevrotain
 */
export function parse(input: string): TPLStatement {
  // Lexing
  const lexResult = TPLLexer.tokenize(input);
  if (lexResult.errors.length > 0) {
    throw new Error(`Lexer errors: ${lexResult.errors.map(e => e.message).join(', ')}`);
  }

  // Parsing
  parserInstance.input = lexResult.tokens;
  const cst = parserInstance.tableStatement();

  if (parserInstance.errors.length > 0) {
    throw new Error(`Parser errors: ${parserInstance.errors.map(e => e.message).join(', ')}`);
  }

  // AST transformation
  return visitorInstance.visit(cst);
}

/**
 * Parse with full result including errors (for error recovery)
 */
export function parseWithErrors(input: string): ParseResult {
  const lexResult = TPLLexer.tokenize(input);

  parserInstance.input = lexResult.tokens;
  const cst = parserInstance.tableStatement();

  let ast: TPLStatement | null = null;
  if (parserInstance.errors.length === 0 && lexResult.errors.length === 0) {
    ast = visitorInstance.visit(cst);
  }

  return {
    ast: ast!,
    lexErrors: lexResult.errors,
    parseErrors: parserInstance.errors,
  };
}

// Export for testing/debugging
export { TPLLexer, TPLParser, TPLToAstVisitor };
