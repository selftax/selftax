/**
 * Spec: Premium Tax Credit, Foreign Tax Credit, and Saver's Credit
 * Status: confirmed — PTC adjusts payments/tax, foreign tax reduces tax, saver's with AGI tiers
 * Confirm: all three credits wired into calculateForm1040 correctly
 * Invalidate: credits removed or broken
 */

import {
  calculateForm1040,
  calculateSaversCredit,
  getTaxYearConfig,
  irsRound,
} from '@selftax/core';

describe('Premium Tax Credit (Form 8962)', () => {

  test('positive PTC adds to total payments (additional refundable credit)', () => {
    const withPTC = calculateForm1040({
      filingStatus: 'mfj', wages: 40000, premiumTaxCredit: 2000, federalWithholding: 3000,
    });
    const without = calculateForm1040({
      filingStatus: 'mfj', wages: 40000, federalWithholding: 3000,
    });
    expect(withPTC.totalPayments).toBe(without.totalPayments + 2000);
  });

  test('negative PTC adds to total tax (excess APTC repayment)', () => {
    const withRepay = calculateForm1040({
      filingStatus: 'mfj', wages: 80000, premiumTaxCredit: -1500, federalWithholding: 10000,
    });
    const without = calculateForm1040({
      filingStatus: 'mfj', wages: 80000, federalWithholding: 10000,
    });
    expect(withRepay.totalTax).toBe(without.totalTax + 1500);
  });

  test('zero PTC has no effect', () => {
    const withZero = calculateForm1040({
      filingStatus: 'mfj', wages: 60000, premiumTaxCredit: 0,
    });
    const without = calculateForm1040({
      filingStatus: 'mfj', wages: 60000,
    });
    expect(withZero.totalTax).toBe(without.totalTax);
    expect(withZero.totalPayments).toBe(without.totalPayments);
  });
});

describe('Foreign Tax Credit (Form 1116)', () => {

  test('foreign tax credit reduces tax as nonrefundable credit', () => {
    const withFTC = calculateForm1040({
      filingStatus: 'mfj', wages: 100000, foreignTaxCredit: 500, federalWithholding: 15000,
    });
    const without = calculateForm1040({
      filingStatus: 'mfj', wages: 100000, federalWithholding: 15000,
    });
    expect(withFTC.totalCredits).toBe(without.totalCredits + 500);
  });

  test('foreign tax credit cannot make tax negative (nonrefundable)', () => {
    // Low income + huge foreign credit → tax floors at 0
    const result = calculateForm1040({
      filingStatus: 'mfj', wages: 20000, foreignTaxCredit: 50000,
    });
    expect(result.totalTax).toBeGreaterThanOrEqual(0);
  });

  test('no foreign tax credit when field absent', () => {
    const result = calculateForm1040({ filingStatus: 'mfj', wages: 125432 });
    expect(result.tax).toBe(10852);
  });
});

describe("Saver's Credit (Form 8880)", () => {

  test('TaxYearConfig includes saver credit AGI tiers', () => {
    const c = getTaxYearConfig(2025);
    expect(c.saversCredit.mfj).toEqual({ fifty: 47500, twenty: 51000, ten: 79000 });
    expect(c.saversCredit.single.fifty).toBe(23750);
    expect(c.saversCreditMaxContribPerPerson).toBe(2000);
  });

  test('50% credit rate for lowest AGI tier', () => {
    const result = calculateSaversCredit({
      filingStatus: 'mfj', agi: 40000, contributions: 4000,
    });
    expect(result.creditRate).toBe(0.50);
    expect(result.credit).toBe(2000);
  });

  test('20% credit rate for middle tier', () => {
    const result = calculateSaversCredit({
      filingStatus: 'mfj', agi: 50000, contributions: 4000,
    });
    expect(result.creditRate).toBe(0.20);
    expect(result.credit).toBe(800);
  });

  test('10% credit rate for upper tier', () => {
    const result = calculateSaversCredit({
      filingStatus: 'mfj', agi: 60000, contributions: 4000,
    });
    expect(result.creditRate).toBe(0.10);
    expect(result.credit).toBe(400);
  });

  test('zero credit above AGI limit', () => {
    const result = calculateSaversCredit({
      filingStatus: 'mfj', agi: 80000, contributions: 4000,
    });
    expect(result.creditRate).toBe(0);
    expect(result.credit).toBe(0);
  });

  test('contributions capped at $2,000 per person ($4,000 MFJ)', () => {
    const result = calculateSaversCredit({
      filingStatus: 'mfj', agi: 40000, contributions: 10000,
    });
    expect(result.eligibleContributions).toBe(4000);
    expect(result.credit).toBe(2000); // 50% × $4,000
  });

  test('saver credit wired into calculateForm1040 as nonrefundable', () => {
    const withSaver = calculateForm1040({
      filingStatus: 'mfj', wages: 40000, retirementContributions: 4000, federalWithholding: 3000,
    });
    const without = calculateForm1040({
      filingStatus: 'mfj', wages: 40000, federalWithholding: 3000,
    });
    // AGI $40k → 50% rate → $2,000 credit
    expect(withSaver.totalCredits).toBe(without.totalCredits + 2000);
  });
});
