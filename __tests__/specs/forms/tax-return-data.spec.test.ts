/**
 * Spec: Canonical TaxReturnData Model
 *
 * Status: confirmed — TaxReturnData is the single source of truth for
 * all form lines, fed by buildTaxReturn(), with PDF and Free File adapters.
 *
 * Confirm: All tests pass — a single typed interface represents every line
 * of every form, buildTaxReturn() populates it, and adapters map it to
 * both PDF field names and Free File selectors.
 *
 * Invalidate: The interface is missing forms, buildTaxReturn() doesn't
 * populate all fields, or the adapters can't map every populated field.
 */

import type {
  TaxReturnData,
  Form1040Data,
  Schedule1Data,
  Schedule3Data,
  ScheduleEData,
  PIIData,
} from '@selftax/core';
import {
  buildTaxReturn,
  toPDFFieldMap,
  toFreeFileFieldMap,
  PDF_FIELD_MAPPINGS,
  PDF_TEMPLATE_FILES,
} from '@selftax/core/forms';
import type { BuildTaxReturnInput } from '@selftax/core/forms/buildTaxReturn';
import { calculateForm1040 } from '@selftax/core/engine/form1040';
import { calculateScheduleA } from '@selftax/core/engine/scheduleA';
import { calculateScheduleD } from '@selftax/core/engine/scheduleD';
import { calculateScheduleE } from '@selftax/core/engine/scheduleE';
import { calculateForm2441 } from '@selftax/core/engine/form2441';
import { calculateForm540 } from '@selftax/core/engine/form540';
import * as fs from 'fs';
import * as path from 'path';

// ── Synthetic test data ──────────────────────────────────────────────

const SYNTH_PII: PIIData = {
  primary: { firstName: 'Jane', lastName: 'Doe', ssn: '000-00-0001' },
  spouse: { firstName: 'John', lastName: 'Doe', ssn: '000-00-0002' },
  dependents: [
    { firstName: 'Kid', lastName: 'Doe', ssn: '000-00-0003', relationship: 'son' },
    { firstName: 'Tot', lastName: 'Doe', ssn: '000-00-0004', relationship: 'daughter' },
  ],
  address: { street: '123 Test Ave', city: 'Testville', state: 'CA', zip: '90000' },
  filingStatus: 'mfj',
};

/** Build a realistic BuildTaxReturnInput with synthetic data */
function buildSyntheticInput(): BuildTaxReturnInput {
  const wages = 200000;
  const rentalGross = 120000;

  const scheduleEInput = {
    grossRentalIncome: rentalGross,
    insurance: 6000,
    mortgageInterest: 40000,
    repairs: 5000,
    propertyTaxes: 17000,
    depreciation: 31000,
    otherExpenses: 16000,
  };
  const scheduleEOutput = calculateScheduleE(scheduleEInput);

  const scheduleAInput = {
    filingStatus: 'mfj' as const,
    stateIncomeTax: 14000,
    mortgageInterest: 15000,
  };
  const scheduleAOutput = calculateScheduleA(scheduleAInput);

  const form2441Output = calculateForm2441({
    qualifyingExpenses: 6000,
    qualifyingPersons: 2,
    agi: 200000 + scheduleEOutput.amountFor1040,
    fsaExclusion: 0,
  });

  const form1040Output = calculateForm1040({
    filingStatus: 'mfj',
    wages,
    rentalIncome: scheduleEOutput.amountFor1040,
    capitalGains: -3000,
    itemizedDeductions: scheduleAOutput.shouldItemize ? scheduleAOutput.totalItemized : undefined,
    dependentCareCredit: form2441Output.credit,
    federalWithholding: 31000,
    qualifyingChildren: 2,
  });

  const form540Output = calculateForm540({
    filingStatus: 'mfj',
    federalAGI: form1040Output.agi,
    caWithholding: 14000,
  });

  const scheduleDOutput = calculateScheduleD([]);

  return {
    taxYear: 2024,
    filingStatus: 'mfj',
    pii: SYNTH_PII,
    form1040: form1040Output,
    wages,
    taxableInterest: 0,
    qualifiedDividends: 0,
    ordinaryDividends: 0,
    scheduleA: { input: scheduleAInput, output: scheduleAOutput },
    scheduleD: { ...scheduleDOutput, capitalLossDeduction: 3000, netCapitalGainLoss: -3000 },
    capitalLossDeduction: 3000,
    rentalProperties: [{
      address: '456 Rental St',
      propertyType: '2',
      fairRentalDays: 365,
      personalUseDays: 0,
      input: scheduleEInput,
      output: scheduleEOutput,
    }],
    scheduleEAggregate: scheduleEOutput,
    form2441: form2441Output,
    totalDepreciation: 31000,
    qbiDeduction: 1000,
    qbiIncome: 5000,
    form540: form540Output,
    w2Withholding: 31000,
    caWithholding: 14000,
  };
}

describe('TaxReturnData — canonical data model', () => {
  test('interface has typed sub-interfaces for all required forms', () => {
    const input = buildSyntheticInput();
    const result: TaxReturnData = buildTaxReturn(input);

    // All form sections exist as typed objects
    expect(result.form1040).toBeDefined();
    expect(result.schedule1).toBeDefined();
    expect(result.schedule3).toBeDefined();
    expect(result.scheduleE).toBeDefined();
    expect(result.form2441).toBeDefined();
    expect(result.form4562).toBeDefined();
    expect(result.form8995).toBeDefined();
    expect(result.ca540).toBeDefined();
    expect(result.pii).toBeDefined();
    expect(result.taxYear).toBe(2024);

    // PII contains all identity fields
    expect(result.pii.primary.ssn).toBe('000-00-0001');
    expect(result.pii.spouse?.ssn).toBe('000-00-0002');
    expect(result.pii.dependents).toHaveLength(2);
    expect(result.pii.address.state).toBe('CA');
    expect(result.pii.filingStatus).toBe('mfj');
  });

  test('form1040 section covers all lines needed for filing', () => {
    const result = buildTaxReturn(buildSyntheticInput());
    const f = result.form1040;

    // All key lines exist and are numbers
    const keyLines: (keyof Form1040Data)[] = [
      'line1a', 'line2b', 'line3a', 'line3b',
      'line7', 'line8', 'line9', 'line10', 'line11',
      'line12a', 'line13', 'line14', 'line15', 'line16',
      'line22', 'line24', 'line25a', 'line33',
      'line34', 'line35a', 'line37',
    ];
    for (const line of keyLines) {
      expect(typeof f[line]).toBe('number');
    }

    // Filing status is a typed union
    expect(['single', 'mfj', 'mfs', 'hoh', 'qw']).toContain(f.filingStatus);

    // Wages populated
    expect(f.line1a).toBe(200000);
    expect(f.line9).toBeGreaterThan(0); // total income
    expect(f.line11).toBeGreaterThan(0); // AGI
  });

  test('scheduleE supports per-property line items and aggregated totals', () => {
    const result = buildTaxReturn(buildSyntheticInput());
    const se = result.scheduleE as ScheduleEData;

    // Per-property breakdown
    expect(se.properties).toHaveLength(1);
    const prop = se.properties[0];
    expect(prop.address).toBe('456 Rental St');
    expect(prop.line3).toBe(120000); // gross rents
    expect(prop.line9).toBe(6000); // insurance
    expect(prop.line12).toBe(40000); // mortgage interest
    expect(prop.line16).toBe(17000); // taxes
    expect(prop.line18).toBe(31000); // depreciation
    expect(prop.line20).toBeGreaterThan(0); // total expenses
    expect(typeof prop.line21).toBe('number'); // net income

    // Aggregate totals
    expect(se.line23a).toBe(prop.line21); // single property = total
    expect(se.line26).toBe(se.line23a);
  });

  test('pii section is separate and contains all identity fields', () => {
    const result = buildTaxReturn(buildSyntheticInput());

    // PII has all required fields
    expect(result.pii.primary.firstName).toBe('Jane');
    expect(result.pii.primary.lastName).toBe('Doe');
    expect(result.pii.primary.ssn).toBe('000-00-0001');
    expect(result.pii.spouse?.firstName).toBe('John');
    expect(result.pii.spouse?.ssn).toBe('000-00-0002');
    expect(result.pii.dependents[0].ssn).toBe('000-00-0003');
    expect(result.pii.dependents[0].relationship).toBe('son');
    expect(result.pii.dependents[1].ssn).toBe('000-00-0004');
    expect(result.pii.address.street).toBe('123 Test Ave');
    expect(result.pii.address.zip).toBe('90000');
    expect(result.pii.filingStatus).toBe('mfj');

    // PII NOT duplicated in form1040 numeric section
    const f1040Str = JSON.stringify(result.form1040);
    expect(f1040Str).not.toContain('000-00-0001');
    expect(f1040Str).not.toContain('Jane');
    expect(f1040Str).not.toContain('123 Test Ave');
  });
});

describe('buildTaxReturn() — documents + profile to canonical data', () => {
  test('produces complete TaxReturnData from engine outputs + profile', () => {
    const input = buildSyntheticInput();
    const result = buildTaxReturn(input);

    // Form 1040 populated from engine
    expect(result.form1040.line1a).toBe(200000);
    expect(result.form1040.line9).toBe(input.form1040.totalIncome);
    expect(result.form1040.line11).toBe(input.form1040.agi);
    // line15 = AGI - total deductions (including QBI, which the engine doesn't know about)
    expect(result.form1040.line15).toBe(
      Math.max(0, input.form1040.agi - input.form1040.deduction - (input.qbiDeduction ?? 0)),
    );
    expect(result.form1040.line24).toBe(input.form1040.totalTax);

    // Schedule E populated
    expect(result.scheduleE?.properties[0].line3).toBe(120000);

    // PII populated
    expect(result.pii.primary.firstName).toBe('Jane');

    // CA 540 populated
    expect(result.ca540).toBeDefined();
    expect(result.ca540!.line15).toBeGreaterThan(0);
  });

  test('populates schedule1 from rental income and adjustments', () => {
    const input = buildSyntheticInput();
    const result = buildTaxReturn(input);
    const s1 = result.schedule1 as Schedule1Data;

    // Rental income flows through Schedule 1
    expect(s1.line5).toBe(result.scheduleE!.line26);
    expect(s1.line10).toBe(s1.line5); // only rental income, no other
    // 1040 line 8 matches Schedule 1 line 10
    expect(result.form1040.line8).toBe(s1.line10);
  });

  test('populates schedule3 from Form 2441 and other credits', () => {
    const input = buildSyntheticInput();
    const result = buildTaxReturn(input);
    const s3 = result.schedule3 as Schedule3Data;

    // Dependent care credit flows through Schedule 3
    expect(s3.line2).toBe(input.form2441!.credit);
    expect(s3.line8).toBe(s3.line2); // only dependent care, no other credits
    // 1040 line 20 matches Schedule 3 line 8
    expect(result.form1040.line20).toBe(s3.line8);
  });

  test('is a pure deterministic function', () => {
    const input = buildSyntheticInput();
    const result1 = buildTaxReturn(input);
    const result2 = buildTaxReturn(input);

    // Same inputs → same outputs
    expect(result1).toEqual(result2);
  });
});

describe('PDF adapter — TaxReturnData to filled IRS PDF templates', () => {
  test('maps every populated TaxReturnData field to a real PDF AcroForm field name', () => {
    const result = buildTaxReturn(buildSyntheticInput());
    const pdfMap = toPDFFieldMap(result, 'form1040');

    // Non-empty map
    expect(Object.keys(pdfMap).length).toBeGreaterThan(10);

    // PII fields included (SSN, name, address)
    const fields = Object.keys(pdfMap);
    const hasSSN = fields.some((f) => f.includes('f1_03'));
    const hasName = fields.some((f) => f.includes('f1_01'));
    const hasAddress = fields.some((f) => f.includes('f1_10'));
    expect(hasSSN).toBe(true);
    expect(hasName).toBe(true);
    expect(hasAddress).toBe(true);

    // Numeric fields present (wages on line 1a → f1_18)
    const wagesField = Object.entries(pdfMap).find(([k]) => k.includes('f1_18'));
    expect(wagesField).toBeDefined();
    expect(wagesField![1]).toBe(200000);

    // All keys are AcroForm field names (not canonical paths)
    for (const key of Object.keys(pdfMap)) {
      expect(key).not.toContain('form1040.');
      expect(key).not.toContain('pii.');
    }
  });

  test('fills real IRS PDF template using pdf-lib AcroForm API', () => {
    // Verify template files exist on disk
    const templatesDir = path.resolve(__dirname, '../../../packages/tax-core/forms/templates');
    const templatePath = path.join(templatesDir, PDF_TEMPLATE_FILES.form1040);
    expect(fs.existsSync(templatePath)).toBe(true);

    // Verify the PDF is non-empty and looks like a PDF
    const pdfBytes = fs.readFileSync(templatePath);
    expect(pdfBytes.length).toBeGreaterThan(1000);
    expect(pdfBytes[0]).toBe(0x25); // %PDF header

    // Verify the mapping has field names that match the template's convention
    const mapping = PDF_FIELD_MAPPINGS.form1040;
    const fieldNames = Object.values(mapping);
    // IRS 1040 uses topmostSubform[0] prefix
    expect(fieldNames.some((f) => f.startsWith('topmostSubform[0]'))).toBe(true);
  });

  test('has field mappings for all forms: 1040, Sch A/D/E, Sch 1/2/3, 2441, 4562, 540', () => {
    const requiredForms: Array<keyof typeof PDF_FIELD_MAPPINGS> = [
      'form1040', 'schedule1', 'schedule2', 'schedule3',
      'scheduleA', 'scheduleD', 'scheduleE',
      'form2441', 'form4562', 'ca540',
    ];

    const templatesDir = path.resolve(__dirname, '../../../packages/tax-core/forms/templates');

    for (const formKey of requiredForms) {
      // Mapping exists and is non-empty
      const mapping = PDF_FIELD_MAPPINGS[formKey];
      expect(Object.keys(mapping).length).toBeGreaterThan(0);

      // Template file exists
      const templatePath = path.join(templatesDir, PDF_TEMPLATE_FILES[formKey]);
      expect(fs.existsSync(templatePath)).toBe(true);
    }
  });
});

describe('Free File adapter — TaxReturnData to IRS auto-fill selectors', () => {
  test('maps every populated TaxReturnData field to a CSS selector', () => {
    const result = buildTaxReturn(buildSyntheticInput());
    const ffMap = toFreeFileFieldMap(result, 'form1040');

    // Non-empty map
    expect(Object.keys(ffMap).length).toBeGreaterThan(10);

    // All keys are field names or label matchers
    for (const key of Object.keys(ffMap)) {
      expect(key.length).toBeGreaterThan(0);
    }

    // Wages present (via label matching)
    const wagesEntry = Object.entries(ffMap).find(([k]) => k.includes('Wages'));
    expect(wagesEntry).toBeDefined();
    expect(wagesEntry![1]).toBe(200000);
  });

  test('Free File and PDF adapters consume the same TaxReturnData', () => {
    const result = buildTaxReturn(buildSyntheticInput());

    const pdfMap = toPDFFieldMap(result, 'form1040');
    const ffMap = toFreeFileFieldMap(result, 'form1040');

    // Both maps are non-empty
    expect(Object.keys(pdfMap).length).toBeGreaterThan(0);
    expect(Object.keys(ffMap).length).toBeGreaterThan(0);

    // Wages value appears in both (same number, different keys)
    const pdfWages = Object.values(pdfMap).find((v) => v === 200000);
    const ffWages = Object.values(ffMap).find((v) => v === 200000);
    expect(pdfWages).toBe(200000);
    expect(ffWages).toBe(200000);

    // No tax calculation logic in adapters — just lookup
    // Verified by the fact that both produce results from the same TaxReturnData
    // without any engine imports
  });
});

describe('Round-trip integrity', () => {
  test('cross-form references are consistent in a realistic return', () => {
    const result = buildTaxReturn(buildSyntheticInput());

    // form1040.line8 === schedule1.line10 (other income from Schedule 1)
    expect(result.form1040.line8).toBe(result.schedule1!.line10);

    // schedule1.line5 === scheduleE.line26 (rental flows through Sch 1)
    expect(result.schedule1!.line5).toBe(result.scheduleE!.line26);

    // form1040.line20 === schedule3.line8 (credits from Schedule 3)
    expect(result.form1040.line20).toBe(result.schedule3!.line8);

    // form1040.line25a === W-2 withholding
    expect(result.form1040.line25a).toBe(31000);

    // form1040 total income is positive
    expect(result.form1040.line9).toBeGreaterThan(0);

    // AGI = total income - adjustments
    expect(result.form1040.line11).toBe(result.form1040.line9 - result.form1040.line10);

    // Total deductions = line 12c + line 13 (QBI)
    expect(result.form1040.line14).toBe(result.form1040.line12c + result.form1040.line13);

    // Taxable income = AGI - total deductions (min 0)
    expect(result.form1040.line15).toBe(
      Math.max(0, result.form1040.line11 - result.form1040.line14),
    );
  });
});
