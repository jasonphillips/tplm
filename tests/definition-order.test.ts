/**
 * True Definition Order Tests
 *
 * Tests that dimensions sort by pick statement order, not by underlying column values.
 * For example, if picks are declared as: HS, Uni, <HS, Other
 * Then output order should be: HS, Uni, <HS, Other (ordinals 1, 2, 3, 4)
 * NOT: <HS, HS, Uni, Other (which would be underlying column order)
 */

import { describe, it, expect } from 'vitest';
import {
  generateMalloyOrdinalPick,
  detectDimensionOrdering,
} from '../dist/compiler/dimension-utils.js';

describe('generateMalloyOrdinalPick', () => {
  it('generates ordinal picks in declaration order', () => {
    const pickDef = `
      pick 'HS' when educ = 12
      pick 'Uni' when educ >= 16
      pick '<HS' when educ < 12
      else 'Other'
    `;

    const result = generateMalloyOrdinalPick(pickDef);

    // Should generate ordinals 1, 2, 3, 4 in declaration order
    expect(result).not.toBeNull();
    expect(result).toContain('pick 1 when educ = 12');
    expect(result).toContain('pick 2 when educ >= 16');
    expect(result).toContain('pick 3 when educ < 12');
    expect(result).toContain('else 4');
  });

  it('handles pick expressions without else', () => {
    const pickDef = `
      pick 'A' when x = 1
      pick 'B' when x = 2
    `;

    const result = generateMalloyOrdinalPick(pickDef);

    expect(result).not.toBeNull();
    expect(result).toContain('pick 1 when x = 1');
    expect(result).toContain('pick 2 when x = 2');
    expect(result).not.toContain('else');
  });

  it('handles complex conditions with and/or', () => {
    const pickDef = `
      pick 'Services' when occup >= 6 and occup <= 8
      pick 'Other' when occup > 8 or occup < 1
      else null
    `;

    const result = generateMalloyOrdinalPick(pickDef);

    expect(result).not.toBeNull();
    expect(result).toContain('pick 1 when occup >= 6 and occup <= 8');
    expect(result).toContain('pick 2 when occup > 8 or occup < 1');
    expect(result).toContain('else 3');
  });

  it('returns null for non-pick expressions', () => {
    const result = generateMalloyOrdinalPick('just a simple column');
    expect(result).toBeNull();
  });
});

describe('detectDimensionOrdering - Auto-Generated Dimensions', () => {
  it('generates auto-order dimensions for pick expressions', () => {
    const extendText = `
      education is
        pick '<HS' when educ < 12
        pick 'HS' when educ = 12
        pick 'College' when educ >= 13
        else null

      gender is gendchar
    `;

    const provider = detectDimensionOrdering(extendText);

    // education should have definition order (auto-generated)
    expect(provider.hasDefinitionOrder('education')).toBe(true);
    expect(provider.getOrderDimensionName('education')).toBe('education_def_order');

    // gender is a simple alias, no definition order
    expect(provider.hasDefinitionOrder('gender')).toBe(false);
    expect(provider.getOrderDimensionName('gender')).toBeUndefined();
  });

  it('getAutoOrderDimensions returns correct Malloy dimension definitions', () => {
    const extendText = `
      education is
        pick 'HS' when educ = 12
        pick 'Uni' when educ >= 16
        pick '<HS' when educ < 12
        else 'Other'
    `;

    const provider = detectDimensionOrdering(extendText);
    const autoDims = provider.getAutoOrderDimensions();

    expect(autoDims.length).toBe(1);
    expect(autoDims[0]).toContain('education_def_order is');
    expect(autoDims[0]).toContain('pick 1 when educ = 12');
    expect(autoDims[0]).toContain('pick 2 when educ >= 16');
    expect(autoDims[0]).toContain('pick 3 when educ < 12');
    expect(autoDims[0]).toContain('else 4');
  });

  it('prefers auto-generated order over legacy _order dimension', () => {
    const extendText = `
      occupation is
        pick 'Manager' when occup = 1
        pick 'Professional' when occup = 2
        else null

      occupation_order is occup
    `;

    const provider = detectDimensionOrdering(extendText);

    // Should use auto-generated _def_order, not legacy _order
    expect(provider.hasDefinitionOrder('occupation')).toBe(true);
    expect(provider.getOrderDimensionName('occupation')).toBe('occupation_def_order');

    // Should have auto-generated dimension
    const autoDims = provider.getAutoOrderDimensions();
    expect(autoDims.length).toBe(1);
    expect(autoDims[0]).toContain('occupation_def_order');
  });

  it('falls back to legacy _order when no pick expression', () => {
    const extendText = `
      occupation is occupation_name
      occupation_order is occup
    `;

    const provider = detectDimensionOrdering(extendText);

    // Should use legacy _order
    expect(provider.hasDefinitionOrder('occupation')).toBe(true);
    expect(provider.getOrderDimensionName('occupation')).toBe('occupation_order');

    // No auto-generated dimensions needed
    const autoDims = provider.getAutoOrderDimensions();
    expect(autoDims.length).toBe(0);
  });
});
