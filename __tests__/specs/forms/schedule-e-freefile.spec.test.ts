/**
 * Spec: Schedule E FreeFile field mappings — 1099 checkbox and QBI name format
 *
 * Status: active
 * Confirm: Schedule E 1099 "No" checkbox maps correctly, and Form 8995 business
 *          name includes full qualified address with "Schedule E:" prefix.
 * Invalidate: FreeFile checkbox id changes or QBI name format requirements change.
 */

import { FREE_FILE_FIELD_MAPPINGS } from '@selftax/core/forms/freeFileFieldMappings';
import { buildTaxReturn } from '@selftax/core/forms/buildTaxReturn';
import { toFreeFileFieldMap } from '@selftax/core/forms';
import { calculateForm1040 } from '@selftax/core/engine/form1040';
import { calculateScheduleE } from '@selftax/core/engine/scheduleE';
import type { FormKey } from '@selftax/core/forms/pdfFieldMappings';

function buildRentalReturn() {
  const seInput = {
    grossRentalIncome: 120000,
    insurance: 6000,
    mortgageInterest: 40000,
    propertyTaxes: 17000,
    depreciation: 31000,
  };
  const seOutput = calculateScheduleE(seInput, { agi: 200000, activeParticipant: true });
  const f1040 = calculateForm1040({
    filingStatus: 'mfj',
    wages: 200000,
    rentalIncome: seOutput.amountFor1040,
    qbiIncome: seOutput.amountFor1040 > 0 ? seOutput.amountFor1040 : undefined,
    federalWithholding: 40000,
  });

  return buildTaxReturn({
    taxYear: 2025,
    filingStatus: 'mfj',
    pii: {
      primary: { firstName: 'Jane', lastName: 'Doe', ssn: '000-00-0000' },
      dependents: [],
      address: { street: '123 Home St', city: 'Test', state: 'CA', zip: '90000' },
      filingStatus: 'mfj',
    },
    form1040: f1040,
    wages: 200000,
    qbiDeduction: f1040.qbiDeduction,
    qbiIncome: seOutput.amountFor1040 > 0 ? seOutput.amountFor1040 : undefined,
    rentalProperties: [{
      address: '718 MAPLE DR',
      city: 'Testville',
      state: 'CA',
      zip: '94544',
      propertyType: '2',
      fairRentalDays: 365,
      personalUseDays: 0,
      input: seInput,
      output: seOutput,
    }],
    scheduleEAggregate: seOutput,
  });
}

describe('Schedule E 1099 checkbox', () => {
  test('mapping targets chkMakePay1099IndNo (by id, not by name)', () => {
    /** FreeFile uses id="chkMakePay1099IndNo" for the No checkbox.
     *  The name attribute is "chkMakePay1099Ind" which is the Yes checkbox.
     *  Our mapping must use the id so findInputElement finds it via getElementById. */
    const mapping = FREE_FILE_FIELD_MAPPINGS['scheduleE' as FormKey];
    const fields = Object.values(mapping);
    expect(fields).toContain('chkMakePay1099IndNo');
  });

  test('no1099 resolves from properties.0.no1099 path', () => {
    /** The no1099 boolean lives on ScheduleEProperty (inside properties array),
     *  not on the top-level ScheduleEData. Path must be scheduleE.properties.0.no1099. */
    const mapping = FREE_FILE_FIELD_MAPPINGS['scheduleE' as FormKey];
    const paths = Object.keys(mapping);
    expect(paths).toContain('scheduleE.properties.0.no1099');
  });

  test('toFreeFileFieldMap produces chkMakePay1099IndNo: 1', () => {
    const taxReturn = buildRentalReturn();
    const fields = toFreeFileFieldMap(taxReturn, 'scheduleE' as FormKey);
    // Boolean true → 1 for checkbox
    expect(fields.chkMakePay1099IndNo).toBe(1);
  });
});

describe('Form 8995 QBI business name', () => {
  test('business name includes "Schedule E:" prefix with full address', () => {
    /** IRS Form 8995 line 1(i) should show the qualified business description
     *  in the format: "Schedule E: 718 MAPLE DR, Testville, CA 94544" */
    const taxReturn = buildRentalReturn();
    const fields = toFreeFileFieldMap(taxReturn, 'form8995' as FormKey);
    const name = fields.txtBusiActivityName1;
    expect(name).toBeDefined();
    expect(String(name)).toContain('Schedule E:');
    expect(String(name)).toContain('718 MAPLE DR');
    expect(String(name)).toContain('Testville');
    expect(String(name)).toContain('CA 94544');
  });

  test('business name falls back gracefully without city/state/zip', () => {
    /** If rental property has only an address (no city/state/zip),
     *  the name should still work without trailing commas. */
    const seInput = { grossRentalIncome: 50000, depreciation: 10000 };
    const seOutput = calculateScheduleE(seInput, { agi: 100000, activeParticipant: true });
    const f1040 = calculateForm1040({
      filingStatus: 'single', wages: 100000,
      rentalIncome: seOutput.amountFor1040,
      qbiIncome: seOutput.amountFor1040 > 0 ? seOutput.amountFor1040 : undefined,
      federalWithholding: 20000,
    });
    const taxReturn = buildTaxReturn({
      taxYear: 2025, filingStatus: 'single',
      pii: { primary: { firstName: 'J', lastName: 'D', ssn: '000-00-0000' }, dependents: [], address: { street: '', city: '', state: 'CA', zip: '' }, filingStatus: 'single' },
      form1040: f1040, wages: 100000,
      qbiDeduction: f1040.qbiDeduction,
      qbiIncome: seOutput.amountFor1040 > 0 ? seOutput.amountFor1040 : undefined,
      rentalProperties: [{ address: '99 Simple St', propertyType: '1', fairRentalDays: 365, personalUseDays: 0, input: seInput, output: seOutput }],
      scheduleEAggregate: seOutput,
    });

    const fields = toFreeFileFieldMap(taxReturn, 'form8995' as FormKey);
    expect(String(fields.txtBusiActivityName1)).toContain('Schedule E: 99 Simple St');
  });
});
