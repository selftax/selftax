/**
 * Spec: Form 1040 Calculation Engine
 *
 * Status: confirmed
 * Confirm: 1040 calculations match IRS worksheets for test scenarios
 * Invalidate: Tax law edge cases require more complex dependency graph
 *
 * Deterministic calculation engine for Form 1040. Pure functions,
 * no LLM involvement. Follows IRS instructions line by line.
 */

import {
  calculateTotalIncome,
  calculateAGI,
  calculateDeduction,
  calculateTaxableIncome,
  calculateTax,
  calculateChildTaxCredit,
  calculateForm1040,
  irsRound,
} from '@selftax/core';
import type { Form1040Input } from '@selftax/core';

const baseInput: Form1040Input = {
  filingStatus: 'mfj',
  wages: 125432,
};

describe('Form 1040 Calculations', () => {
  test('calculates total income (Line 9) from W-2 wages', () => {
    expect(calculateTotalIncome(baseInput)).toBe(125432);
  });

  test('adds Schedule D capital gains to total income', () => {
    expect(
      calculateTotalIncome({ ...baseInput, capitalGains: 5000 }),
    ).toBe(130432);
  });

  test('adds Schedule E rental income to total income', () => {
    expect(
      calculateTotalIncome({ ...baseInput, rentalIncome: 18000 }),
    ).toBe(143432);
  });

  test('calculates AGI (Line 11) after adjustments', () => {
    expect(
      calculateAGI({ ...baseInput, adjustments: 3000 }),
    ).toBe(122432);
  });

  test('applies standard deduction for filing status', () => {
    const { amount, type } = calculateDeduction(baseInput);
    expect(type).toBe('standard');
    expect(amount).toBe(30950); // MFJ 2025
  });

  test('applies itemized deduction when higher than standard', () => {
    const input: Form1040Input = {
      ...baseInput,
      itemizedDeductions: 35000,
    };
    const { amount, type } = calculateDeduction(input);
    expect(type).toBe('itemized');
    expect(amount).toBe(35000);
  });

  test('calculates taxable income (Line 15)', () => {
    // 125432 wages - 30950 standard deduction = 94482
    expect(calculateTaxableIncome(baseInput)).toBe(94482);
  });

  test('calculates tax using 2025 tax brackets', () => {
    // MFJ taxable income $94,482
    // 10% on first $24,300 = $2,430
    // 12% on $24,300 to $94,482 = $70,182 × 0.12 = $8,421.84
    // Total = $10,851.84 → rounds to $10,852
    const tax = calculateTax(94482, 'mfj');
    expect(tax).toBe(10852);
  });

  test('applies child tax credit', () => {
    // 2 children × $2,200 = $4,400 max, limited to tax liability
    const credit = calculateChildTaxCredit(2, 10852);
    expect(credit).toBe(4400);
  });

  test('applies dependent care credit (Form 2441)', () => {
    const result = calculateForm1040({
      ...baseInput,
      dependentCareCredit: 600,
      federalWithholding: 20000,
    });
    expect(result.totalCredits).toBe(600);
  });

  test('calculates total tax owed or refund', () => {
    const result = calculateForm1040({
      ...baseInput,
      federalWithholding: 20000,
    });
    // Tax on $94,482 = $10,852
    // No credits
    // Withholding $20,000 - Tax $10,852 = $9,148 refund
    expect(result.totalTax).toBe(10852);
    expect(result.totalPayments).toBe(20000);
    expect(result.refundOrOwed).toBe(9148);
    expect(result.isRefund).toBe(true);
  });

  test('rounds all amounts to nearest dollar per IRS rules', () => {
    expect(irsRound(1234.5)).toBe(1235);
    expect(irsRound(1234.49)).toBe(1234);
    expect(irsRound(1234.0)).toBe(1234);
    expect(irsRound(0.5)).toBe(1);
  });
});
