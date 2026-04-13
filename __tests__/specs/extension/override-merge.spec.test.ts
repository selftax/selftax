/**
 * Spec: Server override merge — no double-counting
 *
 * When structured fields are sent to the server for context and the server
 * returns them in its merged output, the extension must not double-count them.
 */

import { calculateInBrowser, type ServerOverrides } from '@selftax/extension/services/browserCalculator';
import type { StructuredExtraction } from '@selftax/core';

// Mock chrome.storage for buildTaxReturn (it calls chrome.storage in some paths)
// @ts-expect-error — mock
globalThis.chrome = { storage: { local: { set: () => Promise.resolve(), get: () => Promise.resolve({}) } } };

const W2: StructuredExtraction = {
  formType: 'w2',
  wages: 217176,
  federalWithholding: 30971,
  stateWithholding: 14027,
  socialSecurityWages: 176100,
  socialSecurityTaxWithheld: 10918,
  medicareWages: 223162,
  medicareTaxWithheld: 3444,
  employerName: 'ACME PLATFORM, INC.',
  employerEin: '85-2922649',
  employerAddress: '350 BUSH STREET, 18TH FLOOR',
  employerCity: 'SAN FRANCISCO',
  employerState: 'CA',
  employerZip: '94104',
  stateEmployerId: '136-1643-8',
  box12: [
    { code: 'C', amount: 163.08 },
    { code: 'D', amount: 5985.98 },
    { code: 'DD', amount: 28674.48 },
  ],
};

const PRIOR_YEAR: StructuredExtraction = {
  formType: 'prior-year-return',
  documentTaxYear: 2024,
  priorYearAgi: 214184,
  capitalLossCarryforward: 114460,
  careProvider: {
    name: 'SUNSHINE DAYCARE',
    address: '100 TEST ST',
    city: 'Anytown',
    state: 'CA',
    zip: '90210',
    ein: '00-0000000',
  },
};

const MORTGAGE_1098: StructuredExtraction = {
  formType: '1098',
  primaryMortgageInterest: 14996,
};

const INT_1099: StructuredExtraction = {
  formType: '1099-int',
  taxableInterest: 192,
};

describe('Server override merge — no double-counting', () => {
  test('wages from local W-2 are NOT doubled when server returns same wages', () => {
    // Server received our structured fields for context and returns them in overrides
    const serverOverrides: ServerOverrides = {
      wages: 217176,           // same as local W-2
      federalWithholding: 30971, // same
      stateWithholding: 14027,   // same
    };

    const result = calculateInBrowser(
      [W2, PRIOR_YEAR, MORTGAGE_1098, INT_1099],
      'mfj', 'CA', 2, undefined,
      serverOverrides,
    );

    // Wages should be 217176, NOT 434352 (doubled)
    expect(result.summary.totalIncome).toBeLessThan(300000);
    expect(result.fieldMaps.form1040?.txtWagesSalariesTips).toBe(217176);
  });

  test('server-only fields (rental, childcare) ARE applied', () => {
    const serverOverrides: ServerOverrides = {
      wages: 217176,  // duplicate of local — should be ignored
      dependentCareExpenses: 12025,  // new from server
      primaryPropertyTax: 13528,      // new from server (Elm prop tax)
      scheduleEInput: {
        grossRentalIncome: 121200,
        managementFees: 7272,
        repairs: 2425,
        utilities: 10004,
        insurance: 6332,
        mortgageInterest: 40890,
        propertyTaxes: 17007,
        depreciation: 32182,
      },
    };

    const result = calculateInBrowser(
      [W2, PRIOR_YEAR, MORTGAGE_1098, INT_1099],
      'mfj', 'CA', 2, undefined,
      serverOverrides,
    );

    // Wages should NOT be doubled
    expect(result.fieldMaps.form1040?.txtWagesSalariesTips).toBe(217176);

    // Rental should be applied
    expect(result.fieldMaps.schedule1?.txtSuppIncome).toBeDefined();

    // Dependent care credit should be applied
    expect(result.summary.forms).toContain('form2441');
  });

  test('capital loss from local is not overwritten by server', () => {
    const serverOverrides: ServerOverrides = {
      capitalLossCarryforward: 114460, // same as local prior year
    };

    const result = calculateInBrowser(
      [W2, PRIOR_YEAR, MORTGAGE_1098, INT_1099],
      'mfj', 'CA', 2, undefined,
      serverOverrides,
    );

    // Capital loss deduction should be -3000 (capped), not doubled
    expect(result.fieldMaps.form1040?.txtCapitalGains).toBe(-3000);
  });

  test('without overrides, calculation uses only local fields', () => {
    const result = calculateInBrowser(
      [W2, PRIOR_YEAR, MORTGAGE_1098, INT_1099],
      'mfj', 'CA', 2,
    );

    expect(result.fieldMaps.form1040?.txtWagesSalariesTips).toBe(217176);
    expect(result.summary.totalIncome).toBeLessThan(250000);
  });

  test('W-2 fieldMap is generated from structured extraction', () => {
    const result = calculateInBrowser(
      [W2, PRIOR_YEAR, MORTGAGE_1098, INT_1099],
      'mfj', 'CA', 2,
    );

    // W-2 form should be in the field maps
    expect(result.fieldMaps.w2).toBeDefined();
    expect(result.fieldMaps.w2.txtWagesTips).toBe(217176);
    expect(result.fieldMaps.w2.txtFedIncTaxWithheld).toBe(30971);
    expect(result.fieldMaps.w2.txtSocSecWages).toBe(176100);
    expect(result.fieldMaps.w2.txtSocSecTaxWithheld).toBe(10918);
    expect(result.fieldMaps.w2.txtMedicareWagesTips).toBe(223162);
    expect(result.fieldMaps.w2.txtMedicareTaxWithheld).toBe(3444);
    expect(result.fieldMaps.w2.txtSt1IncTax).toBe(14027);
    // W-2 should be in the forms list
    expect(result.summary.forms).toContain('w2');
  });

  test('e-file fieldMap includes prior year AGI and signature date', () => {
    const result = calculateInBrowser(
      [W2, PRIOR_YEAR, MORTGAGE_1098, INT_1099],
      'mfj', 'CA', 2,
    );

    expect(result.fieldMaps.efile).toBeDefined();
    // Prior year AGI from PRIOR_YEAR extraction
    expect(result.fieldMaps.efile.txtPriorAgi).toBeDefined();
    expect(result.fieldMaps.efile.txtPriorSpAgi).toBeDefined();
    // Signature date is today's date
    expect(result.fieldMaps.efile.txtSignatureDate).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  test('W-2 includes employee PII when provided', () => {
    const pii = {
      primary: { firstName: 'Jane', lastName: 'Doe', ssn: '000-00-0000' },
      address: { street: '123 Test St', city: 'Anytown', state: 'CA', zip: '90210' },
      dependents: [],
      filingStatus: 'single',
    };

    const result = calculateInBrowser(
      [W2],
      'single', 'CA', 0, pii,
    );

    expect(result.fieldMaps.w2).toBeDefined();
    expect(result.fieldMaps.w2.txtEmpFirstName).toBe('Jane');
    expect(result.fieldMaps.w2.txtEmpLastName).toBe('Doe');
    expect(result.fieldMaps.w2.txtEmplyerSSN).toBe('000-00-0000');
    expect(result.fieldMaps.w2.txtEmpAddress).toBe('123 Test St');
    expect(result.fieldMaps.w2.cboEmpState).toBe('CA');
  });

  test('W-2 includes employer info from structured extraction', () => {
    const result = calculateInBrowser(
      [W2],
      'single', 'CA', 0,
    );

    expect(result.fieldMaps.w2.txtEmployerName).toBe('ACME PLATFORM, INC.');
    expect(result.fieldMaps.w2.txtEmployerIdNum).toBe('85-2922649');
    expect(result.fieldMaps.w2.txtEmployerAddress).toBe('350 BUSH STREET, 18TH FLOOR');
    expect(result.fieldMaps.w2.txtEmployerCity).toBe('SAN FRANCISCO');
    expect(result.fieldMaps.w2.cboEmployerState).toBe('CA');
    expect(result.fieldMaps.w2.txtEmployerZip).toBe('94104');
    expect(result.fieldMaps.w2.txtSt1EmployerId).toBe('136-1643-8');
  });

  test('W-2 includes Box 12 code and amount pairs', () => {
    const result = calculateInBrowser(
      [W2],
      'single', 'CA', 0,
    );

    expect(result.fieldMaps.w2.cboBox12ACode).toBe('C');
    expect(result.fieldMaps.w2.txtBox12AAmount).toBe(163.08);
    expect(result.fieldMaps.w2.cboBox12BCode).toBe('D');
    expect(result.fieldMaps.w2.txtBox12BAmount).toBe(5985.98);
    expect(result.fieldMaps.w2.cboBox12CCode).toBe('DD');
    expect(result.fieldMaps.w2.txtBox12CAmount).toBe(28674.48);
    // No box 12d
    expect(result.fieldMaps.w2.cboBox12DCode).toBeUndefined();
  });

  test('Form 2441 includes care provider info from server overrides', () => {
    const serverOverrides: ServerOverrides = {
      dependentCareExpenses: 12025,
      careProvider: {
        name: 'Temple Beth Sholom Preschool',
        address: '642 Elm Ave',
        city: 'Springfield',
        state: 'CA',
        zip: '94577',
        ein: '94-1234567',
        isHouseholdEmployee: false,
      },
    };

    const result = calculateInBrowser(
      [W2],
      'mfj', 'CA', 2, undefined,
      serverOverrides,
    );

    // Form 2441 should exist (dependent care expenses > 0)
    expect(result.fieldMaps.form2441).toBeDefined();

    // Care provider fields — organization name goes in Last/Business, not split
    expect(result.fieldMaps.form2441.txtCarePersonFname1).toBeUndefined();
    expect(result.fieldMaps.form2441.txtCarePersonLname1).toBe('Temple Beth Sholom Preschool');
    expect(result.fieldMaps.form2441.txtCarePersonAddr1).toBe('642 Elm Ave');
    expect(result.fieldMaps.form2441.txtCarePersonCity1).toBe('Springfield');
    expect(result.fieldMaps.form2441.cboCarePersonState1).toBe('CA');
    expect(result.fieldMaps.form2441.txtCarePersonZip1).toBe('94577');
    expect(result.fieldMaps.form2441.txtCarePersonEIN1).toBe('94-1234567');
    expect(result.fieldMaps.form2441.txtCarePersonAmount1).toBe(12025);
  });

  test('Form 2441 uses prior year provider when daycare has expenses but no provider info', () => {
    const serverOverrides: ServerOverrides = {
      dependentCareExpenses: 12025,
      // No careProvider from daycare statement
    };

    const result = calculateInBrowser(
      [W2, PRIOR_YEAR],
      'mfj', 'CA', 2, undefined,
      serverOverrides,
    );

    expect(result.fieldMaps.form2441).toBeDefined();
    // Should fall back to prior year provider — org name in Last/Business
    expect(result.fieldMaps.form2441.txtCarePersonEIN1).toBe('00-0000000');
    expect(result.fieldMaps.form2441.txtCarePersonLname1).toBe('SUNSHINE DAYCARE');
  });

  test('Form 2441 merges prior year details when daycare has matching name but no EIN', () => {
    const serverOverrides: ServerOverrides = {
      dependentCareExpenses: 12025,
      careProvider: {
        name: 'Sunshine Daycare', // matches prior year "SUNSHINE DAYCARE"
        // No EIN, address — should be filled from prior year
      },
    };

    const result = calculateInBrowser(
      [W2, PRIOR_YEAR],
      'mfj', 'CA', 2, undefined,
      serverOverrides,
    );

    expect(result.fieldMaps.form2441).toBeDefined();
    // EIN/address from prior year, name from daycare
    expect(result.fieldMaps.form2441.txtCarePersonEIN1).toBe('00-0000000');
    expect(result.fieldMaps.form2441.txtCarePersonAddr1).toBe('100 TEST ST');
  });

  test('Form 2441 does NOT use prior year provider when no childcare expenses', () => {
    // No dependentCareExpenses → no Form 2441 → no provider
    const result = calculateInBrowser(
      [W2, PRIOR_YEAR],
      'mfj', 'CA', 2,
    );

    // No form2441 at all (no childcare expenses)
    expect(result.fieldMaps.form2441).toBeUndefined();
  });

  test('Form 2441 does NOT use prior year provider when daycare has different provider', () => {
    const serverOverrides: ServerOverrides = {
      dependentCareExpenses: 12025,
      careProvider: {
        name: 'Bright Horizons Childcare', // different from "SUNSHINE DAYCARE"
        ein: '12-3456789',
        address: '100 Main St',
      },
    };

    const result = calculateInBrowser(
      [W2, PRIOR_YEAR],
      'mfj', 'CA', 2, undefined,
      serverOverrides,
    );

    expect(result.fieldMaps.form2441).toBeDefined();
    // Should use the daycare statement's provider, NOT prior year
    expect(result.fieldMaps.form2441.txtCarePersonEIN1).toBe('12-3456789');
    expect(result.fieldMaps.form2441.txtCarePersonAddr1).toBe('100 Main St');
  });
});
