/**
 * Spec: Medical Deductions, HSA, and Student Loan Interest
 * Status: confirmed — medical on Schedule A with AGI floor, HSA/student loan reduce AGI
 * Confirm: all three deductions calculate correctly and wire into engine
 * Invalidate: deductions removed or broken
 */

import {
  calculateForm1040,
  calculateScheduleA,
  getTaxYearConfig,
  irsRound,
} from '@selftax/core';

describe('Medical Deductions (Schedule A)', () => {

  test('TaxYearConfig includes medical deduction floor', () => {
    expect(getTaxYearConfig(2025).medicalDeductionFloor).toBe(0.075);
    expect(getTaxYearConfig(2024).medicalDeductionFloor).toBe(0.075);
  });

  test('medical expenses deductible above 7.5% of AGI', () => {
    const result = calculateScheduleA({
      filingStatus: 'mfj',
      medicalExpenses: 12000,
      agi: 100000,
    });
    // Floor: $100k × 7.5% = $7,500. Deductible: $12k - $7.5k = $4,500
    expect(result.medicalDeduction).toBe(4500);
  });

  test('no medical deduction when expenses below floor', () => {
    const result = calculateScheduleA({
      filingStatus: 'mfj',
      medicalExpenses: 5000,
      agi: 100000,
    });
    expect(result.medicalDeduction).toBe(0);
  });

  test('medical deduction adds to total itemized deductions', () => {
    const result = calculateScheduleA({
      filingStatus: 'mfj',
      medicalExpenses: 12000,
      agi: 100000,
      stateIncomeTax: 10000,
      mortgageInterest: 15000,
    });
    // Medical $4,500 + SALT $10,000 + mortgage $15,000 = $29,500
    expect(result.totalItemized).toBe(29500);
  });

  test('medical deduction can tip standard-vs-itemized decision', () => {
    const base = {
      filingStatus: 'mfj' as const,
      stateIncomeTax: 10000,
      mortgageInterest: 15000,
      agi: 100000,
    };
    // Without medical: $25,000 < $30,950 standard → don't itemize
    const without = calculateScheduleA(base);
    expect(without.shouldItemize).toBe(false);

    // With $20k medical (deductible $12,500): $37,500 > $30,950 → itemize
    const with20k = calculateScheduleA({ ...base, medicalExpenses: 20000 });
    expect(with20k.shouldItemize).toBe(true);
  });
});

describe('HSA Deduction (Form 8889)', () => {

  test('TaxYearConfig includes HSA contribution limits', () => {
    expect(getTaxYearConfig(2025).hsaLimits.selfOnly).toBe(4300);
    expect(getTaxYearConfig(2025).hsaLimits.family).toBe(8550);
    expect(getTaxYearConfig(2025).hsaLimits.catchUp55).toBe(1000);
    expect(getTaxYearConfig(2024).hsaLimits.selfOnly).toBe(4150);
    expect(getTaxYearConfig(2023).hsaLimits.selfOnly).toBe(3850);
  });

  test('HSA deduction reduces AGI', () => {
    const result = calculateForm1040({
      filingStatus: 'mfj',
      wages: 100000,
      hsaDeduction: 4300,
    });
    // AGI = $100k - $4,300 = $95,700
    expect(result.agi).toBe(95700);
    expect(result.agi).toBeLessThan(result.totalIncome);
  });

  test('backward compatible — no HSA impact when field absent', () => {
    const result = calculateForm1040({ filingStatus: 'mfj', wages: 125432 });
    expect(result.tax).toBe(10852);
  });
});

describe('Student Loan Interest Deduction', () => {

  test('TaxYearConfig includes student loan phaseout thresholds', () => {
    const c = getTaxYearConfig(2025);
    expect(c.studentLoanPhaseout.mfj).toEqual({ start: 155000, end: 180000 });
    expect(c.studentLoanPhaseout.single).toEqual({ start: 75000, end: 90000 });
    expect(c.studentLoanMaxDeduction).toBe(2500);
  });

  test('student loan interest deduction capped at $2,500', () => {
    const r1 = calculateForm1040({ filingStatus: 'mfj', wages: 60000, studentLoanInterest: 3000 });
    const r2 = calculateForm1040({ filingStatus: 'mfj', wages: 60000, studentLoanInterest: 1500 });
    const noSL = calculateForm1040({ filingStatus: 'mfj', wages: 60000 });
    // $3k capped to $2,500
    expect(r1.agi).toBe(57500);
    // $1.5k used as-is
    expect(r2.agi).toBe(58500);
    expect(noSL.agi).toBe(60000);
  });

  test('student loan deduction reduces AGI', () => {
    const result = calculateForm1040({
      filingStatus: 'mfj',
      wages: 60000,
      studentLoanInterest: 2500,
    });
    expect(result.agi).toBe(57500);
  });

  test('MAGI phaseout reduces deduction for higher income', () => {
    // MFJ 2025: phaseout $155k-$180k
    const full = calculateForm1040({
      filingStatus: 'mfj', wages: 150000, studentLoanInterest: 2500,
    });
    expect(full.agi).toBe(147500); // full $2,500 deduction

    const partial = calculateForm1040({
      filingStatus: 'mfj', wages: 167500, studentLoanInterest: 2500,
    });
    // At midpoint ($167.5k): 50% → $1,250 deduction
    expect(partial.agi).toBe(166250);

    const none = calculateForm1040({
      filingStatus: 'mfj', wages: 180000, studentLoanInterest: 2500,
    });
    // Above $180k → $0 deduction
    expect(none.agi).toBe(180000);
  });

  test('backward compatible — no student loan impact when field absent', () => {
    const result = calculateForm1040({ filingStatus: 'mfj', wages: 125432 });
    expect(result.tax).toBe(10852);
  });
});
