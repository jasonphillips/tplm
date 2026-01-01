/**
 * TPL Parser - Unified Entry Point
 *
 * Provides a unified interface for parsing TPL statements.
 * Default parser is Chevrotain (TypeScript-native).
 * PEG (Peggy) parser available as fallback.
 */

import { parse as parseChevrotain, parseWithErrors as parseChevrotainWithErrors } from './chevrotain-parser.js';
import { parse as parsePeggy } from './parser.js';
import type { TPLStatement } from './ast.js';

export type ParserType = 'chevrotain' | 'peggy';

export interface ParseOptions {
  parser?: ParserType;
}

/**
 * Parse a TPL statement.
 *
 * @param input - The TPL source code to parse
 * @param options - Parser options (default: { parser: 'chevrotain' })
 * @returns The parsed AST
 */
export function parse(input: string, options: ParseOptions = {}): TPLStatement {
  const parserType = options.parser ?? 'chevrotain';

  if (parserType === 'peggy') {
    return parsePeggy(input);
  }

  return parseChevrotain(input);
}

/**
 * Parse with error recovery (Chevrotain only).
 * Returns partial results even if parsing fails.
 */
export function parseWithErrors(input: string) {
  return parseChevrotainWithErrors(input);
}

// Re-export types
export * from './ast.js';

// Re-export individual parsers for direct access
export { parseChevrotain, parsePeggy };

// Re-export prettifier
export { formatTPL } from './prettifier.js';
