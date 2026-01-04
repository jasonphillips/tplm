/**
 * Test suite for cell lookup utilities
 */

import { describe, it, expect } from 'vitest';
import {
  findCell,
  findAllCells,
  getCellValue,
  parseCellPath,
} from '../dist/renderer/test-utils.js';

describe('parseCellPath', () => {
  it('parses single dimension', () => {
    const result = parseCellPath('education=College');
    expect(result.get('education')).toBe('College');
  });

  it('parses multiple dimensions', () => {
    const result = parseCellPath('education=College|occupation=Manager');
    expect(result.get('education')).toBe('College');
    expect(result.get('occupation')).toBe('Manager');
  });

  it('handles special characters in values', () => {
    const result = parseCellPath('education=<HS|gender=Male');
    expect(result.get('education')).toBe('<HS');
    expect(result.get('gender')).toBe('Male');
  });

  it('returns empty map for empty string', () => {
    const result = parseCellPath('');
    expect(result.size).toBe(0);
  });
});

describe('findCell', () => {
  const sampleHTML = `
    <table class="tpl-table">
    <tbody>
    <tr>
      <td title="Education: College, Gender: Male" data-cell="education=College|gender=Male">1,234</td>
      <td title="Education: College, Gender: Female" data-cell="education=College|gender=Female">2,345</td>
    </tr>
    <tr>
      <td title="Education: HS, Gender: Male" data-cell="education=HS|gender=Male">3,456</td>
      <td title="Education: HS, Gender: Female" data-cell="education=HS|gender=Female">4,567</td>
    </tr>
    </tbody>
    </table>
  `;

  it('finds cell by single dimension', () => {
    const result = findCell(sampleHTML, { dimensions: { education: 'HS', gender: 'Male' } });
    expect(result).not.toBeNull();
    expect(result!.value).toBe('3,456');
  });

  it('finds cell by multiple dimensions', () => {
    const result = findCell(sampleHTML, { dimensions: { education: 'College', gender: 'Female' } });
    expect(result).not.toBeNull();
    expect(result!.value).toBe('2,345');
    expect(result!.title).toBe('Education: College, Gender: Female');
  });

  it('returns null for non-existent cell', () => {
    const result = findCell(sampleHTML, { dimensions: { education: 'PhD' } });
    expect(result).toBeNull();
  });
});

describe('findAllCells', () => {
  const sampleHTML = `
    <table>
    <tbody>
    <tr>
      <td data-cell="education=College|gender=Male">1,234</td>
      <td data-cell="education=College|gender=Female">2,345</td>
    </tr>
    <tr>
      <td data-cell="education=HS|gender=Male">3,456</td>
      <td data-cell="education=HS|gender=Female">4,567</td>
    </tr>
    </tbody>
    </table>
  `;

  it('finds all cells matching partial criteria', () => {
    const results = findAllCells(sampleHTML, { dimensions: { education: 'College' } });
    expect(results.length).toBe(2);
    expect(results.map(r => r.value)).toContain('1,234');
    expect(results.map(r => r.value)).toContain('2,345');
  });

  it('finds all cells when no criteria specified', () => {
    const results = findAllCells(sampleHTML, {});
    expect(results.length).toBe(4);
  });
});

describe('getCellValue', () => {
  const sampleHTML = `
    <table>
    <tbody>
    <tr>
      <td data-cell="education=College">1,234,567</td>
      <td data-cell="education=HS">89.5%</td>
    </tr>
    </tbody>
    </table>
  `;

  it('parses numeric value with commas', () => {
    const value = getCellValue(sampleHTML, { dimensions: { education: 'College' } });
    expect(value).toBe(1234567);
  });

  it('parses percentage value', () => {
    const value = getCellValue(sampleHTML, { dimensions: { education: 'HS' } });
    expect(value).toBe(89.5);
  });

  it('returns null for non-existent cell', () => {
    const value = getCellValue(sampleHTML, { dimensions: { education: 'PhD' } });
    expect(value).toBeNull();
  });
});
