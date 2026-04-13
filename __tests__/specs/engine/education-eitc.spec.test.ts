/**
 * Spec: Education Credits (Form 8863) + Earned Income Tax Credit (EITC)
 * Status: confirmed — AOTC/LLC reduce tax, EITC adds to payments
 * Confirm: credits calculate correctly with phaseouts, wired into calculateForm1040
 * Invalidate: education credits or EITC removed or broken
 */

import {
  calculateForm1040,
  calculateEducationCredit,
  calculateEITC,
  getTaxYearConfig,
  irsRound,
} from '@selftax/core';

describe('Education Credits (Form 8863)', () => {

  test('AOTC calculates 100% of first $2k + 25% of next $2k per student', () => {
    const r1 = calculateEducationCredit({
      type: 'aotc', filingStatus: 'mfj', expenses: 4000, students: 1, magi: 100000,
    });
    expect(r1.totalCredit).toBe(2500); // $2000 + 25% × $2000

    const r2 = calculateEducationCredit({
      type: 'aotc', filingStatus: 'mfj', expenses: 8000, students: 2, magi: 100000,
    });
    expect(r2.totalCredit).toBe(5000); // $2500 × 2 students
  });

  test('AOTC is 40% refundable', () => {
    const result = calculateEducationCredit({
      type: 'aotc', filingStatus: 'mfj', expenses: 4000, students: 1, magi: 100000,
    });
    expect(result.refundableCredit).toBe(1000); // 40% × $2500
    expect(result.nonrefundableCredit).toBe(1500); // 60% × $2500
  });

  test('LLC calculates 20% of first $10k per return', () => {
    const r1 = calculateEducationCredit({
      type: 'llc', filingStatus: 'mfj', expenses: 10000, magi: 100000,
    });
    expect(r1.totalCredit).toBe(2000);

    const r2 = calculateEducationCredit({
      type: 'llc', filingStatus: 'mfj', expenses: 15000, magi: 100000,
    });
    expect(r2.totalCredit).toBe(2000); // capped at $10k × 20%
  });

  test('LLC is fully nonrefundable', () => {
    const result = calculateEducationCredit({
      type: 'llc', filingStatus: 'mfj', expenses: 10000, magi: 100000,
    });
    expect(result.refundableCredit).toBe(0);
    expect(result.nonrefundableCredit).toBe(2000);
  });

  test('MAGI phaseout reduces credit for high-income filers', () => {
    // MFJ 2025: $160k-$180k phaseout
    const full = calculateEducationCredit({
      type: 'aotc', filingStatus: 'mfj', expenses: 4000, students: 1, magi: 150000,
    });
    expect(full.creditAfterPhaseout).toBe(2500); // below phaseout

    const half = calculateEducationCredit({
      type: 'aotc', filingStatus: 'mfj', expenses: 4000, students: 1, magi: 170000,
    });
    expect(half.creditAfterPhaseout).toBe(1250); // midpoint = 50%

    const zero = calculateEducationCredit({
      type: 'aotc', filingStatus: 'mfj', expenses: 4000, students: 1, magi: 180000,
    });
    expect(zero.creditAfterPhaseout).toBe(0); // above phaseout
  });

  test('education credits wired into calculateForm1040', () => {
    // AOTC: $2,500 credit ($1,500 nonrefundable, $1,000 refundable)
    const result = calculateForm1040({
      filingStatus: 'mfj',
      wages: 60000,
      educationExpenses: 4000,
      educationCreditType: 'aotc',
      numberOfStudents: 1,
      federalWithholding: 5000,
    });
    // totalCredits should include the $1,500 nonrefundable
    expect(result.totalCredits).toBeGreaterThanOrEqual(1500);
    // totalPayments should include the $1,000 refundable
    expect(result.totalPayments).toBeGreaterThanOrEqual(6000); // $5000 withholding + $1000 refundable
  });
});

describe('Earned Income Tax Credit (EITC)', () => {

  test('TaxYearConfig includes EITC parameters per child count', () => {
    const c = getTaxYearConfig(2025);
    expect(c.eitcTable).toBeDefined();
    expect(c.eitcTable[0]).toBeDefined();
    expect(c.eitcTable[1]).toBeDefined();
    expect(c.eitcTable[2]).toBeDefined();
    expect(c.eitcTable[3]).toBeDefined();
    expect(c.eitcInvestmentIncomeLimit).toBe(11600);
  });

  test('EITC with 0 children — small credit for low-income workers', () => {
    const result = calculateEITC({
      filingStatus: 'single', earnedIncome: 8000, agi: 8000, qualifyingChildren: 0,
    });
    // 2025: credit rate 7.65%, earned income amount $8,490
    // At $8k earned: $8,000 × 7.65% = $612
    expect(result.credit).toBe(612);
  });

  test('EITC with 2 children — larger credit', () => {
    const result = calculateEITC({
      filingStatus: 'mfj', earnedIncome: 20000, agi: 20000, qualifyingChildren: 2,
    });
    // 2025: rate 40%, earned amount $17,880
    // Max credit = $17,880 × 40% = $7,152
    // At $20k earned (above $17,880) → max credit
    // Phaseout start for MFJ is $30,470 → not yet in phaseout
    expect(result.credit).toBe(7152);
  });

  test('EITC phases out as income increases', () => {
    const max = calculateEITC({
      filingStatus: 'mfj', earnedIncome: 20000, agi: 20000, qualifyingChildren: 2,
    });
    const partial = calculateEITC({
      filingStatus: 'mfj', earnedIncome: 50000, agi: 50000, qualifyingChildren: 2,
    });
    expect(partial.credit).toBeLessThan(max.credit);
    expect(partial.credit).toBeGreaterThan(0);
    expect(partial.inPhaseout).toBe(true);
  });

  test('EITC is zero when income exceeds max AGI', () => {
    const result = calculateEITC({
      filingStatus: 'mfj', earnedIncome: 70000, agi: 70000, qualifyingChildren: 2,
    });
    expect(result.credit).toBe(0);
  });

  test('EITC denied when investment income exceeds limit', () => {
    const result = calculateEITC({
      filingStatus: 'mfj', earnedIncome: 20000, agi: 20000,
      qualifyingChildren: 2, investmentIncome: 15000,
    });
    expect(result.credit).toBe(0);
  });

  test('EITC is refundable — adds to total payments in calculateForm1040', () => {
    const result = calculateForm1040({
      filingStatus: 'single',
      wages: 8000,
      earnedIncome: 8000,
      qualifyingChildrenForEITC: 0,
      federalWithholding: 0,
    });
    // EITC ~$612 should show up as a refund even with $0 withholding
    expect(result.totalPayments).toBeGreaterThan(0);
    expect(result.isRefund).toBe(true);
  });

  test('backward compatible — no EITC when fields absent', () => {
    const result = calculateForm1040({ filingStatus: 'mfj', wages: 125432 });
    expect(result.tax).toBe(10852);
  });
});
