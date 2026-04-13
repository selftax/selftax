/**
 * Spec: W-2 Field Mapping
 *
 * Status: confirmed
 * Confirm: W-2 boxes correctly mapped to structured fields from OCR text
 * Invalidate: W-2 layouts vary too much across employers for template matching
 */

import { mapW2Fields, aggregateW2s } from '@selftax/core';

const SAMPLE_W2_TEXT = `
Wage and Tax Statement 2025
Box b: Employer EIN 00-0000000
Box 1 Wages, tips, other comp: $125,432.00
Box 2 Federal income tax withheld: $28,100.00
Box 3 Social security wages: $125,432.00
Box 4 Social security tax withheld: $7,776.78
Box 5 Medicare wages: $125,432.00
Box 6 Medicare tax withheld: $1,818.76
Box 10 Dependent care benefits: $5,000.00
Box 12a Code V $45,000.00
Box 12b Code W $3,500.00
Box 14 DCARE $5,000.00
Box 15 State: CA
Box 16 State wages: $125,432.00
Box 17 State income tax: $9,800.00
`;

describe('W-2 Field Mapping', () => {
  test('extracts Box 1 (wages, tips, other compensation)', () => {
    const result = mapW2Fields(SAMPLE_W2_TEXT);
    expect(result.box1_wages).toBe(125432);
  });

  test('extracts Box 2 (federal income tax withheld)', () => {
    const result = mapW2Fields(SAMPLE_W2_TEXT);
    expect(result.box2_federal_tax).toBe(28100);
  });

  test('extracts Box 12 codes (retirement, stock comp)', () => {
    const result = mapW2Fields(SAMPLE_W2_TEXT);
    expect(result.box12).toContainEqual({ code: 'V', amount: 45000 });
    expect(result.box12).toContainEqual({ code: 'W', amount: 3500 });
  });

  test('extracts Box 14 (other — dependent care, etc)', () => {
    const result = mapW2Fields(SAMPLE_W2_TEXT);
    expect(result.box14_other).toContainEqual({ label: 'DCARE', amount: 5000 });
  });

  test('extracts employer EIN from Box b', () => {
    const result = mapW2Fields(SAMPLE_W2_TEXT);
    expect(result.employer_ein).toBe('00-0000000');
  });

  test('extracts state wage info (Boxes 15-17)', () => {
    const result = mapW2Fields(SAMPLE_W2_TEXT);
    expect(result.state).toBe('CA');
    expect(result.state_wages).toBe(125432);
    expect(result.state_tax).toBe(9800);
  });

  test('handles multiple W-2s from different employers', () => {
    const w2a = mapW2Fields(SAMPLE_W2_TEXT);
    const w2b = mapW2Fields(`
      Box 1 Wages, tips, other comp: $50,000.00
      Box 2 Federal income tax withheld: $8,000.00
      Box 15 State: CA
      Box 16 State wages: $50,000.00
      Box 17 State income tax: $3,500.00
    `);

    const combined = aggregateW2s([w2a, w2b]);
    expect(combined.totalWages).toBe(175432);
    expect(combined.totalFederalWithholding).toBe(36100);
    expect(combined.totalStateTax).toBe(13300);
  });
});
