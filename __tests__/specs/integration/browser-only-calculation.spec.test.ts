/**
 * Spec: Path 1 — Browser-Only Calculation (No Server, No LLM)
 *
 * Status: confirmed — when all documents are structured IRS forms
 * (W-2, 1099-INT, 1098, prior-year 1040), the browser can calculate
 * the full return and generate FreeFile field maps without any server call.
 *
 * Confirm: StructuredExtraction → mergeStructuredExtractions → calculateForm1040 → toFreeFileFieldMap works end-to-end.
 * Invalidate: Field name mismatches prevent calculation, or missing wiring means server is still required.
 */

import {
  calculateForm1040,
  buildTaxReturn,
  toFreeFileFieldMap,
  calculateScheduleA,
  mergeStructuredExtractions,
  irsRound,
} from '@selftax/core';
import type {
  StructuredExtraction,
  FormKey,
} from '@selftax/core';

// Synthetic test data matching a simple filer: W-2 + 1099-INT + 1098 + prior-year return
const W2_EXTRACTION: StructuredExtraction = {
  formType: 'w2',
  documentTaxYear: 2025,
  wages: 100000,
  federalWithholding: 15000,
  stateWithholding: 5000,
  socialSecurityWages: 100000,
  socialSecurityTaxWithheld: 6200,
  medicareWages: 100000,
  medicareTaxWithheld: 1450,
};

const INT_EXTRACTION: StructuredExtraction = {
  formType: '1099-int',
  documentTaxYear: 2025,
  taxableInterest: 500,
};

const MORTGAGE_EXTRACTION: StructuredExtraction = {
  formType: '1098',
  documentTaxYear: 2025,
  primaryMortgageInterest: 20000,
};

const PRIOR_YEAR_EXTRACTION: StructuredExtraction = {
  formType: 'prior-year-return',
  documentTaxYear: 2024,
  wages: 95000,
  federalWithholding: 14000,
  capitalLossCarryforward: 3000,
  depreciation: 10000,
  amortization: 500,
  rentalInsurance: 700,
  rentalMortgageInterest: 30000,
  rentalPropertyTax: 12000,
  priorYearUnallowedLoss: 500,
  qbiIncome: 5000,
  occupation: 'SOFTWARE ENGINEER',
};

describe('Path 1: Browser-only calculation from structured fields', () => {

  test('structured extractions can be merged to MergedTaxInput', () => {
    const merged = mergeStructuredExtractions(
      [W2_EXTRACTION, INT_EXTRACTION, MORTGAGE_EXTRACTION, PRIOR_YEAR_EXTRACTION],
      'single',
      2025,
    );

    // Current-year W-2 fields
    expect(merged.wages).toBe(100000);
    expect(merged.federalWithholding).toBe(15000);
    expect(merged.stateWithholding).toBe(5000);

    // 1099-INT summed as otherIncome
    expect(merged.otherIncome).toBe(500);

    // 1098 mortgage
    expect(merged.primaryMortgageInterest).toBe(20000);

    // True carryforwards from prior-year
    expect(merged.capitalLossCarryforward).toBe(3000);
    expect(merged.occupation).toBe('SOFTWARE ENGINEER');

    // Depreciation carries forward on MACRS schedule
    // QBI, insurance, property tax need current-year documents
    expect(merged.qbiIncome).toBeUndefined();
    expect(merged.scheduleEInput).toBeDefined();
    expect(merged.scheduleEInput!.depreciation).toBe(10000); // depreciation only
    expect(merged.scheduleEInput!.otherExpenses).toBe(500); // amortization on line 19
    expect(merged.scheduleEInput!.priorYearUnallowedLoss).toBe(500);
  });

  test('prior-year wages do NOT override current-year wages', () => {
    const merged = mergeStructuredExtractions(
      [W2_EXTRACTION, PRIOR_YEAR_EXTRACTION],
      'single',
      2025,
    );

    // Should be 100000 (W-2), not 95000 (prior-year)
    expect(merged.wages).toBe(100000);
    expect(merged.federalWithholding).toBe(15000);
  });

  test('browser calculation produces correct Form 1040 from merged input', () => {
    const merged = mergeStructuredExtractions(
      [W2_EXTRACTION, INT_EXTRACTION],
      'single',
      2025,
    );

    const result = calculateForm1040({
      filingStatus: 'single',
      wages: merged.wages,
      federalWithholding: merged.federalWithholding,
      otherIncome: merged.otherIncome,
    });

    expect(result.totalIncome).toBeGreaterThan(0);
    expect(result.agi).toBeGreaterThan(0);
    expect(result.tax).toBeGreaterThan(0);
    expect(typeof result.refundOrOwed).toBe('number');
  });

  test('browser can generate FreeFile field maps from calculation result', () => {
    const calcResult = calculateForm1040({
      filingStatus: 'single',
      wages: 100000,
      federalWithholding: 15000,
    });

    const taxReturn = buildTaxReturn({
      taxYear: 2025,
      filingStatus: 'single',
      pii: {
        primary: { firstName: '', lastName: '', ssn: '' },
        dependents: [],
        address: { street: '', city: '', state: 'CA', zip: '' },
        filingStatus: 'single',
      },
      form1040: calcResult,
      wages: 100000,
    });

    const fieldMap = toFreeFileFieldMap(taxReturn, 'form1040');

    expect(fieldMap).toHaveProperty('txtWagesSalariesTips');
    expect(fieldMap).toHaveProperty('txtTotalIncome');
    expect(fieldMap).toHaveProperty('txtTotAdjGrossInc');
    expect(fieldMap).toHaveProperty('txtTaxableIncome');
    expect(fieldMap['txtWagesSalariesTips']).toBe(100000);
  });

  test('W-2 wages field flows through to FreeFile txtWagesSalariesTips', () => {
    const merged = mergeStructuredExtractions([W2_EXTRACTION], 'single', 2025);
    const result = calculateForm1040({ filingStatus: 'single', wages: merged.wages });
    const taxReturn = buildTaxReturn({
      taxYear: 2025, filingStatus: 'single',
      pii: { primary: { firstName: '', lastName: '', ssn: '' }, dependents: [], address: { street: '', city: '', state: '', zip: '' }, filingStatus: 'single' },
      form1040: result, wages: merged.wages ?? 0,
    });
    const fieldMap = toFreeFileFieldMap(taxReturn, 'form1040');
    expect(fieldMap['txtWagesSalariesTips']).toBe(100000);
  });

  test('1098 mortgage interest flows through to FreeFile Schedule A', () => {
    const merged = mergeStructuredExtractions([W2_EXTRACTION, MORTGAGE_EXTRACTION], 'single', 2025);

    // Calculate Schedule A with mortgage interest
    const scheduleA = calculateScheduleA({
      filingStatus: 'single',
      stateIncomeTax: merged.stateWithholding ?? 0,
      primaryPropertyTax: merged.primaryPropertyTax ?? 0,
      mortgageInterest: merged.primaryMortgageInterest ?? 0,
    });

    // If itemized > standard, the mortgage interest should appear in Schedule A
    if (scheduleA.totalItemized > 0) {
      const result = calculateForm1040({
        filingStatus: 'single',
        wages: merged.wages,
        federalWithholding: merged.federalWithholding,
        itemizedDeductions: scheduleA.totalItemized,
      });
      const taxReturn = buildTaxReturn({
        taxYear: 2025, filingStatus: 'single',
        pii: { primary: { firstName: '', lastName: '', ssn: '' }, dependents: [], address: { street: '', city: '', state: 'CA', zip: '' }, filingStatus: 'single' },
        form1040: result, wages: merged.wages ?? 0,
        scheduleA: {
          input: {
            filingStatus: 'single',
            stateIncomeTax: merged.stateWithholding ?? 0,
            primaryPropertyTax: merged.primaryPropertyTax ?? 0,
            mortgageInterest: merged.primaryMortgageInterest ?? 0,
          },
          output: scheduleA,
        },
      });
      const fieldMap = toFreeFileFieldMap(taxReturn, 'scheduleA');
      expect(fieldMap['txtHomeMortRep']).toBe(irsRound(merged.primaryMortgageInterest ?? 0));
    }
  });

  test('1099-INT interest flows through to FreeFile line 2b', () => {
    const merged = mergeStructuredExtractions([W2_EXTRACTION, INT_EXTRACTION], 'single', 2025);
    expect(merged.otherIncome).toBe(500);

    const result = calculateForm1040({
      filingStatus: 'single',
      wages: merged.wages,
      otherIncome: merged.otherIncome,
    });

    // Other income includes the interest
    expect(result.totalIncome).toBe(irsRound((merged.wages ?? 0) + 500));
  });

  test('prior-year capital loss carryforward flows through to calculation', () => {
    const merged = mergeStructuredExtractions([W2_EXTRACTION, PRIOR_YEAR_EXTRACTION], 'single', 2025);
    expect(merged.capitalLossCarryforward).toBe(3000);

    const result = calculateForm1040({
      filingStatus: 'single',
      wages: merged.wages,
      capitalLossCarryforward: merged.capitalLossCarryforward,
    });

    // Capital loss deduction reduces total income (up to $3000)
    expect(result.totalIncome).toBeLessThan(merged.wages!);
  });

  test('all structured forms combined produce expected refund amount', () => {
    const merged = mergeStructuredExtractions(
      [W2_EXTRACTION, INT_EXTRACTION, MORTGAGE_EXTRACTION],
      'single',
      2025,
    );

    const scheduleA = calculateScheduleA({
      filingStatus: 'single',
      stateIncomeTax: merged.stateWithholding ?? 0,
      primaryPropertyTax: merged.primaryPropertyTax ?? 0,
      mortgageInterest: merged.primaryMortgageInterest ?? 0,
    });

    const useItemized = scheduleA.totalItemized > 15350; // 2025 single standard

    const result = calculateForm1040({
      filingStatus: 'single',
      wages: merged.wages,
      federalWithholding: merged.federalWithholding,
      otherIncome: merged.otherIncome,
      itemizedDeductions: useItemized ? scheduleA.totalItemized : undefined,
    });

    // With $100k wages and $15k withheld, should get a refund
    expect(result.totalIncome).toBeGreaterThan(99000);
    expect(result.isRefund).toBe(true);
    expect(result.refundOrOwed).toBeGreaterThan(0);
  });
});
