/**
 * TPL Parser - Unified Entry Point
 *
 * Provides a unified interface for parsing TPL statements.
 * Default parser is Chevrotain (TypeScript-native).
 * PEG (Peggy) parser available as fallback.
 */

import {
  parse as parseChevrotain,
  parseWithErrors as parseChevrotainWithErrors,
  parseProgram as parseProgramChevrotain,
  parseProgramWithErrors as parseProgramChevrotainWithErrors,
} from './chevrotain-parser.js';
import { parse as parsePeggy } from './parser.js';
import type { TPLStatement, TPLProgram } from './ast.js';

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

/**
 * Parse a full TPL program (DIMENSION and TABLE statements).
 * Chevrotain parser only.
 *
 * @param input - The TPL source code to parse
 * @returns The parsed TPLProgram AST
 */
export function parseProgram(input: string): TPLProgram {
  return parseProgramChevrotain(input);
}

/**
 * Parse program with error recovery (Chevrotain only).
 * Returns partial results even if parsing fails.
 */
export function parseProgramWithErrors(input: string) {
  return parseProgramChevrotainWithErrors(input);
}

// Re-export types
export * from './ast.js';

// Re-export individual parsers for direct access
export { parseChevrotain, parsePeggy, parseProgramChevrotain };

// Re-export prettifier
export { formatTPL } from './prettifier.js';
