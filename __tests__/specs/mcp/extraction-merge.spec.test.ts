/**
 * Spec: Extraction Merger — deterministic merge of per-document extractions
 * Status: confirmed
 *
 * Tests the mergeExtractions() function with synthetic TaxDocumentExtraction[]
 * that simulate what the parallel extractors produce from real documents.
 * All names, addresses, and amounts are fake/synthetic.
 */

import { mergeExtractions } from '@selftax/mcp/extractionMerger';
import type { TaxDocumentExtraction } from '@selftax/mcp/docDistiller';

describe('Extraction Merger', () => {

  test('single-source fields: last non-null wins', () => {
    const extractions: TaxDocumentExtraction[] = [
      { sourceDocument: 'prior-return.pdf', wages: 180000, stateWithholding: 11000 },
      { sourceDocument: 'w2-current.pdf', wages: 195000, stateWithholding: 12500 },
    ];
    const result = mergeExtractions(extractions);
    expect(result.wages).toBe(195000);
    expect(result.stateWithholding).toBe(12500);
  });

  test('prior year return only contributes carryforward fields', () => {
    const extractions: TaxDocumentExtraction[] = [
      {
        sourceDocument: '2024 Tax Return.pdf',
        // Prior year return might extract everything — but merger should filter
        wages: 180000,
        stateWithholding: 11000,
        depreciation: 28000,
        amortization: 750,
        capitalLossCarryforward: 95000,
        rentalInsurance: 600,
        primaryPropertyTax: 10500,
      },
      { sourceDocument: 'w2-current.pdf', wages: 195000, federalWithholding: 28000, stateWithholding: 12500 },
      { sourceDocument: 'primary-tax-bill.pdf', primaryPropertyTax: 11000 },
    ];
    const result = mergeExtractions(extractions);
    // Current-year docs win for income/withholding fields
    expect(result.wages).toBe(195000);
    expect(result.stateWithholding).toBe(12500);
    expect(result.primaryPropertyTax).toBe(11000);
    // Carryforward fields come from prior year return
    expect(result.capitalLossCarryforward).toBe(95000);
  });

  test('rental units from multiple documents are summed', () => {
    const extractions: TaxDocumentExtraction[] = [
      {
        sourceDocument: 'unit-a.xls',
        rentalUnits: [{ address: '100 Oak St #A', grossRent: 24000, managementFees: 1440, utilities: 8500, repairs: 2000 }],
      },
      {
        sourceDocument: 'unit-b.xls',
        rentalUnits: [{ address: '100 Oak St #B', grossRent: 30000, managementFees: 1800, repairs: 500 }],
      },
      {
        sourceDocument: 'unit-c.xls',
        rentalUnits: [{ address: '100 Oak St #C', grossRent: 26000, managementFees: 1560 }],
      },
    ];
    const result = mergeExtractions(extractions);
    expect(result.scheduleEInput).toBeDefined();
    expect(result.scheduleEInput!.grossRentalIncome).toBe(80000);
    expect(result.scheduleEInput!.managementFees).toBe(4800);
    expect(result.scheduleEInput!.repairs).toBe(2500);
    expect(result.scheduleEInput!.utilities).toBe(8500);
  });

  test('rental 1098 data merges with unit data in scheduleEInput', () => {
    const extractions: TaxDocumentExtraction[] = [
      {
        sourceDocument: 'rental-1098.pdf',
        rentalMortgageInterest: 36000,
        rentalPropertyTax: 15000,
        rentalInsurance: 5500,
      },
      {
        sourceDocument: 'prior-return.pdf',
        depreciation: 28000,
        amortization: 750,
      },
      {
        sourceDocument: 'unit-a.xls',
        rentalUnits: [{ grossRent: 24000, managementFees: 1440, utilities: 8500, repairs: 2000 }],
      },
      {
        sourceDocument: 'unit-b.xls',
        rentalUnits: [{ grossRent: 30000, managementFees: 1800, repairs: 500 }],
      },
    ];
    const result = mergeExtractions(extractions);
    const se = result.scheduleEInput!;
    expect(se.grossRentalIncome).toBe(54000);
    expect(se.mortgageInterest).toBe(36000);
    expect(se.propertyTaxes).toBe(15000);
    expect(se.insurance).toBe(5500);
    expect(se.depreciation).toBe(28000); // depreciation only
    expect(se.otherExpenses).toBe(750); // amortization on line 19
    expect(se.managementFees).toBe(3240);
    expect(se.utilities).toBe(8500);
    expect(se.repairs).toBe(2500);
  });

  test('rental property tax uses highest value (1098 annual > single installment)', () => {
    const extractions: TaxDocumentExtraction[] = [
      // 1098 escrow shows annual total
      { sourceDocument: 'rental-1098.pdf', rentalPropertyTax: 15000 },
      // Individual tax bills show installments
      { sourceDocument: 'tax-bill-1.pdf', rentalPropertyTax: 7500 },
      { sourceDocument: 'tax-bill-2.pdf', rentalPropertyTax: 7200 },
    ];
    const result = mergeExtractions(extractions);
    // Should use the highest value (1098 annual total), not last installment
    expect(result.scheduleEInput!.propertyTaxes).toBe(15000);
  });

  test('QBI derived from net rental when not explicitly set', () => {
    const extractions: TaxDocumentExtraction[] = [
      { sourceDocument: '1098.pdf', rentalMortgageInterest: 36000, rentalPropertyTax: 15000, rentalInsurance: 5500 },
      { sourceDocument: 'return.pdf', depreciation: 28000, amortization: 750 },
      { sourceDocument: 'units.xls', rentalUnits: [{ grossRent: 100000, managementFees: 6000, utilities: 8000, repairs: 2000 }] },
    ];
    const result = mergeExtractions(extractions);
    // Net = 100000 - 5500 - 36000 - 2000 - 15000 - 28750 - 6000 - 8000 - 0 = -1250
    // Negative → no QBI
    expect(result.qbiIncome).toBeUndefined();
  });

  test('QBI not derived in merger — calculateTaxes handles it', () => {
    const extractions: TaxDocumentExtraction[] = [
      { sourceDocument: '1098.pdf', rentalMortgageInterest: 20000, rentalPropertyTax: 8000, rentalInsurance: 3000 },
      { sourceDocument: 'return.pdf', depreciation: 15000 },
      { sourceDocument: 'units.xls', rentalUnits: [{ grossRent: 60000, managementFees: 3600, utilities: 4000, repairs: 1000 }] },
    ];
    const result = mergeExtractions(extractions);
    // QBI derivation moved to calculateTaxes.ts — merger only passes through explicit values
    expect(result.qbiIncome).toBeUndefined();
    // But scheduleEInput is populated for the engine to compute from
    expect(result.scheduleEInput).toBeDefined();
  });

  test('explicit QBI from prior return overrides derived value', () => {
    const extractions: TaxDocumentExtraction[] = [
      { sourceDocument: 'return.pdf', qbiIncome: 7500, depreciation: 28000 },
      { sourceDocument: 'units.xls', rentalUnits: [{ grossRent: 100000, managementFees: 6000 }] },
    ];
    const result = mergeExtractions(extractions);
    expect(result.qbiIncome).toBe(7500);
  });

  test('taxable interest sums across multiple 1099-INTs', () => {
    const extractions: TaxDocumentExtraction[] = [
      { sourceDocument: 'bank-1099int.pdf', taxableInterest: 25.50 },
      { sourceDocument: 'mortgage-1099int.pdf', taxableInterest: 150.00 },
    ];
    const result = mergeExtractions(extractions);
    expect(result.otherIncome).toBeCloseTo(175.50, 1);
  });

  test('full scenario: multiple doc types produce correct overrides', () => {
    const extractions: TaxDocumentExtraction[] = [
      // Prior return — carryforward only
      { sourceDocument: 'prior-return.pdf', depreciation: 28000, amortization: 750, capitalLossCarryforward: 95000 },
      // Current W-2
      { sourceDocument: 'w2.pdf', wages: 195000, federalWithholding: 28000, stateWithholding: 12500 },
      // 1099-INTs
      { sourceDocument: 'bank-int.pdf', taxableInterest: 25.50 },
      { sourceDocument: 'mortgage-int.pdf', taxableInterest: 150.00 },
      // Primary 1098
      { sourceDocument: 'primary-1098.pdf', primaryMortgageInterest: 13000 },
      // Primary property tax
      { sourceDocument: 'primary-tax.pdf', primaryPropertyTax: 11000 },
      // Rental 1098
      { sourceDocument: 'rental-1098.pdf', rentalMortgageInterest: 36000, rentalPropertyTax: 15000, rentalInsurance: 5500 },
      // 3 rental units
      { sourceDocument: 'unit-a.xls', rentalUnits: [{ grossRent: 24000, managementFees: 1440, utilities: 8500, repairs: 2000 }] },
      { sourceDocument: 'unit-b.xls', rentalUnits: [{ grossRent: 30000, managementFees: 1800, repairs: 500 }] },
      { sourceDocument: 'unit-c.xls', rentalUnits: [{ grossRent: 26000, managementFees: 1560 }] },
      // Childcare
      { sourceDocument: 'childcare.pdf', dependentCareExpenses: 10000 },
      // Empty docs
      { sourceDocument: '1095c.pdf' },
      { sourceDocument: 'tips.pdf' },
    ];

    const result = mergeExtractions(extractions);

    expect(result.wages).toBe(195000);
    expect(result.federalWithholding).toBe(28000);
    expect(result.stateWithholding).toBe(12500);
    expect(result.primaryPropertyTax).toBe(11000);
    expect(result.capitalLossCarryforward).toBe(95000);
    expect(result.dependentCareExpenses).toBe(10000);
    expect(result.otherIncome).toBeCloseTo(175.50, 1);

    const se = result.scheduleEInput!;
    expect(se.grossRentalIncome).toBe(80000);
    expect(se.mortgageInterest).toBe(36000);
    expect(se.propertyTaxes).toBe(15000);
    expect(se.insurance).toBe(5500);
    expect(se.depreciation).toBe(28000);
    expect(se.otherExpenses).toBe(750); // amortization
    expect(se.managementFees).toBe(4800);
    expect(se.utilities).toBe(8500);
    expect(se.repairs).toBe(2500);
  });

  test('prior year values do NOT override current year values (by filename)', () => {
    const extractions: TaxDocumentExtraction[] = [
      { sourceDocument: '2024 Tax Return.pdf', wages: 180000, stateWithholding: 11000, primaryPropertyTax: 10500 },
      { sourceDocument: 'w2-current.pdf', wages: 195000, stateWithholding: 12500 },
      { sourceDocument: 'tax-bill.pdf', primaryPropertyTax: 11000 },
    ];
    const result = mergeExtractions(extractions);
    expect(result.wages).toBe(195000);
    expect(result.stateWithholding).toBe(12500);
    expect(result.primaryPropertyTax).toBe(11000);
  });

  test('prior year detected by documentTaxYear even when filename is generic', () => {
    const extractions: TaxDocumentExtraction[] = [
      // Filename is just "w2" (no year info) but LLM tagged it as 2024
      { sourceDocument: 'w2', documentTaxYear: 2024, wages: 180000, stateWithholding: 11000,
        depreciation: 28000, capitalLossCarryforward: 95000,
        rentalUnits: [{ grossRent: 100000, managementFees: 6000 }] },
      { sourceDocument: 'w2-2025.pdf', documentTaxYear: 2025, wages: 195000, stateWithholding: 12500 },
    ];
    const result = mergeExtractions(extractions);
    // 2024 wages skipped, 2025 wages used
    expect(result.wages).toBe(195000);
    expect(result.stateWithholding).toBe(12500);
    // Carryforward fields still come from 2024
    expect(result.capitalLossCarryforward).toBe(95000);
    // 2024 rental units should be filtered out
    expect(result.scheduleEInput?.grossRentalIncome ?? 0).toBe(0);
  });

  test('prior year detected by heuristic (too many fields = full return)', () => {
    const extractions: TaxDocumentExtraction[] = [
      // No documentTaxYear, generic filename, but 10+ fields with wages+rental+cap loss = full return
      { sourceDocument: 'w2', wages: 180000, federalWithholding: 25000, stateWithholding: 11000,
        primaryPropertyTax: 10500, primaryMortgageInterest: 13000,
        rentalMortgageInterest: 35000, rentalPropertyTax: 14000, rentalInsurance: 600,
        depreciation: 28000, capitalLossCarryforward: 95000, dependentCareExpenses: 15000,
        rentalUnits: [{ grossRent: 100000, managementFees: 6000 }] },
      { sourceDocument: 'w2-actual.pdf', wages: 195000, stateWithholding: 12500 },
    ];
    const result = mergeExtractions(extractions);
    expect(result.wages).toBe(195000);
    expect(result.capitalLossCarryforward).toBe(95000);
  });
});
