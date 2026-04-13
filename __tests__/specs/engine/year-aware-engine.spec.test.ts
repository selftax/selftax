/**
 * Spec: Year-Aware Engine Functions
 * Status: confirmed — engine functions accept taxYear and produce correct results per year
 * Confirm: same income → different tax in 2024 vs 2025
 * Invalidate: functions ignore taxYear parameter
 */

import {
  calculateForm1040,
  calculateTax,
  calculateDeduction,
  calculateChildTaxCredit,
  calculateScheduleA,
  calculateForm540,
  getTaxYearConfig,
} from '@selftax/core';
import type { Form1040Input } from '@selftax/core';

const baseMFJ: Form1040Input = {
  filingStatus: 'mfj',
  wages: 125432,
};

describe('Year-Aware Engine Functions', () => {

  test('calculateForm1040 defaults to 2025 (backward compatible)', () => {
    const result = calculateForm1040(baseMFJ);
    expect(result.deduction).toBe(30950); // 2025 MFJ standard deduction
    expect(result.deductionType).toBe('standard');
  });

  test('calculateForm1040 uses 2024 brackets and deductions', () => {
    const result = calculateForm1040({ ...baseMFJ, taxYear: 2024 });

    expect(result.deduction).toBe(29200); // 2024 MFJ standard
    // taxableIncome = 125432 - 29200 = 96232
    // 10% on $23,200 = $2,320; 12% on ($94,300-$23,200) = $8,532; 22% on ($96,232-$94,300) = $425
    // Total = $11,277
    expect(result.tax).toBe(11277);
  });

  test('calculateChildTaxCredit uses year-appropriate CTC amount', () => {
    expect(calculateChildTaxCredit(2, 50000, 2024)).toBe(4000);
    expect(calculateChildTaxCredit(2, 50000, 2025)).toBe(4400);
  });

  test('calculateScheduleA applies year-appropriate SALT cap', () => {
    const input = {
      filingStatus: 'mfj' as const,
      stateIncomeTax: 14000,
      primaryPropertyTax: 13000,
    };

    const result2024 = calculateScheduleA({ ...input, taxYear: 2024 });
    const result2025 = calculateScheduleA({ ...input, taxYear: 2025 });

    expect(result2024.saltDeduction).toBe(10000); // capped at $10k
    expect(result2025.saltDeduction).toBe(27000); // full amount under $40k cap
  });

  test('SALT cap change affects standard-vs-itemized decision', () => {
    const input = {
      filingStatus: 'mfj' as const,
      stateIncomeTax: 14000,
      primaryPropertyTax: 13000,
      mortgageInterest: 15000,
    };

    const result2024 = calculateScheduleA({ ...input, taxYear: 2024 });
    const result2025 = calculateScheduleA({ ...input, taxYear: 2025 });

    // 2024: $10k SALT + $15k mortgage = $25k < $29,200 standard → don't itemize
    expect(result2024.shouldItemize).toBe(false);
    // 2025: $27k SALT + $15k mortgage = $42k > $30,950 standard → itemize
    expect(result2025.shouldItemize).toBe(true);
  });

  test('calculateForm540 uses year-appropriate CA brackets', () => {
    const input = {
      filingStatus: 'mfj' as const,
      federalAGI: 250000,
      caWithholding: 15000,
    };

    const result2024 = calculateForm540({ ...input, taxYear: 2024 });
    const result2025 = calculateForm540({ ...input, taxYear: 2025 });

    // Different bracket thresholds → different tax amounts
    expect(result2024.totalTax).not.toBe(result2025.totalTax);
  });

  test('calculateForm2441 expense limits are year-keyed in config', () => {
    for (const year of [2023, 2024, 2025]) {
      const config = getTaxYearConfig(year);
      expect(config.dependentCareExpenseLimits.one).toBe(3000);
      expect(config.dependentCareExpenseLimits.twoOrMore).toBe(6000);
    }
  });

  test('same income produces different federal tax in 2024 vs 2025', () => {
    const input: Form1040Input = {
      filingStatus: 'mfj',
      wages: 217176,
      qualifyingChildren: 2,
      federalWithholding: 30971,
    };

    const result2024 = calculateForm1040({ ...input, taxYear: 2024 });
    const result2025 = calculateForm1040({ ...input, taxYear: 2025 });

    // 2025 has bigger deduction AND bigger CTC → lower tax
    expect(result2025.totalTax).toBeLessThan(result2024.totalTax);
    expect(result2025.refundOrOwed).toBeGreaterThan(result2024.refundOrOwed);
  });

  test('2024 calculation matches known Expected result direction', () => {
    // Alex's 2024: wages $210,396, rental net $6,520, CTC $4,000
    // Expected result: $4,830 federal refund
    // We test with simplified inputs to verify 2024 constants are correct
    const result = calculateForm1040({
      filingStatus: 'mfj',
      taxYear: 2024,
      wages: 210396,
      rentalIncome: 6520,
      qualifyingChildren: 2,
      federalWithholding: 30000,
      itemizedDeductions: 25000,
    });

    // With these simplified inputs, we should get a reasonable refund
    // The exact $4,830 requires the full Schedule E/A/2441 calculation
    // which isn't part of this test — we just verify 2024 constants work
    expect(result.deduction).toBe(29200); // 2024 standard > 25000 itemized
    expect(result.isRefund).toBe(true);
  });
});
