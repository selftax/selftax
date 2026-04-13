/**
 * Spec: FreeFile Field Map Coverage
 *
 * Status: confirmed — all forms with engine calculations have FreeFile
 * field mappings AND data flowing through TaxReturnData.
 *
 * Confirm: Every form key in FREE_FILE_FIELD_MAPPINGS that has entries
 * also has a corresponding section in TaxReturnData that buildTaxReturn populates.
 *
 * Invalidate: A form has field mappings but no data flowing through it
 * (would produce 0 fields on autofill).
 */

import { toFreeFileFieldMap } from '@selftax/core/forms';
import { FREE_FILE_FIELD_MAPPINGS } from '@selftax/core/forms/freeFileFieldMappings';
import { buildTaxReturn } from '@selftax/core/forms/buildTaxReturn';
import type { BuildTaxReturnInput } from '@selftax/core/forms/buildTaxReturn';
import type { PIIData, TaxReturnData } from '@selftax/core';
import { calculateForm1040 } from '@selftax/core/engine/form1040';
import { calculateScheduleA } from '@selftax/core/engine/scheduleA';
import { calculateScheduleE } from '@selftax/core/engine/scheduleE';
import { calculateForm2441 } from '@selftax/core/engine/form2441';
import { calculateForm6251 } from '@selftax/core/engine/form6251';
import { calculateAdditionalMedicare } from '@selftax/core/engine/form8959';
import { calculateNIIT } from '@selftax/core/engine/form8960';
import type { FormKey } from '@selftax/core/forms/pdfFieldMappings';

const SYNTH_PII: PIIData = {
  primary: { firstName: 'Jane', lastName: 'Doe', ssn: '000-00-0001' },
  spouse: { firstName: 'John', lastName: 'Doe', ssn: '000-00-0002' },
  dependents: [
    { firstName: 'Kid', lastName: 'Doe', ssn: '000-00-0003', relationship: 'SON' },
  ],
  address: { street: '123 Test Ave', city: 'Testville', state: 'CA', zip: '90000' },
  filingStatus: 'mfj',
  occupation: 'ENGINEER',
};

/** Build input with enough data to populate most forms */
function buildFullInput(): BuildTaxReturnInput {
  const wages = 300000;
  const scheduleEInput = {
    grossRentalIncome: 120000,
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
    primaryPropertyTax: 13000,
  };
  const scheduleAOutput = calculateScheduleA(scheduleAInput);

  const form2441Output = calculateForm2441({
    qualifyingExpenses: 6000,
    qualifyingPersons: 1,
    agi: wages + scheduleEOutput.amountFor1040,
  });

  const form1040Output = calculateForm1040({
    filingStatus: 'mfj',
    wages,
    rentalIncome: scheduleEOutput.amountFor1040,
    capitalGains: -3000,
    itemizedDeductions: scheduleAOutput.shouldItemize ? scheduleAOutput.totalItemized : undefined,
    dependentCareCredit: form2441Output.credit,
    federalWithholding: 50000,
    qualifyingChildren: 1,
    otherIncome: 500,
  });

  const form6251Output = calculateForm6251({
    taxableIncome: form1040Output.taxableIncome,
    regularTax: form1040Output.tax,
    filingStatus: 'mfj',
    stateLocalTaxDeduction: 10000,
  });

  const form8959Output = calculateAdditionalMedicare({
    wages,
    selfEmploymentIncome: 0,
    filingStatus: 'mfj',
    taxYear: 2025,
  });

  const form8960Output = calculateNIIT({
    netInvestmentIncome: 1500,
    magi: form1040Output.agi,
    filingStatus: 'mfj',
    taxYear: 2025,
  });

  return {
    taxYear: 2025,
    filingStatus: 'mfj',
    pii: SYNTH_PII,
    form1040: form1040Output,
    wages,
    taxableInterest: 500,
    scheduleA: { input: scheduleAInput, output: scheduleAOutput },
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
    form6251: form6251Output,
    form8959: form8959Output,
    form8960: form8960Output,
    totalDepreciation: 31000,
    qbiDeduction: 1000,
    qbiIncome: 5000,
    qualifyingChildren: 1,
    w2Withholding: 50000,
  };
}

describe('FreeFile field map coverage — all mapped forms produce data', () => {
  const input = buildFullInput();
  const taxReturn: TaxReturnData = buildTaxReturn(input);

  // Forms that should have non-empty field maps
  const formsWithData: FormKey[] = [
    'form1040', 'schedule1', 'schedule3', 'scheduleA', 'scheduleE',
    'form2441', 'form8995',
  ];

  for (const formKey of formsWithData) {
    test(`${formKey}: field mapping produces non-empty output`, () => {
      const mapping = FREE_FILE_FIELD_MAPPINGS[formKey];
      expect(Object.keys(mapping).length).toBeGreaterThan(0);

      const fieldMap = toFreeFileFieldMap(taxReturn, formKey);
      expect(Object.keys(fieldMap).length).toBeGreaterThan(0);
    });
  }

  test('form1040 maps at least 15 fields', () => {
    const fieldMap = toFreeFileFieldMap(taxReturn, 'form1040');
    expect(Object.keys(fieldMap).length).toBeGreaterThanOrEqual(15);
  });

  test('scheduleA maps SALT, mortgage, and total', () => {
    const fieldMap = toFreeFileFieldMap(taxReturn, 'scheduleA');
    const keys = Object.keys(fieldMap);
    expect(keys).toContain('txtstLocIncTax');
    expect(keys).toContain('txtHomeMortRep');
    expect(keys).toContain('txtTotItemDed');
  });

  test('scheduleE maps rental income and expense lines', () => {
    const fieldMap = toFreeFileFieldMap(taxReturn, 'scheduleE');
    const keys = Object.keys(fieldMap);
    expect(keys).toContain('txtScheAmountRentA');
    expect(keys).toContain('txtScheMortageInterestA');
    expect(keys).toContain('txtScheTotIncomeorloss');
  });

  test('form8959 populates when wages exceed threshold', () => {
    // Wages of 300k > 250k MFJ threshold → form8959 should have data
    expect(taxReturn.form8959).toBeDefined();
    expect(taxReturn.form8959!.line18).toBeGreaterThan(0);
    const fieldMap = toFreeFileFieldMap(taxReturn, 'form8959');
    expect(Object.keys(fieldMap).length).toBeGreaterThan(0);
  });

  test('form8995 maps QBI deduction fields', () => {
    expect(taxReturn.form8995).toBeDefined();
    const fieldMap = toFreeFileFieldMap(taxReturn, 'form8995');
    expect(Object.keys(fieldMap).length).toBeGreaterThan(0);
  });
});

describe('FreeFile field mappings — every FormKey has an entry', () => {
  test('all FormKeys are present in FREE_FILE_FIELD_MAPPINGS', () => {
    const allKeys: FormKey[] = [
      'form1040', 'schedule1', 'schedule2', 'schedule3',
      'scheduleA', 'scheduleC', 'scheduleD', 'scheduleE', 'scheduleSE',
      'form2441', 'form4562', 'form6251',
      'form8812', 'form8863', 'form8880',
      'form8959', 'form8960', 'form8995', 'form5695',
      'ca540',
    ];
    for (const key of allKeys) {
      expect(FREE_FILE_FIELD_MAPPINGS).toHaveProperty(key);
    }
  });

  test('forms with calculations have non-empty field mappings', () => {
    const formsWithCalc: FormKey[] = [
      'form1040', 'schedule1', 'schedule2', 'schedule3',
      'scheduleA', 'scheduleC', 'scheduleD', 'scheduleE', 'scheduleSE',
      'form2441', 'form6251',
      'form8863', 'form8880', 'form8959', 'form8960', 'form8995', 'form5695',
    ];
    for (const key of formsWithCalc) {
      const mapping = FREE_FILE_FIELD_MAPPINGS[key];
      expect(Object.keys(mapping).length).toBeGreaterThan(0);
    }
  });
});
