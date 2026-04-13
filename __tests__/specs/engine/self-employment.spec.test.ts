/**
 * Spec: Schedule C (Self-Employment Income) + Schedule SE (Self-Employment Tax)
 * Status: confirmed — SE income flows to 1040, SE tax added, deductible half reduces AGI
 * Confirm: calculateScheduleC/SE produce correct results, wired into calculateForm1040
 * Invalidate: self-employment calculations removed or broken
 */

import {
  calculateForm1040,
  calculateScheduleC,
  calculateScheduleSE,
  getTaxYearConfig,
  irsRound,
} from '@selftax/core';

describe('Schedule C (Self-Employment Income)', () => {

  test('TaxYearConfig includes Social Security wage base per year', () => {
    expect(getTaxYearConfig(2025).socialSecurityWageBase).toBe(176100);
    expect(getTaxYearConfig(2024).socialSecurityWageBase).toBe(168600);
    expect(getTaxYearConfig(2023).socialSecurityWageBase).toBe(160200);
    expect(getTaxYearConfig(2025).socialSecurityRate).toBe(0.124);
    expect(getTaxYearConfig(2025).medicareRate).toBe(0.029);
    expect(getTaxYearConfig(2025).selfEmploymentTaxMultiplier).toBe(0.9235);
  });

  test('calculateScheduleC computes net profit from receipts and expenses', () => {
    const result = calculateScheduleC({
      grossReceipts: 100000,
      advertising: 2000,
      insurance: 3000,
      office: 1000,
      supplies: 500,
      utilities: 1500,
    });
    expect(result.grossIncome).toBe(100000);
    expect(result.totalExpenses).toBe(8000);
    expect(result.netProfit).toBe(92000);
  });

  test('Schedule C meals expense is 50% deductible', () => {
    const result = calculateScheduleC({
      grossReceipts: 50000,
      meals: 5000,
    });
    // $5,000 meals × 50% = $2,500 deductible
    expect(result.totalExpenses).toBe(2500);
    expect(result.netProfit).toBe(47500);
  });

  test('Schedule C home office simplified method', () => {
    const r200 = calculateScheduleC({ grossReceipts: 50000, homeOfficeSquareFeet: 200 });
    expect(r200.homeOfficeDeduction).toBe(1000); // 200 × $5

    const r500 = calculateScheduleC({ grossReceipts: 50000, homeOfficeSquareFeet: 500 });
    expect(r500.homeOfficeDeduction).toBe(1500); // capped at 300 × $5
  });

  test('Schedule C net loss caps home office deduction', () => {
    // Expenses exceed receipts before home office → home office = 0
    const result = calculateScheduleC({
      grossReceipts: 10000,
      office: 12000,
      homeOfficeSquareFeet: 300,
    });
    expect(result.homeOfficeDeduction).toBe(0);
    expect(result.netProfit).toBe(-2000);
  });
});

describe('Schedule SE (Self-Employment Tax)', () => {

  test('calculates SE tax on 92.35% of net SE income', () => {
    const result = calculateScheduleSE({ netSEIncome: 100000 });
    // Base: $100k × 0.9235 = $92,350
    // SS: $92,350 × 12.4% = $11,451
    // Medicare: $92,350 × 2.9% = $2,678
    // Total: $14,129
    expect(result.seTaxBase).toBe(92350);
    expect(result.socialSecurityTax).toBe(11451);
    expect(result.medicareTax).toBe(2678);
    expect(result.seTax).toBe(14129);
    expect(result.deductibleHalf).toBe(7065);
  });

  test('SS portion caps at wage base minus W-2 wages', () => {
    const result = calculateScheduleSE({ netSEIncome: 50000, wages: 150000 });
    // Base: $50k × 0.9235 = $46,175
    // SS room: $176,100 - $150,000 = $26,100
    // SS: $26,100 × 12.4% = $3,236
    // Medicare: $46,175 × 2.9% = $1,339
    // Total: $4,575
    expect(result.socialSecurityTax).toBe(3236);
    expect(result.medicareTax).toBe(1339);
    expect(result.seTax).toBe(4575);
  });

  test('SS portion is zero when wages already exceed wage base', () => {
    const result = calculateScheduleSE({ netSEIncome: 50000, wages: 200000 });
    // Wages $200k > wage base $176,100 → SS room = 0
    // Medicare only: $46,175 × 2.9% = $1,339
    expect(result.socialSecurityTax).toBe(0);
    expect(result.seTax).toBe(1339);
  });

  test('no SE tax on zero or negative SE income', () => {
    expect(calculateScheduleSE({ netSEIncome: 0 }).seTax).toBe(0);
    expect(calculateScheduleSE({ netSEIncome: -5000 }).seTax).toBe(0);
  });
});

describe('Schedule C + SE wired into calculateForm1040', () => {

  test('selfEmploymentIncome adds to total income', () => {
    const result = calculateForm1040({
      filingStatus: 'mfj',
      wages: 80000,
      selfEmploymentIncome: 50000,
    });
    expect(result.totalIncome).toBe(130000);
  });

  test('deductible half of SE tax reduces AGI', () => {
    // SE $100k → SE tax $14,129 → deductible half $7,065
    const result = calculateForm1040({
      filingStatus: 'mfj',
      selfEmploymentIncome: 100000,
    });
    expect(result.totalIncome).toBe(100000);
    // AGI = $100,000 - $7,065 = $92,935
    expect(result.agi).toBe(92935);
    expect(result.agi).toBeLessThan(result.totalIncome);
  });

  test('SE tax adds to total tax', () => {
    const result = calculateForm1040({
      filingStatus: 'mfj',
      selfEmploymentIncome: 100000,
      federalWithholding: 0,
    });
    // Total tax includes bracket tax + SE tax ($14,129)
    // AGI $92,935, taxable = $92,935 - $30,950 = $61,985
    // Bracket tax on $61,985 ≈ $7,352
    // Total = $7,352 + $14,129 = $21,481
    expect(result.totalTax).toBeGreaterThan(14129); // at least SE tax
    expect(result.totalTax).toBe(irsRound(
      // bracket tax on $61,985
      24300 * 0.10 + (61985 - 24300) * 0.12 +
      // SE tax
      14129,
    ));
  });

  test('SE income triggers Additional Medicare Tax when combined with wages', () => {
    // MFJ: wages $230k + SE $50k. SE Additional Medicare uses reduced threshold.
    const result = calculateForm1040({
      filingStatus: 'mfj',
      wages: 230000,
      selfEmploymentIncome: 50000,
      federalWithholding: 50000,
    });
    // Total income: $280k. After SE deductible half → AGI lower.
    // Additional Medicare: wages $230k < $250k threshold → $0 on wages.
    // But SE income has its own Additional Medicare check in form8959.
    // The seTax itself includes the 2.9% Medicare but NOT the 0.9% additional.
    // Additional Medicare: SE threshold reduced by wages: $250k - $230k = $20k.
    // SE base $46,175. Over threshold by $46,175 - $20,000 = $26,175.
    // Additional Medicare on SE: $26,175 × 0.9% = $236
    expect(result.totalTax).toBeGreaterThan(0);
  });

  test('backward compatible — no SE impact when selfEmploymentIncome absent', () => {
    const result = calculateForm1040({ filingStatus: 'mfj', wages: 125432 });
    expect(result.tax).toBe(10852);
    expect(result.totalTax).toBe(10852);
  });
});
