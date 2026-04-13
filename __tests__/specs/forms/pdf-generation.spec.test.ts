/**
 * Spec: PDF Form Generation
 *
 * Status: confirmed
 * Confirm: Form data builders produce correct field mappings for all tax forms
 * Invalidate: pdf-lib can't handle IRS form field names or formatting
 *
 * Tests the PDF field data builders. Actual PDF rendering (pdf-lib)
 * is a web-layer concern — these tests verify the data is correct.
 */

import {
  build1040Fields,
  buildScheduleAFields,
  buildScheduleDFields,
  buildScheduleEFields,
  buildForm8949Fields,
  buildPIIFields,
  assembleTaxReturn,
  calculateForm1040,
  calculateScheduleA,
  calculateScheduleD,
  calculateScheduleE,
} from '@selftax/core';
import type { Form1040Output, UserProfile, StockTransaction } from '@selftax/core';

describe('PDF Form Generation', () => {
  test('fills Form 1040 PDF with calculated values', () => {
    const output = calculateForm1040({
      filingStatus: 'mfj',
      wages: 125432,
      federalWithholding: 28100,
    });
    const fields = build1040Fields(output);
    expect(fields['f1-7']).toBe(output.totalIncome);
    expect(fields['f1-8']).toBe(output.agi);
    expect(fields['f1-11']).toBe(output.taxableIncome);
    expect(fields['f1-12']).toBe(output.tax);
    expect(typeof fields['f1-7']).toBe('number');
  });

  test('fills Schedule A PDF', () => {
    const output = calculateScheduleA({
      filingStatus: 'mfj',
      stateIncomeTax: 10000,
      primaryPropertyTax: 12000,
      mortgageInterest: 18000,
      charitableCash: 3000,
    });
    const fields = buildScheduleAFields(output);
    expect(fields['sa-1']).toBe(output.saltDeduction);
    expect(fields['sa-4']).toBe(output.mortgageInterest);
    expect(fields['sa-6']).toBe(output.charitableTotal);
    expect(fields['sa-7']).toBe(output.totalItemized);
  });

  test('fills Schedule D PDF', () => {
    const output = calculateScheduleD([
      { description: '100 ACME', dateAcquired: '2025-01-01', dateSold: '2025-06-01', proceeds: 5000, costBasis: 3000 },
      { description: '50 FOO', dateAcquired: '2024-01-01', dateSold: '2025-06-01', proceeds: 8000, costBasis: 6000 },
    ]);
    const fields = buildScheduleDFields(output);
    expect(fields['sd-1']).toBe(output.shortTermNet);
    expect(fields['sd-5']).toBe(output.longTermNet);
    expect(fields['sd-7']).toBe(output.netCapitalGainLoss);
  });

  test('fills Schedule E PDF', () => {
    const input = {
      grossRentalIncome: 24000,
      repairs: 3200,
      insurance: 1800,
      propertyTaxes: 4000,
      mortgageInterest: 8000,
      depreciation: 9091,
    };
    const output = calculateScheduleE(input);
    const fields = buildScheduleEFields(input, output);
    expect(fields['se-3']).toBe(24000);
    expect(fields['se-14']).toBe(3200);
    expect(fields['se-16']).toBe(4000);
    expect(fields['se-21']).toBe(output.netRentalIncome);
  });

  test('fills Form 8949 PDF with stock transactions', () => {
    const transactions: StockTransaction[] = [
      { description: '100 ACME', dateAcquired: '2025-01-01', dateSold: '2025-06-01', proceeds: 5000, costBasis: 3000 },
      { description: '50 FOO', dateAcquired: '2024-01-01', dateSold: '2025-06-01', proceeds: 8000, costBasis: 6000, adjustment: 1000, adjustmentCode: 'B' },
    ];
    const pages = buildForm8949Fields(transactions);
    expect(pages).toHaveLength(1);
    expect(pages[0]['f8949-0-a']).toBe('100 ACME');
    expect(pages[0]['f8949-0-d']).toBe(5000);
    expect(pages[0]['f8949-1-f']).toBe('B');
    expect(pages[0]['f8949-1-g']).toBe(1000);
  });

  test('inserts PII (name, SSN) from local storage into final PDF', () => {
    const profile: UserProfile = {
      ssn: '000-00-0000',
      firstName: 'Jane',
      lastName: 'Doe',
      dateOfBirth: '1990-01-15',
      address: { street: '123 Main St', city: 'Anytown', state: 'CA', zip: '90210' },
    };
    const piiFields = buildPIIFields(profile);
    expect(piiFields.name).toBe('Jane Doe');
    expect(piiFields.ssn).toBe('000-00-0000');
    expect(piiFields.address).toBe('123 Main St');
    expect(piiFields.cityStateZip).toBe('Anytown, CA 90210');
  });

  test('generates all required forms as a single PDF package', () => {
    const profile: UserProfile = {
      ssn: '000-00-0000',
      firstName: 'Jane',
      lastName: 'Doe',
      dateOfBirth: '1990-01-15',
      address: { street: '123 Main St', city: 'Anytown', state: 'CA', zip: '90210' },
    };

    const output1040 = calculateForm1040({ filingStatus: 'mfj', wages: 125432 });
    const outputSchedA = calculateScheduleA({ filingStatus: 'mfj', stateIncomeTax: 10000, primaryPropertyTax: 12000, mortgageInterest: 18000 });

    const pkg = assembleTaxReturn(profile, [
      { formType: '1040', fields: build1040Fields(output1040) },
      { formType: 'schedule-a', fields: buildScheduleAFields(outputSchedA) },
    ]);

    expect(pkg.forms).toHaveLength(2);
    expect(pkg.forms[0].formType).toBe('1040');
    expect(pkg.forms[1].formType).toBe('schedule-a');
    expect(pkg.piiFields.name).toBe('Jane Doe');
    expect(pkg.piiFields.ssn).toBe('000-00-0000');
  });
});
