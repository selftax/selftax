/**
 * Spec: CA Form 540 — Itemized Deductions
 *
 * Status: hypothesis — CA itemized deductions differ from federal.
 * CA does NOT allow deduction of state income tax (can't deduct state
 * tax on the state return), but has NO SALT cap on property tax.
 *
 * For our 2025 return:
 *   Federal itemized: $42,551 (SALT $27,555 capped + mortgage $14,996)
 *   CA itemized: $28,524 (property tax $13,528 + mortgage $14,996)
 *   CA standard: $11,412
 *   → Should use CA itemized ($28,524 > $11,412)
 *
 * Currently broken: CA 540 uses standard deduction ($11,412) because
 * no one passes caItemizedDeductions. Need to compute it and pass it.
 *
 * Confirm: CA 540 uses correct CA itemized deductions.
 * Invalidate: CA refund stays at $1,899 instead of ~$3,746.
 */

import { calculateForm540 } from '@selftax/core';

describe('CA Form 540: itemized deductions', () => {

  test('CA itemized excludes state income tax but includes full property tax', () => {
    // Federal SALT = min($14,027 state tax + $13,528 property tax, $40,000 cap) = $27,555
    // CA SALT = $13,528 property tax only (no state tax deduction on state return, no cap)
    // CA mortgage = same as federal: $14,996
    // CA itemized = $13,528 + $14,996 = $28,524

    const result = calculateForm540({
      filingStatus: 'mfj',
      taxYear: 2025,
      federalAGI: 218948,
      caWithholding: 14026.86,
      caItemizedDeductions: 28524, // property tax + mortgage (no state tax)
    });

    expect(result.deductionType).toBe('itemized');
    expect(result.deduction).toBe(28524);
    expect(result.taxableIncome).toBe(190424);
  });

  test('CA refund is $3,746 with correct CA itemized deductions', () => {
    const result = calculateForm540({
      filingStatus: 'mfj',
      taxYear: 2025,
      federalAGI: 218948,
      caWithholding: 14026.86,
      caItemizedDeductions: 28524,
    });

    expect(result.totalTax).toBe(10281);
    expect(result.refundOrOwed).toBe(3746);
    expect(result.isRefund).toBe(true);
  });

  test('CA standard deduction is used when itemized is lower', () => {
    // If someone has no mortgage and low property tax, standard wins
    const result = calculateForm540({
      filingStatus: 'mfj',
      taxYear: 2025,
      federalAGI: 100000,
      caWithholding: 5000,
      caItemizedDeductions: 5000, // less than $11,412 standard
    });

    expect(result.deductionType).toBe('standard');
    expect(result.deduction).toBe(11412);
  });

  test('calculateForm540 auto-computes CA itemized from primaryPropertyTax + mortgage', () => {
    // When caItemizedDeductions is not passed but property tax + mortgage are,
    // the function should compute CA itemized automatically
    const result = calculateForm540({
      filingStatus: 'mfj',
      taxYear: 2025,
      federalAGI: 218948,
      caWithholding: 14026.86,
      primaryPropertyTax: 13528.08,
      primaryMortgageInterest: 14996,
    });

    expect(result.deductionType).toBe('itemized');
    expect(result.deduction).toBe(28524);
  });
});

describe('CA 540: dependent exemption credits', () => {

  test('CA gives $475 credit per dependent (2025)', () => {
    const noDeps = calculateForm540({
      filingStatus: 'mfj', taxYear: 2025, federalAGI: 200000,
      caWithholding: 10000,
    });
    const withDeps = calculateForm540({
      filingStatus: 'mfj', taxYear: 2025, federalAGI: 200000,
      caWithholding: 10000, dependentCount: 2,
    });

    // 2 dependents × $475 = $950 additional credit
    expect(noDeps.totalTax - withDeps.totalTax).toBe(950);
  });

  test('full 2025 return: CA 540 with itemized + dependent credits', () => {
    const result = calculateForm540({
      filingStatus: 'mfj',
      taxYear: 2025,
      federalAGI: 218948,
      caWithholding: 14026.86,
      dependentCount: 2,
      primaryPropertyTax: 13528.08,
      primaryMortgageInterest: 14996,
    });

    // CA itemized: $13,528 + $14,996 = $28,524
    expect(result.deduction).toBe(28524);
    // Personal ($306) + 2 dependents ($950) = $1,256 exemption credits
    expect(result.exemptionCredits).toBe(1256);
    // With both fixes, CA refund should be significantly higher
    expect(result.isRefund).toBe(true);
    expect(result.refundOrOwed).toBeGreaterThan(3000);
  });
});
