/**
 * Spec: California Form 540 — State Income Tax
 *
 * Status: pending
 * Confirm: CA 540 calculations match FTB worksheets for test scenarios
 * Invalidate: CA tax law edge cases require more complex dependency graph
 *
 * Deterministic calculation engine for California Form 540.
 * Pure functions, no LLM involvement. Follows FTB instructions.
 */

import {
  calculateForm540,
  CA_TAX_BRACKETS,
  CA_STANDARD_DEDUCTION,
  CA_PERSONAL_EXEMPTION_CREDIT,
  CA_MENTAL_HEALTH_THRESHOLD,
  CA_MENTAL_HEALTH_RATE,
} from '@selftax/core';
import type { Form540Input } from '@selftax/core';

describe('California Form 540 — Tax Constants', () => {
  test('has 9 brackets for single filers', () => {
    expect(CA_TAX_BRACKETS.single).toHaveLength(9);
  });

  test('has 9 brackets for MFJ filers', () => {
    expect(CA_TAX_BRACKETS.mfj).toHaveLength(9);
  });

  test('brackets range from 1% to 12.3%', () => {
    const singleBrackets = CA_TAX_BRACKETS.single;
    expect(singleBrackets[0].rate).toBe(0.01);
    expect(singleBrackets[singleBrackets.length - 1].rate).toBe(0.123);
  });

  test('standard deduction is $5,706 single, $11,412 MFJ', () => {
    expect(CA_STANDARD_DEDUCTION.single).toBe(5706);
    expect(CA_STANDARD_DEDUCTION.mfj).toBe(11412);
  });

  test('personal exemption credit is $153 single, $306 MFJ', () => {
    expect(CA_PERSONAL_EXEMPTION_CREDIT.single).toBe(153);
    expect(CA_PERSONAL_EXEMPTION_CREDIT.mfj).toBe(306);
  });

  test('mental health surcharge threshold is $1,000,000', () => {
    expect(CA_MENTAL_HEALTH_THRESHOLD).toBe(1000000);
  });

  test('mental health surcharge rate is 1%', () => {
    expect(CA_MENTAL_HEALTH_RATE).toBe(0.01);
  });
});

describe('California Form 540 — Calculations', () => {
  const baseInput: Form540Input = {
    filingStatus: 'single',
    federalAGI: 85000,
  };

  test('starts with federal AGI as CA income', () => {
    const result = calculateForm540(baseInput);
    expect(result.caAGI).toBe(85000);
  });

  test('applies CA adjustments to federal AGI', () => {
    const result = calculateForm540({
      ...baseInput,
      caAdjustments: -2000,
    });
    expect(result.caAGI).toBe(83000);
  });

  test('uses CA standard deduction when no itemized provided', () => {
    const result = calculateForm540(baseInput);
    expect(result.deductionType).toBe('standard');
    expect(result.deduction).toBe(5706);
  });

  test('uses CA itemized deduction when higher than standard', () => {
    const result = calculateForm540({
      ...baseInput,
      caItemizedDeductions: 12000,
    });
    expect(result.deductionType).toBe('itemized');
    expect(result.deduction).toBe(12000);
  });

  test('uses CA standard deduction when itemized is lower', () => {
    const result = calculateForm540({
      ...baseInput,
      caItemizedDeductions: 3000,
    });
    expect(result.deductionType).toBe('standard');
    expect(result.deduction).toBe(5706);
  });

  test('calculates CA taxable income correctly', () => {
    // 85000 AGI - 5706 standard deduction = 79294
    const result = calculateForm540(baseInput);
    expect(result.taxableIncome).toBe(79294);
  });

  test('calculates CA tax using state brackets for single filer', () => {
    // Single filer, taxable income $79,294 (85000 - 5706)
    // Brackets adjusted ~3% upward for 2025
    const result = calculateForm540(baseInput);
    expect(result.taxBeforeCredits).toBe(3813);
  });

  test('applies personal exemption credit', () => {
    const result = calculateForm540(baseInput);
    // Single personal exemption credit: $153
    expect(result.exemptionCredits).toBe(153);
  });

  test('computes total CA tax after credits', () => {
    const result = calculateForm540(baseInput);
    // 3813 - 153 = 3660
    expect(result.totalTax).toBe(3660);
  });

  test('calculates MFJ tax correctly', () => {
    const mfjInput: Form540Input = {
      filingStatus: 'mfj',
      federalAGI: 150000,
    };
    const result = calculateForm540(mfjInput);
    // MFJ AGI 150000 - 11412 standard = 138588 taxable
    expect(result.caAGI).toBe(150000);
    expect(result.deduction).toBe(11412);
    expect(result.taxableIncome).toBe(138588);
    // MFJ brackets adjusted ~3% upward for 2025
    expect(result.taxBeforeCredits).toBe(5855);
    // MFJ exemption credit: $306
    expect(result.exemptionCredits).toBe(306);
    expect(result.totalTax).toBe(5549);
  });

  test('applies mental health surcharge for income over $1M', () => {
    const highIncomeInput: Form540Input = {
      filingStatus: 'single',
      federalAGI: 1500000,
    };
    const result = calculateForm540(highIncomeInput);
    // Taxable income: 1500000 - 5706 = 1494294
    // Mental health surcharge: (1494294 - 1000000) * 0.01 = 4942.94 → 4943
    expect(result.mentalHealthSurcharge).toBe(4943);
    // Total tax includes surcharge
    expect(result.totalTax).toBe(
      result.taxBeforeCredits + result.mentalHealthSurcharge - result.exemptionCredits,
    );
  });

  test('no mental health surcharge for income at or below $1M', () => {
    const result = calculateForm540(baseInput);
    expect(result.mentalHealthSurcharge).toBe(0);
  });

  test('mental health surcharge on exactly $1M taxable income', () => {
    // Taxable income exactly 1M — no surcharge (surcharge is on excess)
    const input: Form540Input = {
      filingStatus: 'single',
      federalAGI: 1005706, // minus 5706 std deduction = 1000000 taxable
    };
    const result = calculateForm540(input);
    expect(result.mentalHealthSurcharge).toBe(0);
  });

  test('taxable income floors at zero', () => {
    const result = calculateForm540({
      filingStatus: 'single',
      federalAGI: 3000,
    });
    // 3000 - 5706 = -2706 → floor at 0
    expect(result.taxableIncome).toBe(0);
    expect(result.taxBeforeCredits).toBe(0);
    expect(result.totalTax).toBe(0);
  });

  test('computes CA withholding and refund/owed', () => {
    const result = calculateForm540({
      ...baseInput,
      caWithholding: 5000,
      caEstimatedPayments: 500,
    });
    expect(result.totalPayments).toBe(5500);
    // Total tax 3660 vs payments 5500 → refund 1840
    expect(result.refundOrOwed).toBe(1840);
    expect(result.isRefund).toBe(true);
  });

  test('computes amount owed when payments less than tax', () => {
    const result = calculateForm540({
      ...baseInput,
      caWithholding: 2000,
    });
    expect(result.totalPayments).toBe(2000);
    // Total tax 3660 vs payments 2000 → owed -1660
    expect(result.refundOrOwed).toBe(-1660);
    expect(result.isRefund).toBe(false);
  });

  test('integration with federal Form 1040 results', () => {
    // A realistic scenario: couple with W-2 income, filing MFJ
    const caResult = calculateForm540({
      filingStatus: 'mfj',
      federalAGI: 200000,
      caItemizedDeductions: 15000,
      caWithholding: 8000,
    });
    // AGI 200000, itemized 15000 > standard 11412
    expect(caResult.deductionType).toBe('itemized');
    expect(caResult.taxableIncome).toBe(185000);
    expect(caResult.totalTax).toBeGreaterThan(0);
    expect(typeof caResult.refundOrOwed).toBe('number');
  });
});
