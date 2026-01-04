/**
 * Utilities for parsing Malloy dimension definitions and converting to SQL.
 * Used for percentile partitioning where we need SQL expressions.
 */

/**
 * Info about a dimension for percentile partitioning.
 * For simple aliases, sqlExpression = rawColumn.
 * For pick expressions, sqlExpression is the equivalent SQL CASE statement.
 */
export interface DimensionInfo {
  rawColumn: string;
  sqlExpression: string;
}

/**
 * Converts a Malloy pick/when expression to an equivalent SQL CASE expression.
 *
 * @example
 * Input:
 * ```
 * pick '<HS' when educ < 12
 * pick 'HS' when educ = 12
 * pick 'College' when educ >= 13
 * else null
 * ```
 * Output: `CASE WHEN educ < 12 THEN '<HS' WHEN educ = 12 THEN 'HS' WHEN educ >= 13 THEN 'College' ELSE NULL END`
 */
export function malloyPickToSqlCase(pickDefinition: string): string | null {
  // Match individual pick clauses: pick 'value' when condition
  const pickClauseRe = /pick\s+('[^']*'|"[^"]*"|\d+)\s+when\s+([^\n]+?)(?=\s*pick|\s*else|\s*$)/gi;
  const whenClauses: string[] = [];

  let match;
  while ((match = pickClauseRe.exec(pickDefinition)) !== null) {
    const value = match[1];
    let condition = match[2].trim();
    // Convert Malloy 'and'/'or' to SQL AND/OR (they're the same, just uppercase for consistency)
    condition = condition.replace(/\band\b/gi, 'AND').replace(/\bor\b/gi, 'OR');
    // Convert Malloy backticks to SQL double quotes (for reserved words like `union` -> "union")
    condition = condition.replace(/`([^`]+)`/g, '"$1"');
    whenClauses.push(`WHEN ${condition} THEN ${value}`);
  }

  if (whenClauses.length === 0) {
    return null;
  }

  // Check for else clause
  const elseMatch = pickDefinition.match(/else\s+('[^']*'|"[^"]*"|\d+|null)\s*$/i);
  const elseClause = elseMatch ? ` ELSE ${elseMatch[1].toUpperCase() === 'NULL' ? 'NULL' : elseMatch[1]}` : '';

  return `CASE ${whenClauses.join(' ')}${elseClause} END`;
}

/**
 * Parse Malloy extend text to extract dimension info for percentile partitioning.
 * For pick expressions, also generates the equivalent SQL CASE expression.
 *
 * @param extendText The Malloy extend block text (content of extend { ... })
 * @returns Map of dimension name to DimensionInfo (rawColumn + sqlExpression)
 */
export function parseDimensionMappings(extendText: string): Map<string, DimensionInfo> {
  const mappings = new Map<string, DimensionInfo>();

  // Pattern 1: Simple alias - "name is column" where column is a single word
  // e.g., "gender is gendchar"
  const aliasRe = /(\w+)\s+is\s+(\w+)\s*(?:\n|$)/g;
  let match;
  while ((match = aliasRe.exec(extendText)) !== null) {
    // Filter out keywords that aren't column names
    if (!['pick', 'else', 'null', 'when', 'and', 'or', 'not', 'true', 'false'].includes(match[2].toLowerCase())) {
      mappings.set(match[1], { rawColumn: match[2], sqlExpression: match[2] });
    }
  }

  // Pattern 2: Full pick expression - capture the entire definition
  // e.g., "occupation is\n  pick 'Managerial' when occup = 1\n  pick 'Professional' when occup = 2\n  else null"
  // We need to capture multi-line pick definitions
  const pickDefRe = /(\w+)\s+is\s*\n?((?:\s*pick\s+[^\n]+\n?)+(?:\s*else\s+[^\n]+)?)/gi;
  while ((match = pickDefRe.exec(extendText)) !== null) {
    const dimName = match[1];
    const pickDef = match[2];

    // Extract the raw column from the first 'when' clause
    // Handle both regular identifiers (word) and backtick-quoted ones (`union`)
    const rawColMatch = pickDef.match(/when\s+(`[^`]+`|\w+)/i);
    if (rawColMatch) {
      // Remove backticks if present
      const rawColumn = rawColMatch[1].replace(/`/g, '');
      const sqlCase = malloyPickToSqlCase(pickDef);
      if (sqlCase) {
        mappings.set(dimName, { rawColumn, sqlExpression: sqlCase });
      }
    }
  }

  return mappings;
}

/**
 * Generates a Malloy-syntax ordinal pick expression based on pick clause order.
 * Each pick clause gets an incrementing ordinal (1, 2, 3...) based on its position.
 *
 * @example
 * Input:
 * ```
 * pick 'HS' when educ = 12
 * pick 'Uni' when educ = 13
 * pick '<HS' when educ < 12
 * else 'Other'
 * ```
 * Output:
 * ```
 * pick 1 when educ = 12
 * pick 2 when educ = 13
 * pick 3 when educ < 12
 * else 4
 * ```
 */
export function generateMalloyOrdinalPick(pickDefinition: string): string | null {
  // Match individual pick clauses in order: pick 'value' when condition
  const pickClauseRe = /pick\s+(?:'[^']*'|"[^"]*"|\d+)\s+when\s+([^\n]+?)(?=\s*pick|\s*else|\s*$)/gi;
  const pickClauses: string[] = [];

  let ordinal = 1;
  let match;
  while ((match = pickClauseRe.exec(pickDefinition)) !== null) {
    const condition = match[1].trim();
    pickClauses.push(`pick ${ordinal} when ${condition}`);
    ordinal++;
  }

  if (pickClauses.length === 0) {
    return null;
  }

  // Check for else clause - assign next ordinal
  const elseMatch = pickDefinition.match(/else\s+(?:'[^']*'|"[^"]*"|\d+|null)\s*$/i);
  const elseClause = elseMatch ? `\n  else ${ordinal}` : '';

  return pickClauses.map(c => `  ${c}`).join('\n') + elseClause;
}

/**
 * Interface for dimension ordering information.
 * Used by the query generator to add definition-order sorting.
 */
export interface DimensionOrderingProvider {
  /** Check if a dimension has definition-order information */
  hasDefinitionOrder(dimensionName: string): boolean;
  /** Get the name of the ordering dimension (e.g., 'education_order' or 'education_def_order') */
  getOrderDimensionName(dimensionName: string): string | undefined;
  /** Get auto-generated Malloy dimension definitions for true definition order */
  getAutoOrderDimensions(): string[];
}

/**
 * Detect ordering dimensions in Malloy source text.
 *
 * Supports two modes:
 * 1. Legacy: `<dim>_order is <column>` - orders by underlying column values
 * 2. True definition order: Parses pick statements and generates ordinal Malloy dimensions
 *
 * True definition order takes precedence when a pick expression is found.
 *
 * @param extendText The Malloy extend block text
 * @returns DimensionOrderingProvider that can be used by the query generator
 */
export function detectDimensionOrdering(extendText: string): DimensionOrderingProvider {
  // Find all dimension definitions
  const allDimensions = new Set<string>();
  const orderDimensions = new Map<string, string>(); // base dimension -> order dimension name (legacy)
  const autoOrderDimensions = new Map<string, string>(); // dimension -> Malloy ordinal pick definition

  // Match all dimension definitions: "name is ..."
  const dimDefRe = /(\w+)\s+is\s+/g;
  let match;
  while ((match = dimDefRe.exec(extendText)) !== null) {
    allDimensions.add(match[1]);
  }

  // For each dimension, check if there's a corresponding _order dimension (legacy)
  for (const dim of allDimensions) {
    const orderDimName = `${dim}_order`;
    if (allDimensions.has(orderDimName)) {
      orderDimensions.set(dim, orderDimName);
    }
  }

  // Parse pick expressions to generate ordinal Malloy dimensions for true definition order
  const pickDefRe = /(\w+)\s+is\s*\n?((?:\s*pick\s+[^\n]+\n?)+(?:\s*else\s+[^\n]+)?)/gi;
  while ((match = pickDefRe.exec(extendText)) !== null) {
    const dimName = match[1];
    const pickDef = match[2];
    const ordinalPick = generateMalloyOrdinalPick(pickDef);
    if (ordinalPick) {
      autoOrderDimensions.set(dimName, ordinalPick);
    }
  }

  return {
    hasDefinitionOrder(dimensionName: string): boolean {
      // Has definition order if we have an auto-generated order dim OR a legacy _order dimension
      return autoOrderDimensions.has(dimensionName) || orderDimensions.has(dimensionName);
    },
    getOrderDimensionName(dimensionName: string): string | undefined {
      // Prefer auto-generated _def_order (true definition order)
      if (autoOrderDimensions.has(dimensionName)) {
        return `${dimensionName}_def_order`;
      }
      // Fall back to legacy _order dimension
      return orderDimensions.get(dimensionName);
    },
    getAutoOrderDimensions(): string[] {
      // Return Malloy dimension definitions that need to be injected
      const dims: string[] = [];
      for (const [dimName, ordinalPick] of autoOrderDimensions) {
        dims.push(`${dimName}_def_order is\n${ordinalPick}`);
      }
      return dims;
    },
  };
}
