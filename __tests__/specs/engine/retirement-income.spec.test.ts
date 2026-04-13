/**
 * Spec: Social Security Taxation + IRA/Pension Income (1099-R)
 * Status: confirmed — SS benefits taxed at 0/50/85%, IRA/pension flows to 1040
 * Confirm: calculateTaxableSocialSecurity and retirement income fields work correctly
 * Invalidate: retirement income calculations removed or broken
 */

import {
  calculateForm1040,
  calculateTaxableSocialSecurity,
  getTaxYearConfig,
  irsRound,
} from '@selftax/core';

describe('Social Security Taxation', () => {

  test('TaxYearConfig includes SS taxability thresholds', () => {
    const c = getTaxYearConfig(2025);
    expect(c.ssTaxabilityThresholds.mfj).toEqual({ lower: 32000, upper: 44000 });
    expect(c.ssTaxabilityThresholds.single).toEqual({ lower: 25000, upper: 34000 });
    // Same every year (statutory)
    expect(getTaxYearConfig(2024).ssTaxabilityThresholds.mfj).toEqual({ lower: 32000, upper: 44000 });
  });

  test('zero SS benefits taxable when combined income below lower threshold', () => {
    const result = calculateTaxableSocialSecurity({
      filingStatus: 'mfj',
      socialSecurityBenefits: 15000,
      agiWithoutSS: 20000,
    });
    // Combined = $20k + $7.5k = $27.5k, under $32k MFJ
    expect(result.taxableAmount).toBe(0);
  });

  test('up to 50% taxable between lower and upper thresholds', () => {
    const result = calculateTaxableSocialSecurity({
      filingStatus: 'mfj',
      socialSecurityBenefits: 20000,
      agiWithoutSS: 30000,
    });
    // Combined = $30k + $10k = $40k, between $32k and $44k
    // Excess = $40k - $32k = $8k. Taxable = min(50% × $8k, 50% × $20k) = $4,000
    expect(result.taxableAmount).toBe(4000);
  });

  test('up to 85% taxable above upper threshold', () => {
    const result = calculateTaxableSocialSecurity({
      filingStatus: 'mfj',
      socialSecurityBenefits: 24000,
      agiWithoutSS: 60000,
    });
    // Combined = $60k + $12k = $72k, above $44k
    // A = 85% × ($72k - $44k) = $23,800
    // B = min(50% × $24k, ($44k-$32k)/2) = min($12k, $6k) = $6,000
    // Taxable = min($23,800 + $6,000, 85% × $24k) = min($29,800, $20,400) = $20,400
    expect(result.taxableAmount).toBe(20400);
  });

  test('single filer uses lower thresholds ($25k/$34k)', () => {
    const result = calculateTaxableSocialSecurity({
      filingStatus: 'single',
      socialSecurityBenefits: 18000,
      agiWithoutSS: 30000,
    });
    // Combined = $30k + $9k = $39k, above $34k single upper threshold
    expect(result.taxableAmount).toBeGreaterThan(0);
    // Same income for MFJ: combined $39k, between $32k-$44k → only 50% range
    const mfjResult = calculateTaxableSocialSecurity({
      filingStatus: 'mfj',
      socialSecurityBenefits: 18000,
      agiWithoutSS: 30000,
    });
    // Single should have higher taxable amount (above upper vs between for MFJ)
    expect(result.taxableAmount).toBeGreaterThan(mfjResult.taxableAmount);
  });

  test('nontaxable interest included in combined income calculation', () => {
    // Without nontaxable interest: combined = $20k + $7.5k = $27.5k (under $32k → $0)
    const withoutNTI = calculateTaxableSocialSecurity({
      filingStatus: 'mfj',
      socialSecurityBenefits: 15000,
      agiWithoutSS: 20000,
    });
    expect(withoutNTI.taxableAmount).toBe(0);

    // With $10k nontaxable interest: combined = $20k + $10k + $7.5k = $37.5k (above $32k)
    const withNTI = calculateTaxableSocialSecurity({
      filingStatus: 'mfj',
      socialSecurityBenefits: 15000,
      agiWithoutSS: 20000,
      nontaxableInterest: 10000,
    });
    expect(withNTI.taxableAmount).toBeGreaterThan(0);
  });

  test('taxable SS wired into calculateForm1040 total income', () => {
    const result = calculateForm1040({
      filingStatus: 'mfj',
      wages: 60000,
      socialSecurityBenefits: 24000,
    });
    // Total income includes taxable SS (~$20.4k), not full $24k
    expect(result.totalIncome).toBeGreaterThan(60000);
    expect(result.totalIncome).toBeLessThan(84000); // less than wages + full SS
  });
});

describe('IRA and Pension Income (1099-R)', () => {

  test('Form1040Input accepts IRA and pension distribution fields', () => {
    const r1 = calculateForm1040({ filingStatus: 'mfj', taxableIraDistributions: 25000 });
    expect(r1.totalIncome).toBe(25000);

    const r2 = calculateForm1040({ filingStatus: 'mfj', taxablePensions: 30000 });
    expect(r2.totalIncome).toBe(30000);
  });

  test('taxable IRA distributions add to total income', () => {
    const result = calculateForm1040({
      filingStatus: 'mfj',
      wages: 50000,
      taxableIraDistributions: 25000,
    });
    expect(result.totalIncome).toBe(75000);
  });

  test('taxable pension distributions add to total income', () => {
    const result = calculateForm1040({
      filingStatus: 'mfj',
      wages: 50000,
      taxablePensions: 30000,
    });
    expect(result.totalIncome).toBe(80000);
  });

  test('IRA + pension + SS combine for typical retiree scenario', () => {
    const result = calculateForm1040({
      filingStatus: 'mfj',
      taxablePensions: 40000,
      taxableIraDistributions: 20000,
      socialSecurityBenefits: 30000,
      federalWithholding: 8000,
    });
    // AGI includes pension + IRA + taxable SS
    expect(result.totalIncome).toBeGreaterThan(60000); // at least pension + IRA
    expect(result.agi).toBeGreaterThan(0);
    expect(result.isRefund).toBeDefined();
  });

  test('backward compatible — no retirement impact when fields absent', () => {
    const result = calculateForm1040({ filingStatus: 'mfj', wages: 125432 });
    expect(result.tax).toBe(10852);
  });
});
