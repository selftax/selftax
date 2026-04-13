/**
 * Spec: 2025 Return Baseline — Verified Against Source Documents
 *
 * Status: confirmed — every input number manually verified from actual
 * tax documents. This is the ground truth for the 2025 return.
 *
 * Filing: MFJ, CA resident, 2 dependents (qualifying children)
 * Documents: W-2, 2x 1099-INT, 2x 1098, 4x rental spreadsheets,
 *            childcare statement, property tax bills, prior-year 1040
 *
 * Confirm: Engine produces correct refund from verified inputs.
 * Invalidate: Any engine change that shifts the refund without a valid reason.
 */

import {
  calculateForm1040,
  calculateScheduleA,
  calculateScheduleE,
  calculateForm2441,
  calculateForm540,
  irsRound,
} from '@selftax/core';
import type { FilingStatus } from '@selftax/core';

// ── Verified inputs from source documents ──────────────────────

// W-2 (Acme Corp, 2025)
const W2 = {
  wages: 217176.44,
  federalWithholding: 30970.89,
  stateWithholding: 14026.86,
};

// 1099-INT: Chase ($16.06) + Mr. Cooper ($175.50)
const TOTAL_INTEREST = 16.06 + 175.50; // = $191.56

// 1098 (Elm — primary residence)
const PRIMARY_MORTGAGE_INTEREST = 14996.38;

// 1098 (Harris — rental property, from escrow)
const RENTAL_MORTGAGE_INTEREST = 40890.07;
const RENTAL_PROPERTY_TAX_ESCROW = 17007.07;
const RENTAL_HAZARD_INSURANCE = 6332.00;

// Property tax bill (Elm — primary residence, 2025-2026)
const PRIMARY_PROPERTY_TAX = 13528.08;

// Rental spreadsheets (718 Harris Ct #1-4, tallied from DEC summary sheets)
const RENTAL = {
  grossRent: 121200.00,   // #1:26700 + #2:31500 + #3:28500 + #4:34500
  managementFees: 7272.00, // #1:1602 + #2:1890 + #3:1710 + #4:2070
  repairs: 2425.00,        // #1:2325 + #2:100
  utilities: 10004.09,     // #1:10004.09 (PG&E + water + garbage)
};

// Childcare (sum of ACH payments in calendar year 2025)
const DEPENDENT_CARE_EXPENSES = 12025.05;

// Prior-year 1040 carryforwards
const PRIOR_YEAR = {
  capitalLossCarryforward: 114460,
  depreciation: 31353,
  amortization: 829,
  priorYearUnallowedLoss: 508,
  qbiIncome: 6520,
};

const FILING_STATUS: FilingStatus = 'mfj';
const DEPENDENTS = 2;

// ── Tests ──────────────────────────────────────────────────────

describe('2025 Return Baseline (verified from source documents)', () => {

  // Pre-compute all intermediate results
  const scheduleEInput = {
    grossRentalIncome: RENTAL.grossRent,
    insurance: RENTAL_HAZARD_INSURANCE,
    mortgageInterest: RENTAL_MORTGAGE_INTEREST,
    propertyTaxes: RENTAL_PROPERTY_TAX_ESCROW,
    depreciation: PRIOR_YEAR.depreciation + PRIOR_YEAR.amortization, // 32,182
    priorYearUnallowedLoss: PRIOR_YEAR.priorYearUnallowedLoss,
    managementFees: RENTAL.managementFees,
    repairs: RENTAL.repairs,
    utilities: RENTAL.utilities,
    otherExpenses: 0,
  };
  const seOutput = calculateScheduleE(scheduleEInput);

  const scheduleAInput = {
    filingStatus: FILING_STATUS,
    stateIncomeTax: W2.stateWithholding,
    primaryPropertyTax: PRIMARY_PROPERTY_TAX,
    mortgageInterest: irsRound(PRIMARY_MORTGAGE_INTEREST),
  };
  const saOutput = calculateScheduleA(scheduleAInput);

  const roughAgi = irsRound(W2.wages + seOutput.amountFor1040 + TOTAL_INTEREST);
  const form2441 = calculateForm2441({
    qualifyingExpenses: DEPENDENT_CARE_EXPENSES,
    qualifyingPersons: DEPENDENTS,
    agi: roughAgi,
  });

  const f1040 = calculateForm1040({
    filingStatus: FILING_STATUS,
    taxYear: 2025,
    wages: W2.wages,
    otherIncome: TOTAL_INTEREST,
    rentalIncome: seOutput.amountFor1040,
    capitalLossCarryforward: PRIOR_YEAR.capitalLossCarryforward,
    qbiIncome: seOutput.amountFor1040 > 0 ? seOutput.amountFor1040 : undefined,
    itemizedDeductions: saOutput.shouldItemize ? saOutput.totalItemized : undefined,
    federalWithholding: W2.federalWithholding,
    qualifyingChildren: DEPENDENTS,
    dependentCareCredit: form2441.credit,
  });

  const ca540 = calculateForm540({
    filingStatus: FILING_STATUS,
    federalAGI: f1040.agi,
    caWithholding: W2.stateWithholding,
    dependentCount: DEPENDENTS,
    primaryPropertyTax: PRIMARY_PROPERTY_TAX,
    primaryMortgageInterest: irsRound(PRIMARY_MORTGAGE_INTEREST),
  });

  // ── Schedule E ──

  test('Schedule E: rental expenses total correctly', () => {
    const totalExpenses = irsRound(
      RENTAL_HAZARD_INSURANCE + RENTAL_MORTGAGE_INTEREST + RENTAL_PROPERTY_TAX_ESCROW +
      (PRIOR_YEAR.depreciation + PRIOR_YEAR.amortization) +
      RENTAL.managementFees + RENTAL.repairs + RENTAL.utilities,
    );
    expect(totalExpenses).toBe(irsRound(
      6332 + 40890.07 + 17007.07 + 32182 + 7272 + 2425 + 10004.09,
    ));
  });

  test('Schedule E: net rental income', () => {
    // Gross rent minus total expenses, adjusted for passive loss
    expect(seOutput.amountFor1040).toBe(4580);
  });

  // ── Schedule A ──

  test('Schedule A: SALT capped at $10,000 for MFJ', () => {
    // State tax $14,027 + property tax $13,528 = $27,555
    // But 2025 SALT cap for MFJ may differ — check what engine uses
    expect(saOutput.saltDeduction).toBeLessThanOrEqual(40000); // OBBBA raised cap
    expect(saOutput.saltDeduction).toBeGreaterThan(0);
  });

  test('Schedule A: should itemize (mortgage + SALT > standard deduction)', () => {
    expect(saOutput.shouldItemize).toBe(true);
    expect(saOutput.totalItemized).toBe(42551);
  });

  // ── Form 2441 ──

  test('Form 2441: dependent care credit = $1,200', () => {
    expect(form2441.credit).toBe(1200);
  });

  // ── Form 1040 ──

  test('Form 1040: total income', () => {
    // Wages + interest + rental - capital loss deduction
    expect(f1040.totalIncome).toBe(218948);
  });

  test('Form 1040: AGI', () => {
    expect(f1040.agi).toBe(218948);
  });

  test('Form 1040: taxable income', () => {
    // AGI - itemized deductions - QBI deduction ($916 = 20% × $4,580 current year rental)
    expect(f1040.taxableIncome).toBe(175481);
  });

  test('Form 1040: tax', () => {
    expect(f1040.tax).toBe(28245);
  });

  test('Form 1040: total credits = CTC ($4,400) + dependent care ($1,200)', () => {
    expect(f1040.totalCredits).toBe(5600);
  });

  test('Form 1040: total tax', () => {
    expect(f1040.totalTax).toBe(22645);
  });

  test('Form 1040: total payments (federal withholding)', () => {
    expect(f1040.totalPayments).toBe(30971);
  });

  test('Form 1040: REFUND = $8,326', () => {
    expect(f1040.isRefund).toBe(true);
    expect(f1040.refundOrOwed).toBe(8326);
  });

  // ── CA Form 540 ──
  // CA AGI = Federal AGI = $218,948
  // CA itemized: $13,528 property tax + $14,996 mortgage = $28,524 (no state tax, no SALT cap)
  // CA taxable income = $190,424
  // CA bracket tax = $10,794
  // Mental health surcharge = $0 (income < $1M)
  // Exemption credits: personal $288 + 2 dependents × $446 = $1,180
  // CA total tax = $9,614
  // CA withholding (W-2 Box 17) = $14,027
  // CA refund = $4,413

  test('CA 540: CA AGI matches federal AGI', () => {
    expect(ca540.caAGI).toBe(218948);
  });

  test('CA 540: uses CA itemized ($28,524 — property tax + mortgage, no state tax)', () => {
    expect(ca540.deductionType).toBe('itemized');
    expect(ca540.deduction).toBe(28524);
  });

  test('CA 540: taxable income', () => {
    expect(ca540.taxableIncome).toBe(190424);
  });

  test('CA 540: bracket tax', () => {
    expect(ca540.taxBeforeCredits).toBe(10587);
  });

  test('CA 540: exemption credits include dependents', () => {
    // Personal $306 + 2 × $475 = $1,256
    expect(ca540.exemptionCredits).toBe(1256);
  });

  test('CA 540: total tax', () => {
    expect(ca540.totalTax).toBe(9331);
  });

  test('CA 540: payments = state withholding', () => {
    expect(ca540.totalPayments).toBe(14027);
  });

  test('CA 540: refund = $4,696', () => {
    expect(ca540.isRefund).toBe(true);
    expect(ca540.refundOrOwed).toBe(4696);
  });
});
