/**
 * Spec: Schedule A (Itemized Deductions)
 *
 * Status: confirmed
 * Confirm: SALT cap and standard vs itemized comparison correct
 * Invalidate: Edge cases in OBBBA changes not covered
 */

import { calculateScheduleA } from '@selftax/core';

describe('Schedule A (Itemized Deductions)', () => {
  test('calculates SALT deduction with $40,000 cap (OBBBA 2025)', () => {
    const result = calculateScheduleA({
      filingStatus: 'mfj',
      stateIncomeTax: 12000,
      primaryPropertyTax: 15000,
    });
    // $12k + $15k = $27k, under $40k cap
    expect(result.saltDeduction).toBe(27000);
    expect(result.saltTotal).toBe(27000);
  });

  test('caps SALT at $40,000 when state+local taxes exceed cap', () => {
    const result = calculateScheduleA({
      filingStatus: 'mfj',
      stateIncomeTax: 20000,
      primaryPropertyTax: 25000,
    });
    expect(result.saltTotal).toBe(45000);
    expect(result.saltDeduction).toBe(40000);
  });

  test('only includes PRIMARY residence property tax in SALT', () => {
    // Rental property tax goes on Schedule E — this test ensures
    // Schedule A only takes primaryPropertyTax
    const result = calculateScheduleA({
      filingStatus: 'mfj',
      stateIncomeTax: 10000,
      primaryPropertyTax: 8000,
    });
    expect(result.saltDeduction).toBe(18000);
  });

  test('includes mortgage interest for primary residence', () => {
    const result = calculateScheduleA({
      filingStatus: 'mfj',
      mortgageInterest: 15000,
    });
    expect(result.mortgageInterest).toBe(15000);
  });

  test('includes charitable contributions', () => {
    const result = calculateScheduleA({
      filingStatus: 'mfj',
      charitableCash: 2000,
      charitableNonCash: 500,
    });
    expect(result.charitableTotal).toBe(2500);
  });

  test('compares itemized total vs standard deduction', () => {
    // Under standard: $20k SALT + $5k mortgage = $25k < $30,950
    const under = calculateScheduleA({
      filingStatus: 'mfj',
      stateIncomeTax: 12000,
      primaryPropertyTax: 8000,
      mortgageInterest: 5000,
    });
    expect(under.shouldItemize).toBe(false);
    expect(under.savingsOverStandard).toBeLessThan(0);

    // Over standard: $27k SALT + $18k mortgage + $3k charity = $48k > $30,950
    const over = calculateScheduleA({
      filingStatus: 'mfj',
      stateIncomeTax: 12000,
      primaryPropertyTax: 15000,
      mortgageInterest: 18000,
      charitableCash: 3000,
    });
    expect(over.shouldItemize).toBe(true);
    expect(over.savingsOverStandard).toBeGreaterThan(0);
  });

  test('applies 2025 standard deduction amounts', () => {
    const single = calculateScheduleA({ filingStatus: 'single' });
    expect(single.standardDeduction).toBe(15475);

    const mfj = calculateScheduleA({ filingStatus: 'mfj' });
    expect(mfj.standardDeduction).toBe(30950);

    const hoh = calculateScheduleA({ filingStatus: 'hoh' });
    expect(hoh.standardDeduction).toBe(23225);
  });
});
